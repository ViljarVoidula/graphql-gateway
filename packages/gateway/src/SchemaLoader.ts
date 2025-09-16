import { isAsyncIterable } from '@graphql-tools/utils';
import {
  buildClientSchema,
  ExecutionResult,
  getIntrospectionQuery,
  GraphQLSchema,
  IntrospectionQuery,
  parse,
  printSchema
} from 'graphql';
import { dataSource } from './db/datasource';
import { SchemaChange, SchemaChangeClassification } from './entities/schema-change.entity';
import { Service, ServiceStatus } from './entities/service.entity';
import { buildHMACExecutor } from './utils/hmacExecutor';
import { log } from './utils/logger';
import { classifyDiff, diffSchemas, semanticClassify } from './utils/schema-diff';
import { healthMonitor } from './utils/service-health';

interface LoadedEndpoint {
  url: string;
  sdl: string;
  useMsgPack?: boolean; // capability flag sourced from Service table
}

interface EndpointCache {
  endpoints: string[];
  lastUpdated: number;
}

// Cache for endpoint loading with TTL
export const endpointCache = new WeakMap<SchemaLoader, EndpointCache>();
const ENDPOINT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes for endpoints

// Schema cache for individual endpoints
export const schemaCache = new Map<string, { sdl: string; lastUpdated: number }>();
const SCHEMA_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for individual schemas

export class SchemaLoader {
  public schema: GraphQLSchema | null = null;
  public loadedEndpoints: LoadedEndpoint[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  // Flag & promise to coordinate concurrent reload calls so that
  // only one network fetch cycle occurs at a time and existing
  // schema keeps being served while a refresh is in flight.
  private reloading: Promise<GraphQLSchema | null> | null = null;

  private endpointLoader?: () => Promise<string[]>;

  constructor(
    private buildSchema: (endpoints: LoadedEndpoint[]) => GraphQLSchema,
    public endpoints: string[]
  ) {}

  async reload() {
    // If a reload is already in progress, reuse its promise so callers
    // immediately get the currently active schema while awaiting the
    // eventual new one. This prevents dropping the active schema.
    if (this.reloading) {
      log.debug('Reload requested while one in progress; returning existing schema');
      return this.schema; // Serve current schema; background promise will complete.
    }

    // Start a new reload cycle
    this.reloading = (async () => {
      // Load endpoints dynamically if a loader is set
      const endpoints = await this.loadEndpoints();

      const loadedEndpoints: LoadedEndpoint[] = [];
      await Promise.all(
        endpoints.map(async (url) => {
          log.debug(`Loading schema from ${url}`);

          // Check schema cache first
          const now = Date.now();
          const cachedSchema = schemaCache.get(url);
          // If service is currently unhealthy and backoff says skip, try to use cache and skip fetch
          if (!healthMonitor.shouldAttempt(url)) {
            log.warn('Skipping schema fetch due to backoff (service unhealthy)', {
              operation: 'schemaLoader.reload',
              metadata: { url, nextRetryInMs: healthMonitor.nextRetryDelay(url) }
            });
            if (cachedSchema) {
              // Include any known capability flags
              let useMsgPack: boolean | undefined;
              try {
                const serviceRepo = dataSource.getRepository(Service);
                const svc = await serviceRepo.findOne({ where: { url } });
                useMsgPack = svc?.useMsgPack;
              } catch {}
              loadedEndpoints.push({ url, sdl: cachedSchema.sdl, useMsgPack });
            }
            return;
          }
          if (cachedSchema && now - cachedSchema.lastUpdated < SCHEMA_CACHE_TTL) {
            log.debug(`Using cached schema for ${url}`);
            loadedEndpoints.push({ url, sdl: cachedSchema.sdl });
            return;
          }

          try {
            log.debug(`Fetching SDL from ${url}`);
            const introspectionQuery = getIntrospectionQuery();
            const executor = buildHMACExecutor({ endpoint: url, timeout: 1500, enableHMAC: false });
            const maybeResult = await executor({ document: parse(introspectionQuery) });
            let result: ExecutionResult<IntrospectionQuery>;
            if (isAsyncIterable(maybeResult)) {
              const iterator = maybeResult[Symbol.asyncIterator]();
              const { value } = await iterator.next();
              result = value as ExecutionResult<IntrospectionQuery>;
            } else {
              result = maybeResult as ExecutionResult<IntrospectionQuery>;
            }
            const data = result.data;
            if (!data || !data.__schema) {
              throw new Error(`Invalid SDL response from ${url}`);
            }

            const sdl = printSchema(buildClientSchema(data));
            // fetch useMsgPack from service table (best effort)
            let useMsgPack: boolean | undefined;
            try {
              const serviceRepo = dataSource.getRepository(Service);
              const svc = await serviceRepo.findOne({ where: { url } });
              useMsgPack = svc?.useMsgPack;
            } catch {}
            loadedEndpoints.push({ url, sdl, useMsgPack });

            // Health success
            const recovered = healthMonitor.recordSuccess(url);
            if (recovered) {
              // Persist status ACTIVE on recovery
              try {
                const repo = dataSource.getRepository(Service);
                const svc = await repo.findOne({ where: { url } });
                // Only flip from INACTIVE -> ACTIVE automatically; respect MAINTENANCE
                if (svc && svc.status === ServiceStatus.INACTIVE) await repo.update(svc.id, { status: ServiceStatus.ACTIVE });
              } catch (e) {
                log.warn('Failed to persist service recovery status', e);
              }
            }

            // Persist change if SDL differs from saved service.sdl
            try {
              const serviceRepo = dataSource.getRepository(Service);
              const changeRepo = dataSource.getRepository(SchemaChange);
              const service = await serviceRepo.findOne({ where: { url } });
              if (service) {
                const diff = diffSchemas(service.sdl, sdl);
                if (diff) {
                  // Simple heuristic: if any removed lines (- ) exist => breaking, else non_breaking
                  // Combine semantic + textual heuristics (semantic overrides to BREAKING if detected)
                  let classification = classifyDiff(diff.diff);
                  const semantic = semanticClassify(service.sdl, sdl);
                  if (semantic === SchemaChangeClassification.BREAKING) classification = semantic;

                  await changeRepo.insert({
                    serviceId: service.id,
                    previousHash: diff.previousHash,
                    newHash: diff.newHash,
                    diff: diff.diff,
                    schemaSDL: sdl,
                    classification
                  });
                  // Update service current SDL snapshot
                  service.sdl = sdl;
                  await serviceRepo.save(service);
                  log.info(`Recorded schema change for service ${service.name}`);
                }
              }
            } catch (e) {
              log.error('Failed to record schema change', e);
            }

            // Update schema cache
            schemaCache.set(url, { sdl, lastUpdated: now });
          } catch (err) {
            log.error(`Failed to load schema from ${url}:`, err);
            // Health failure
            const becameUnhealthy = healthMonitor.recordFailure(url, err);
            if (becameUnhealthy) {
              // Persist status INACTIVE when transitioning to unhealthy
              try {
                const repo = dataSource.getRepository(Service);
                const svc = await repo.findOne({ where: { url } });
                // Only flip from ACTIVE -> INACTIVE automatically; respect MAINTENANCE
                if (svc && svc.status === ServiceStatus.ACTIVE) await repo.update(svc.id, { status: ServiceStatus.INACTIVE });
              } catch (e) {
                log.warn('Failed to persist service unhealthy status', e);
              }
            }

            // Try to use cached schema even if expired
            if (cachedSchema) {
              log.warn(`Using expired cached schema for ${url}`);
              // Attempt to still include useMsgPack flag via service lookup
              let useMsgPack: boolean | undefined;
              try {
                const serviceRepo = dataSource.getRepository(Service);
                const svc = await serviceRepo.findOne({ where: { url } });
                useMsgPack = svc?.useMsgPack;
              } catch {}
              loadedEndpoints.push({ url, sdl: cachedSchema.sdl, useMsgPack });
            } else {
              log.warn(`No cached schema available for ${url}, skipping`);
            }
          }
        })
      );

      // Only swap in the new schema if we actually managed to build at least the local part;
      // buildSchema always returns a schema (local + any successfully fetched remote services).
      try {
        this.loadedEndpoints = loadedEndpoints;
        const newSchema = this.buildSchema(this.loadedEndpoints);
        this.schema = newSchema;
        log.debug(`gateway reload ${new Date().toLocaleString()}, endpoints: ${this.loadedEndpoints.length}`);
      } catch (err) {
        // Keep old schema if build failed
        log.error('Failed to build stitched schema; keeping previous schema', err);
      }
      return this.schema;
    })();

    try {
      return await this.reloading;
    } finally {
      this.reloading = null; // Allow future reloads
    }
  }

  autoRefresh(interval = 3000) {
    this.stopAutoRefresh();
    this.intervalId = setTimeout(async () => {
      log.debug(`Refreshing schema every ${interval}ms`);
      await this.reload();

      // Clean up expired cache entries periodically
      this.cleanupExpiredCache();

      this.intervalId = null;
      this.autoRefresh(interval);
    }, interval);
  }

  stopAutoRefresh() {
    if (this.intervalId != null) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  // Provide a stable accessor; useful if we later change internal handling.
  getCurrentSchema(): GraphQLSchema | null {
    return this.schema;
  }

  setEndpointLoader(loader: () => Promise<string[]>) {
    this.endpointLoader = loader;
  }

  async loadEndpoints(): Promise<string[]> {
    const now = Date.now();

    // Check cache first
    const cached = endpointCache.get(this);
    if (cached && now - cached.lastUpdated < ENDPOINT_CACHE_TTL) {
      log.debug('Using cached endpoints from SchemaLoader');
      return cached.endpoints;
    }

    if (this.endpointLoader) {
      try {
        const endpoints = await this.endpointLoader();
        // Filter out any internal endpoints (e.g. internal://gateway) that should not be introspected
        const filtered = endpoints.filter((e) => !e.startsWith('internal://'));
        if (filtered.length !== endpoints.length) {
          log.debug('Filtered internal endpoints from dynamic endpoint list', {
            operation: 'schemaLoader.loadEndpoints',
            metadata: {
              original: endpoints,
              filtered
            }
          });
        }
        this.endpoints = filtered;

        // Update cache on successful load
        endpointCache.set(this, {
          endpoints: this.endpoints,
          lastUpdated: now
        });

        log.debug(`Loaded ${this.endpoints.length} endpoints dynamically (cached)`);
        return this.endpoints;
      } catch (error) {
        log.error('Failed to load endpoints dynamically:', error);

        // Return cached endpoints if available, even if expired
        if (cached) {
          log.warn('Endpoint loader failed, using cached endpoints');
          return cached.endpoints;
        }
        debugger;
        // Fallback to static endpoints
        log.warn('No cached endpoints available, using static endpoints');
        return this.endpoints.filter((e) => !e.startsWith('internal://'));
      }
    }
    debugger;
    return this.endpoints.filter((e) => !e.startsWith('internal://'));
  }

  cleanupExpiredCache() {
    const now = Date.now();

    // Clean up expired schema cache entries
    for (const [url, cache] of schemaCache.entries()) {
      if (now - cache.lastUpdated > SCHEMA_CACHE_TTL * 2) {
        // Keep expired entries for 2x TTL
        schemaCache.delete(url);
        log.debug(`Cleaned up expired schema cache for ${url}`);
      }
    }
  }

  // Runtime metrics for monitoring
  getMetrics() {
    return {
      loadedEndpoints: this.loadedEndpoints.length,
      schemaCacheSize: schemaCache.size,
      endpointCacheSize: endpointCache.has(this) ? 1 : 0,
      hasSchema: !!this.schema
    };
  }
}
