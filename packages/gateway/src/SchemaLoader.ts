import { isAsyncIterable } from '@graphql-tools/utils';
import {
  buildClientSchema,
  ExecutionResult,
  getIntrospectionQuery,
  GraphQLSchema,
  IntrospectionQuery,
  parse,
  printSchema,
} from 'graphql';
import { Container } from 'typedi';
import { In } from 'typeorm';
import { dataSource } from './db/datasource';
import {
  SchemaChange,
  SchemaChangeClassification,
} from './entities/schema-change.entity';
import { Service, ServiceStatus } from './entities/service.entity';
import { PermissionService } from './services/permissions/permission.service';
import { buildHMACExecutor } from './utils/hmacExecutor';
import { log } from './utils/logger';
import {
  classifyDiff,
  diffSchemas,
  semanticClassify,
} from './utils/schema-diff';
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
export const schemaCache = new Map<
  string,
  { sdl: string; lastUpdated: number }
>();
const SCHEMA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for individual schemas (reduced for more frequent updates)
const SCHEMA_CACHE_CLEANUP_TTL = 30 * 60 * 1000; // 30 minutes before cleaning up expired entries

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
      log.debug(
        'Reload requested while one in progress; returning existing schema'
      );
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

          // Helper function to get useMsgPack flag from service table
          const getUseMsgPackFlag = async (): Promise<boolean | undefined> => {
            try {
              const serviceRepo = dataSource.getRepository(Service);
              const svc = await serviceRepo.findOne({ where: { url } });
              return svc?.useMsgPack;
            } catch {
              return undefined;
            }
          };

          const forceBypass =
            process.env?.FORCE_SCHEMA_RELOAD_BYPASS_CACHE ?? '1';

          // If service is currently unhealthy and backoff says skip, use cache only
          if (!healthMonitor.shouldAttempt(url)) {
            log.warn(
              'Skipping schema fetch due to backoff (service unhealthy)',
              {
                operation: 'schemaLoader.reload',
                metadata: {
                  url,
                  nextRetryInMs: healthMonitor.nextRetryDelay(url),
                },
              }
            );
            if (cachedSchema) {
              const useMsgPack = await getUseMsgPackFlag();
              loadedEndpoints.push({ url, sdl: cachedSchema.sdl, useMsgPack });
            }
            return;
          }

          try {
            log.debug(`Fetching SDL from ${url}`);
            const introspectionQuery = getIntrospectionQuery();
            const executor = buildHMACExecutor({
              endpoint: url,
              timeout: 1500,
              enableHMAC: false,
            });
            const maybeResult = await executor({
              document: parse(introspectionQuery),
              // Attach a per-request random header via context so downstream (if instrumented) can show it.
              context: {
                internalIntrospection: true, // signals executor to bypass downstream auth enforcement
                req: {
                  headers: {
                    'x-gateway-schema-reload': '1',
                    'x-gateway-reload-rand': Math.random()
                      .toString(36)
                      .slice(2),
                    'x-internal-introspection': '1',
                    'cache-control': 'no-cache, no-store, must-revalidate',
                    pragma: 'no-cache',
                    expires: '0',
                  },
                },
              },
            });
            let result: ExecutionResult<IntrospectionQuery>;
            if (isAsyncIterable(maybeResult)) {
              const iterator = maybeResult[Symbol.asyncIterator]();
              const { value } = await iterator.next();
              result = value as ExecutionResult<IntrospectionQuery>;
            } else {
              result = maybeResult as ExecutionResult<IntrospectionQuery>;
            }
            const data = result.data;
            log.debug(`Introspection result for ${url}:`, {
              hasData: !!data,
              hasSchema: !!(data && data.__schema),
              resultKeys: data ? Object.keys(data) : [],
              errorCount: result.errors ? result.errors.length : 0,
              errors: result.errors,
            });
            if (!data || !data.__schema) {
              log.error(`Invalid SDL response details for ${url}:`, {
                data,
                errors: result.errors,
                result: result,
              });
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

            // Health success (record + unconditional promotion of any INACTIVE services with this URL)
            healthMonitor.recordSuccess(url);
            try {
              const repo = dataSource.getRepository(Service);
              const svcs = await repo.find({ where: { url } });
              if (!svcs.length) {
                log.warn(
                  'No service entities found for URL on success; cannot promote status',
                  {
                    operation: 'schemaLoader.statusPromotion',
                    metadata: { url },
                  }
                );
              }
              for (const svc of svcs) {
                if (svc.status === ServiceStatus.INACTIVE) {
                  log.debug(
                    'Promoting service status INACTIVE -> ACTIVE after successful introspection',
                    {
                      operation: 'schemaLoader.statusPromotion',
                      metadata: { url, serviceId: svc.id },
                    }
                  );
                  await repo.update(svc.id, { status: ServiceStatus.ACTIVE });
                } else {
                  log.debug(
                    'Service not INACTIVE on success; leaving status as-is',
                    {
                      operation: 'schemaLoader.statusPromotion',
                      metadata: {
                        url,
                        serviceId: svc.id,
                        currentStatus: svc.status,
                      },
                    }
                  );
                }
              }
            } catch (e) {
              log.warn('Failed to persist service recovery status', e);
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
                  if (semantic === SchemaChangeClassification.BREAKING)
                    classification = semantic;

                  await changeRepo.insert({
                    serviceId: service.id,
                    previousHash: diff.previousHash,
                    newHash: diff.newHash,
                    diff: diff.diff,
                    schemaSDL: sdl,
                    classification,
                  });
                  // Update service current SDL snapshot
                  service.sdl = sdl;
                  await serviceRepo.save(service);
                  log.info(
                    `Recorded schema change for service ${service.name}`
                  );
                }
              }
            } catch (e) {
              log.error('Failed to record schema change', e);
            }

            // Update schema cache unless forced bypass
            if (!forceBypass) schemaCache.set(url, { sdl, lastUpdated: now });
          } catch (err) {
            log.error(`Failed to load schema from ${url}:`, err);
            // Health failure (record + unconditional demotion of any ACTIVE services with this URL)
            healthMonitor.recordFailure(url, err);
            try {
              const repo = dataSource.getRepository(Service);
              const svcs = await repo.find({ where: { url } });
              if (!svcs.length) {
                log.warn(
                  'No service entities found for URL on failure; cannot demote status',
                  {
                    operation: 'schemaLoader.statusDemotion',
                    metadata: { url },
                  }
                );
              }
              for (const svc of svcs) {
                if (svc.status === ServiceStatus.ACTIVE) {
                  log.debug(
                    'Demoting service status ACTIVE -> INACTIVE after consecutive failures',
                    {
                      operation: 'schemaLoader.statusDemotion',
                      metadata: { url, serviceId: svc.id },
                    }
                  );
                  await repo.update(svc.id, { status: ServiceStatus.INACTIVE });
                } else {
                  log.debug(
                    'Service not ACTIVE during failure; leaving status as-is',
                    {
                      operation: 'schemaLoader.statusDemotion',
                      metadata: {
                        url,
                        serviceId: svc.id,
                        currentStatus: svc.status,
                      },
                    }
                  );
                }
              }
            } catch (e) {
              log.warn('Failed to persist service unhealthy status', e);
            }

            // Try to use cached schema even if expired (unless forced bypass)
            if (!forceBypass && cachedSchema) {
              const cacheAge = now - cachedSchema.lastUpdated;
              log.warn(
                `Using expired cached schema for ${url} (age: ${Math.round(cacheAge / 1000)}s)`
              );
              const useMsgPack = await getUseMsgPackFlag();
              loadedEndpoints.push({ url, sdl: cachedSchema.sdl, useMsgPack });
            } else {
              log.warn(
                `No cached schema available for ${url}, skipping service`
              );
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

        // Sync permissions with the new schema
        await this.syncPermissionsWithSchema(this.loadedEndpoints, this.schema);

        log.debug(
          `gateway reload ${new Date().toLocaleString()}, endpoints: ${this.loadedEndpoints.length}, cached: ${schemaCache.size} schemas`
        );
      } catch (err) {
        // Keep old schema if build failed
        log.error(
          'Failed to build stitched schema; keeping previous schema',
          err
        );
      }
      return this.schema;
    })();

    try {
      return await this.reloading;
    } finally {
      this.reloading = null; // Allow future reloads
    }
  }

  private async syncPermissionsWithSchema(
    loadedEndpoints: LoadedEndpoint[],
    schema: GraphQLSchema | null
  ) {
    if (!dataSource.isInitialized) return;

    let permissionService: PermissionService | null = null;
    try {
      permissionService = Container.get(PermissionService);
    } catch (err) {
      log.debug('PermissionService not available during schema sync', {
        operation: 'schemaLoader.permissionSync',
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }

    if (loadedEndpoints.length) {
      try {
        const urls = Array.from(
          new Set(loadedEndpoints.map((endpoint) => endpoint.url))
        );
        const serviceRepo = dataSource.getRepository(Service);
        const services = await serviceRepo.find({ where: { url: In(urls) } });
        const serviceByUrl = new Map(services.map((svc) => [svc.url, svc]));

        for (const endpoint of loadedEndpoints) {
          const service = serviceByUrl.get(endpoint.url);
          if (!service) continue;
          try {
            await permissionService.syncServicePermissions(
              service,
              endpoint.sdl
            );
          } catch (error) {
            log.warn('Failed to sync service permissions from SDL', {
              operation: 'schemaLoader.permissionSync.service',
              error: error instanceof Error ? error : new Error(String(error)),
              metadata: { serviceId: service.id, serviceUrl: service.url },
            });
          }
        }
      } catch (error) {
        log.warn(
          'Failed to synchronize service permissions for stitched schema',
          {
            operation: 'schemaLoader.permissionSync.bulk',
            error: error instanceof Error ? error : new Error(String(error)),
          }
        );
      }
    }

    if (schema) {
      try {
        await permissionService.syncLocalSchemaPermissions(schema);
      } catch (error) {
        log.warn('Failed to synchronize local schema permissions', {
          operation: 'schemaLoader.permissionSync.local',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }

  autoRefresh(interval = 3000) {
    this.stopAutoRefresh();
    log.debug(`Starting auto-refresh with ${interval}ms interval`);
    this.intervalId = setInterval(async () => {
      try {
        log.debug(`Auto-refreshing schema (interval: ${interval}ms)`);
        await this.reload();

        // Clean up expired cache entries periodically
        this.cleanupExpiredCache();
      } catch (error) {
        log.error('Auto-refresh failed:', error);
      }
    }, interval);
  }

  stopAutoRefresh() {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.debug('Stopped auto-refresh');
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
              filtered,
            },
          });
        }
        this.endpoints = filtered;

        // Update cache on successful load
        endpointCache.set(this, {
          endpoints: this.endpoints,
          lastUpdated: now,
        });

        log.debug(
          `Loaded ${this.endpoints.length} endpoints dynamically (cached)`
        );
        return this.endpoints;
      } catch (error) {
        log.error('Failed to load endpoints dynamically:', error);

        // Return cached endpoints if available, even if expired
        if (cached) {
          log.warn('Endpoint loader failed, using cached endpoints');
          return cached.endpoints;
        }
        // no-op
        // Fallback to static endpoints
        log.warn('No cached endpoints available, using static endpoints');
        return this.endpoints.filter((e) => !e.startsWith('internal://'));
      }
    }
    // no-op
    return this.endpoints.filter((e) => !e.startsWith('internal://'));
  }

  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    // Clean up very old schema cache entries (keep for fallback longer than normal TTL)
    for (const [url, cache] of schemaCache.entries()) {
      if (now - cache.lastUpdated > SCHEMA_CACHE_CLEANUP_TTL) {
        schemaCache.delete(url);
        cleanedCount++;
        log.debug(
          `Cleaned up expired schema cache for ${url} (age: ${Math.round((now - cache.lastUpdated) / 1000)}s)`
        );
      }
    }

    if (cleanedCount > 0) {
      log.debug(
        `Cache cleanup completed: removed ${cleanedCount} entries, ${schemaCache.size} remaining`
      );
    }
  }

  // Runtime metrics for monitoring
  getMetrics() {
    const now = Date.now();
    const cacheStats = Array.from(schemaCache.entries()).map(
      ([url, cache]) => ({
        url,
        ageMs: now - cache.lastUpdated,
        expired: now - cache.lastUpdated > SCHEMA_CACHE_TTL,
      })
    );

    return {
      loadedEndpoints: this.loadedEndpoints.length,
      schemaCacheSize: schemaCache.size,
      endpointCacheSize: endpointCache.has(this) ? 1 : 0,
      hasSchema: !!this.schema,
      autoRefreshActive: !!this.intervalId,
      cacheStats,
      cacheTtlMs: SCHEMA_CACHE_TTL,
      endpointCacheTtlMs: ENDPOINT_CACHE_TTL,
    };
  }
}
