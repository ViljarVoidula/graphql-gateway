import { createServer, Server } from 'http';
import { buildSchema, GraphQLSchema } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { SubschemaConfig } from '@graphql-tools/delegate';
import { buildHMACExecutor } from './utils/hmacExecutor';
import { stitchSchemas } from '@graphql-tools/stitch';
import { stitchingDirectives } from '@graphql-tools/stitching-directives';
import { SchemaLoader } from './SchemaLoader';
import { makeEndpointsSchema } from './services/endpoints';
import { keyManager } from './security/keyManager';
import { dataSource } from './db/datasource';
import { initializeRedis } from './auth/session.config';
import { useSession } from './auth/session.plugin';
import { Container } from 'typedi';
import { User } from './services/users/user.entity';
import { Session } from './entities/session.entity';
import { Service } from './entities/service.entity';
import { ServiceKey } from './entities/service-key.entity';
import { SessionService } from './services/session.service';
import { ServiceRegistryService, ServiceCacheManager } from './services/service-registry/service-registry.service';
import { log } from './utils/logger';
import "reflect-metadata";

const { stitchingDirectivesTransformer } = stitchingDirectives();

// Service endpoint cache using Map for better control
export const serviceEndpointCache = new Map<string, { endpoints: string[], lastUpdated: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

async function loadServicesFromDatabase(): Promise<string[]> {
  const cacheKey = 'services';
  const now = Date.now();
  
  // Check cache first
  const cached = serviceEndpointCache.get(cacheKey);
  if (cached && (now - cached.lastUpdated) < CACHE_TTL) {
    log.debug('Using cached service endpoints', {
      operation: 'loadServicesFromDatabase',
      metadata: { source: 'cache', endpointCount: cached.endpoints.length }
    });
    return cached.endpoints;
  }
  
  try {
    const serviceRegistry = Container.get(ServiceRegistryService);
    const services = await serviceRegistry.getAllServices();
    const endpoints = services.map(service => service.url);
    
    // Update cache on successful fetch
    serviceEndpointCache.set(cacheKey, {
      endpoints,
      lastUpdated: now
    });
    
    log.debug('Loaded services from database', {
      operation: 'loadServicesFromDatabase',
      metadata: { source: 'database', endpointCount: endpoints.length, cached: true }
    });
    return endpoints;
  } catch (error) {
    log.error('Failed to load services from database', {
      operation: 'loadServicesFromDatabase',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { source: 'database' }
    });
    
    // Return cached endpoints if available, even if expired
    if (cached) {
      log.warn('Database unavailable, using cached service endpoints', {
        operation: 'loadServicesFromDatabase',
        metadata: { source: 'cache', fallback: true, endpointCount: cached.endpoints.length }
      });
      return cached.endpoints;
    }
    
    // No cache available, return empty array
    log.warn('No cached services available, returning empty array', {
      operation: 'loadServicesFromDatabase',
      metadata: { source: 'fallback', endpointCount: 0 }
    });
    return [];
  }
}

// Clean up expired service cache entries
function cleanupServiceCache() {
  const now = Date.now();
  const cacheKey = 'services';
  const cached = serviceEndpointCache.get(cacheKey);
  
  if (cached && (now - cached.lastUpdated) > CACHE_TTL * 2) { // Keep expired entries for 2x TTL
    serviceEndpointCache.delete(cacheKey);
    log.debug('Cleaned up expired service cache', {
      operation: 'cleanupServiceCache',
      metadata: { source: 'cache' }
    });
  }
}

const loader = new SchemaLoader(
  function buildSchemaFromEndpoints(loadedEndpoints) {
    const subschemas: SubschemaConfig[] = loadedEndpoints.map(({ sdl, url }) => ({
      schema: buildSchema(sdl),
      executor: buildHMACExecutor({
        endpoint: url,
        timeout: 5000,
        enableHMAC: true,
      }),
      batch: true,
    }));

    subschemas.push(makeEndpointsSchema(loader));

    return stitchSchemas({
      subschemaConfigTransforms: [stitchingDirectivesTransformer],
      subschemas,
    });
  },
  [], // Will be populated after database connection
);

const server = createServer(
  createYoga({
    schema: () => loader.schema,
    maskedErrors: false,
    multipart: true,
    logging: 'debug',
    plugins: [
      useSession(), // Add session plugin
    ],
    graphiql: {
      title: 'GraphQL Gateway with Session Security',
    },
    context: async ({ request }) => {
      // Context will be extended by session plugin
      return { 
        request, 
        keyManager 
      };
    },
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true // Important for sessions
    },
  }),
);

export async function startServer() {
  const REFERSH_INTERVAL = process.env.REFRESH_INTERVAL
    ? parseInt(process.env.REFRESH_INTERVAL, 10)
    : 30_000;
  
  // Initialize dataSource before creating schema
  try {
    await dataSource.initialize();
    log.info('Database connection initialized successfully', {
      operation: 'startServer',
      metadata: { component: 'database' }
    });
  } catch (error) {
    log.error('Failed to initialize database connection', {
      operation: 'startServer',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { component: 'database' }
    });
    throw error;
  }

  // Run migrations automatically in development and production
  if (process.env.NODE_ENV !== 'test') {
    try {
      const pendingMigrations = await dataSource.showMigrations();
      if (pendingMigrations) {
        log.info('Running pending migrations', {
          operation: 'startServer',
          metadata: { component: 'migrations' }
        });
        await dataSource.runMigrations();
        log.info('Migrations completed successfully', {
          operation: 'startServer',
          metadata: { component: 'migrations', status: 'completed' }
        });
      } else {
        log.info('No pending migrations', {
          operation: 'startServer',
          metadata: { component: 'migrations', status: 'up-to-date' }
        });
      }
    } catch (error) {
      log.error('Failed to run migrations', {
        operation: 'startServer',
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { component: 'migrations' }
      });
      throw error;
    }
  }

  // Initialize Redis for sessions
  try {
    await initializeRedis();
    log.info('Redis initialized for session storage', {
      operation: 'startServer',
      metadata: { component: 'redis' }
    });
  } catch (error) {
    log.error('Failed to initialize Redis', {
      operation: 'startServer',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { component: 'redis' }
    });
    throw error;
  }

  // Set up dependency injection
  Container.set('UserRepository', dataSource.getRepository(User));
  Container.set('SessionRepository', dataSource.getRepository(Session));
  Container.set('ServiceRepository', dataSource.getRepository(Service));
  Container.set('ServiceKeyRepository', dataSource.getRepository(ServiceKey));
  Container.set('SessionService', Container.get(SessionService));
  Container.set('ServiceRegistryService', Container.get(ServiceRegistryService));
  // JWTService is automatically registered via @Service() decorator

  // Load existing services into keyManager
  try {
    const serviceRegistryService = Container.get(ServiceRegistryService);
    await serviceRegistryService.loadServicesIntoKeyManager();
    log.info('Loaded existing services into key manager', {
      operation: 'startServer',
      metadata: { component: 'keyManager' }
    });
  } catch (error) {
    log.error('Failed to load services into key manager', {
      operation: 'startServer',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { component: 'keyManager' }
    });
  }

  // Load services from database and set them on the loader
  try {
    const serviceEndpoints = await loadServicesFromDatabase();
    loader.endpoints = serviceEndpoints;
    loader.setEndpointLoader(loadServicesFromDatabase);
    
    // Connect cache manager to the loader and cache
    ServiceCacheManager.setSchemaLoader(loader);
    ServiceCacheManager.setServiceCache(serviceEndpointCache);
    
    log.debug(`Loaded ${serviceEndpoints.length} services from database:`, serviceEndpoints);
  } catch (error) {
    log.error('Failed to load services from database:', error);
  }

  // Start periodic cleanup of expired keys and cache
  const KEY_CLEANUP_INTERVAL = process.env.KEY_CLEANUP_INTERVAL
    ? parseInt(process.env.KEY_CLEANUP_INTERVAL, 10)
    : 60_000; // 1 minute default
  
  const cleanupInterval = setInterval(() => {
    keyManager.cleanupExpiredKeys();
    cleanupServiceCache();
  }, KEY_CLEANUP_INTERVAL);

  // Start session cleanup (optional, Redis handles TTL automatically)
  const sessionCleanupInterval = setInterval(async () => {
    const sessionService = Container.get(SessionService);
    await sessionService.cleanupExpiredSessions();
  }, 60_000); // Clean up every minute
  
  // sleep 2s
  await loader.reload();
  await new Promise<void>(resolve => server.listen(4000, resolve));
  log.debug('Gateway started on http://localhost:4000');
  log.debug(`HMAC key cleanup will run every ${KEY_CLEANUP_INTERVAL} ms`);

  await loader.autoRefresh(REFERSH_INTERVAL);
  log.debug(`Gateway schema will refresh every ${REFERSH_INTERVAL} ms`);
  
  // Store cleanup intervals for stopping later
  (server as any).keyCleanupInterval = cleanupInterval;
  (server as any).sessionCleanupInterval = sessionCleanupInterval;
}

export async function stopServer() {
  loader.stopAutoRefresh();
  
  // Clear the key cleanup interval
  if ((server as any).keyCleanupInterval) {
    clearInterval((server as any).keyCleanupInterval);
  }

  // Clear the session cleanup interval
  if ((server as any).sessionCleanupInterval) {
    clearInterval((server as any).sessionCleanupInterval);
  }
  
  // Close database connection
  if (dataSource.isInitialized) {
    await dataSource.destroy();
    log.debug('Database connection closed');
  }
  
  await new Promise(resolve => server.close(resolve));
}
