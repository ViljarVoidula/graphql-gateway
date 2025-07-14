import { buildClientSchema, getIntrospectionQuery, GraphQLSchema, printSchema, parse, IntrospectionQuery, ExecutionResult } from 'graphql';
import { buildHMACExecutor } from './utils/hmacExecutor';
import { isAsyncIterable } from '@graphql-tools/utils';
import { log } from './utils/logger';

interface LoadedEndpoint {
  url: string;
  sdl: string;
}

interface EndpointCache {
  endpoints: string[];
  lastUpdated: number;
}

// Cache for endpoint loading with TTL
export const endpointCache = new WeakMap<SchemaLoader, EndpointCache>();
const ENDPOINT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes for endpoints

// Schema cache for individual endpoints
export const schemaCache = new Map<string, { sdl: string, lastUpdated: number }>();
const SCHEMA_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for individual schemas

export class SchemaLoader {
  public schema: GraphQLSchema | null = null;
  public loadedEndpoints: LoadedEndpoint[] = [];
  private intervalId: NodeJS.Timeout | null = null;

  private endpointLoader?: () => Promise<string[]>;

  constructor(
    private buildSchema: (endpoints: LoadedEndpoint[]) => GraphQLSchema,
    public endpoints: string[],
  ) {}

  async reload() {
    // Load endpoints dynamically if a loader is set
    const endpoints = await this.loadEndpoints();
    
    const loadedEndpoints: LoadedEndpoint[] = [];
    await Promise.all(
      endpoints.map(async url => {
        log.debug(`Loading schema from ${url}`);
        
        // Check schema cache first
        const now = Date.now();
        const cachedSchema = schemaCache.get(url);
        if (cachedSchema && (now - cachedSchema.lastUpdated) < SCHEMA_CACHE_TTL) {
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
          loadedEndpoints.push({ url, sdl });
          
          // Update schema cache
          schemaCache.set(url, { sdl, lastUpdated: now });
        } catch (err) {
          log.error(`Failed to load schema from ${url}:`, err);
          
          // Try to use cached schema even if expired
          if (cachedSchema) {
            log.warn(`Using expired cached schema for ${url}`);
            loadedEndpoints.push({ url, sdl: cachedSchema.sdl });
          } else {
            log.warn(`No cached schema available for ${url}, skipping`);
          }
        }
      }),
    );

    this.loadedEndpoints = loadedEndpoints;
    this.schema = this.buildSchema(this.loadedEndpoints);
    log.debug(
      `gateway reload ${new Date().toLocaleString()}, endpoints: ${this.loadedEndpoints.length}`,
    );
    return this.schema;
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
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setEndpointLoader(loader: () => Promise<string[]>) {
    this.endpointLoader = loader;
  }

  async loadEndpoints(): Promise<string[]> {
    const now = Date.now();
    
    // Check cache first
    const cached = endpointCache.get(this);
    if (cached && (now - cached.lastUpdated) < ENDPOINT_CACHE_TTL) {
      log.debug('Using cached endpoints from SchemaLoader');
      return cached.endpoints;
    }

    if (this.endpointLoader) {
      try {
        const endpoints = await this.endpointLoader();
        this.endpoints = endpoints;
        
        // Update cache on successful load
        endpointCache.set(this, {
          endpoints,
          lastUpdated: now
        });
        
        log.debug(`Loaded ${endpoints.length} endpoints dynamically (cached)`);
        return endpoints;
      } catch (error) {
        log.error('Failed to load endpoints dynamically:', error);
        
        // Return cached endpoints if available, even if expired
        if (cached) {
          log.warn('Endpoint loader failed, using cached endpoints');
          return cached.endpoints;
        }
        debugger
        // Fallback to static endpoints
        log.warn('No cached endpoints available, using static endpoints');
        return this.endpoints;
      }
    }
    debugger
    return this.endpoints;
  }

  cleanupExpiredCache() {
    const now = Date.now();
    
    // Clean up expired schema cache entries
    for (const [url, cache] of schemaCache.entries()) {
      if (now - cache.lastUpdated > SCHEMA_CACHE_TTL * 2) { // Keep expired entries for 2x TTL
        schemaCache.delete(url);
        log.debug(`Cleaned up expired schema cache for ${url}`);
      }
    }
  }
}
