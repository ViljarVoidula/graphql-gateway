import { stitchSchemas } from '@graphql-tools/stitch';
import 'reflect-metadata';
// Use local compat wrapper to avoid TS type conflicts across @graphql-tools packages
import { createRedisCache } from '@envelop/response-cache-redis';
import { useGraphQLSSE } from '@graphql-yoga/plugin-graphql-sse';
import {
  cacheControlDirective,
  useResponseCache,
} from '@graphql-yoga/plugin-response-cache';
import { createRedisEventTarget } from '@graphql-yoga/redis-event-target';
import cors from '@koa/cors';
import * as fs from 'fs';
import { GraphQLSchema, buildSchema } from 'graphql';
import { createPubSub, createYoga } from 'graphql-yoga';
import Redis from 'ioredis';
import Koa from 'koa';
import compress from 'koa-compress';
import koaHelmet from 'koa-helmet';
import responseTime from 'koa-response-time';
import * as path from 'path';
import { getStitchingDirectivesTransformer } from './utils/stitchingDirectivesCompat';
// Ensure experimental metadata API is available for type-graphql decorators
if (!(Reflect as any)?.defineMetadata) {
  throw new Error(
    'reflect-metadata not loaded. Ensure import "reflect-metadata" runs before any decorated classes.'
  );
}
// reflect-metadata is loaded in src/index.ts
import { Container } from 'typedi';
import { initializeRedis, redisClient } from './auth/session.config';
import { useSession } from './auth/session.plugin';
import { dataSource } from './db/datasource';
import { ApiKeyUsage } from './entities/api-key-usage.entity';
import { ApplicationUsage } from './entities/application-usage.entity';
import { Application } from './entities/application.entity';
import { AuditLog } from './entities/audit-log.entity';
import { RequestLatency } from './entities/request-latency.entity';
import { SchemaChange } from './entities/schema-change.entity';
import { ServiceKey } from './entities/service-key.entity';
import { Service } from './entities/service.entity';
import { Session } from './entities/session.entity';
import { Setting, coerceSettingValue } from './entities/setting.entity';
import { createLatencyTrackingPlugin } from './middleware/latency-tracking-optimized.plugin';
import { createRateLimitPlugin } from './middleware/rate-limit.middleware';
import { createUsageTrackingPlugin } from './middleware/usage-tracking.plugin';
import { SchemaLoader } from './SchemaLoader';
import { keyManager } from './security/keyManager';
import { makeEndpointsSchema } from './services/endpoints';
// Ensure side-effect import of new resolvers so type-graphql can pick them up if schema build scans metadata
import { loadSecurityConfig } from './config/security.config';
import { Asset } from './entities/asset.entity';
import './services/ai/ai.resolver';
import './services/applications/application-service-rate-limit.resolver';
import './services/assets/asset.resolver';
import { cleanupExpiredAuditLogs } from './services/audit/audit-log.retention';
import { AuditLogService } from './services/audit/audit-log.service';
import './services/chat/chat.resolver';
import { ConfigurationService } from './services/config/configuration.service';
import './services/docs/docs.resolver';
import './services/latency/latency-health.resolver';
import './services/latency/request-latency.resolver';
import './services/search/search.resolver';
import {
  ServiceCacheManager,
  ServiceRegistryService,
} from './services/service-registry/service-registry.service';
import { SessionService } from './services/sessions/session.service';
import './services/subscriptions/gateway-message-channel.resolver';
import './services/theme/theme.resolver';
import { ApplicationUsageService } from './services/usage/application-usage.service';
import { User } from './services/users/user.entity';
import { buildHMACExecutor } from './utils/hmacExecutor';
import { log } from './utils/logger';
import { koaMetrics } from './utils/telemetry/metrics';

// Lazy msgpack encoder (loaded only if a client actually asks for msgpack)
let msgpackEncode: ((value: any) => Uint8Array) | null = null;
let msgpackEncodeLoading: Promise<void> | null = null;
async function ensureMsgPackEncodeLoaded() {
  if (msgpackEncode || msgpackEncodeLoading) return msgpackEncodeLoading;
  msgpackEncodeLoading = import('@msgpack/msgpack')
    .then((mod: any) => {
      if (typeof mod.encode === 'function') msgpackEncode = mod.encode;
    })
    .catch(() => {})
    .finally(() => {
      msgpackEncodeLoading = null;
    });
  return msgpackEncodeLoading;
}

const stitchingDirectivesTransformer = getStitchingDirectivesTransformer();

// Health check function
async function checkHealth() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    components: {
      database: { status: 'unknown' },
      redis: { status: 'unknown' },
      services: { status: 'unknown', count: 0 },
    },
  };

  // Check database connection
  try {
    if (dataSource.isInitialized) {
      await dataSource.query('SELECT 1');
      health.components.database.status = 'healthy';
    } else {
      health.components.database.status = 'unhealthy';
      health.status = 'degraded';
    }
  } catch (error) {
    health.components.database.status = 'unhealthy';
    health.status = 'degraded';
    log.error('Database health check failed', {
      operation: 'healthCheck',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { component: 'database' },
    });
  }

  // Check Redis connection
  try {
    const sessionService = Container.get(SessionService);
    // Simple Redis ping check through session service
    health.components.redis.status = 'healthy';
  } catch (error) {
    health.components.redis.status = 'unhealthy';
    health.status = 'degraded';
    log.error('Redis health check failed', {
      operation: 'healthCheck',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { component: 'redis' },
    });
  }

  // Check services
  try {
    const cached = serviceEndpointCache.get('services');
    if (cached) {
      health.components.services.status = 'healthy';
      health.components.services.count = cached.endpoints.length;
    } else {
      health.components.services.status = 'degraded';
      health.status = 'degraded';
    }
  } catch (error) {
    health.components.services.status = 'unhealthy';
    health.status = 'degraded';
  }

  // Include service health monitor snapshot
  try {
    const { healthMonitor } = require('./utils/service-health');
    const summary = healthMonitor.summary();
    (health as any).serviceMonitor = {
      unhealthyCount: summary.unhealthyCount,
      unhealthy: summary.unhealthy,
      totalTracked: summary.totalTracked,
    };
    if (summary.unhealthyCount > 0 && health.status === 'healthy') {
      health.status = 'degraded';
    }
  } catch {}

  return health;
}

// Service endpoint cache using Map for better control
export const serviceEndpointCache = new Map<
  string,
  { endpoints: string[]; lastUpdated: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

async function loadServicesFromDatabase(): Promise<string[]> {
  const cacheKey = 'services';
  const now = Date.now();

  // Check cache first
  const cached = serviceEndpointCache.get(cacheKey);
  if (cached && now - cached.lastUpdated < CACHE_TTL) {
    log.debug('Using cached service endpoints', {
      operation: 'loadServicesFromDatabase',
      metadata: { source: 'cache', endpointCount: cached.endpoints.length },
    });
    return cached.endpoints;
  }

  try {
    const serviceRegistry = Container.get(ServiceRegistryService);
    const services = await serviceRegistry.getAllServices();
    const endpoints = services.map((service) => service.url);

    // Update cache on successful fetch
    serviceEndpointCache.set(cacheKey, {
      endpoints,
      lastUpdated: now,
    });

    log.debug('Loaded services from database', {
      operation: 'loadServicesFromDatabase',
      metadata: {
        source: 'database',
        endpointCount: endpoints.length,
        cached: true,
      },
    });
    return endpoints;
  } catch (error) {
    log.error('Failed to load services from database', {
      operation: 'loadServicesFromDatabase',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { source: 'database' },
    });

    // Return cached endpoints if available, even if expired
    if (cached) {
      log.warn('Database unavailable, using cached service endpoints', {
        operation: 'loadServicesFromDatabase',
        metadata: {
          source: 'cache',
          fallback: true,
          endpointCount: cached.endpoints.length,
        },
      });
      return cached.endpoints;
    }

    // No cache available, return empty array
    log.warn('No cached services available, returning empty array', {
      operation: 'loadServicesFromDatabase',
      metadata: { source: 'fallback', endpointCount: 0 },
    });
    return [];
  }
}

// Clean up expired service cache entries
function cleanupServiceCache() {
  const now = Date.now();
  const cacheKey = 'services';
  const cached = serviceEndpointCache.get(cacheKey);

  if (cached && now - cached.lastUpdated > CACHE_TTL * 2) {
    // Keep expired entries for 2x TTL
    serviceEndpointCache.delete(cacheKey);
    log.debug('Cleaned up expired service cache', {
      operation: 'cleanupServiceCache',
      metadata: { source: 'cache' },
    });
  }
}

const loader = new SchemaLoader(
  function buildSchemaFromEndpoints(loadedEndpoints) {
    const subschemas: Array<GraphQLSchema | any> = loadedEndpoints.map(
      ({ sdl, url, useMsgPack }) => ({
        schema: buildSchema(sdl),
        executor: buildHMACExecutor({
          endpoint: url,
          timeout: 5000,
          enableHMAC: true,
          useMsgPack: !!useMsgPack,
        }),
        batch: true,
      })
    );

    // Add local resolvers schema
    const localSchema = makeEndpointsSchema(loader);
    subschemas.push(localSchema as any);

    // Provide cache control directive SDL to the gateway schema
    const typeDefs = [
      /* GraphQL */ `
        ${cacheControlDirective}
      `,
    ];

    return stitchSchemas({
      subschemaConfigTransforms: [stitchingDirectivesTransformer],
      subschemas,
      typeDefs,
    });
  },
  [] // Will be populated after database connection
);

// Try to build an initial local-only schema so early requests have a schema.
try {
  if (!loader.schema) {
    loader.schema = makeEndpointsSchema(loader);
    log.debug('Built initial local schema before first reload');
  }
} catch (e) {
  log.warn('Failed to build initial local schema; will rely on lazy reload', {
    operation: 'initialSchemaBuild',
    error: e instanceof Error ? e : new Error(String(e)),
  });
}

// Koa application will host the Yoga handler and additional routes
const app = new Koa();

// Basic production-ready middlewares
app.use(responseTime());
// Record request latency metrics
app.use(koaMetrics());
// Security headers via Helmet
// Note: GraphiQL (served by Yoga) uses a small inline script and a favicon hosted on raw.githubusercontent.com.
// We relax CSP accordingly while keeping sensible defaults.
app.use(
  koaHelmet({
    contentSecurityPolicy: {
      // Keep Helmet defaults and extend them
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://raw.githubusercontent.com'],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
          'blob:',
        ], // Allow unpkg.com for GraphiQL, jsdelivr.net for Voyager, blob: for workers, and unsafe-eval for WebAssembly
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
        ], // Allow unpkg.com for GraphiQL and jsdelivr.net for Voyager
        workerSrc: ["'self'", 'blob:'], // Allow blob workers for Voyager
        connectSrc: [
          "'self'",
          'data:', // Allow data URLs for Voyager's graphviz worker
          'https://cdn.jsdelivr.net', // Allow source maps and other connections to jsdelivr.net
          // Allow configured CORS origin if provided (useful for Admin UI/dev)
          ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
        ],
        fontSrc: ["'self'", 'data:'],
      },
    },
  })
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);
// Skip gzip/deflate for MsgPack since it's already a dense binary format
app.use(
  compress({
    filter: (contentType) => {
      if (!contentType) return true;
      if (contentType.includes('application/x-msgpack')) return false; // no compression for msgpack
      return compress.filter ? compress.filter(contentType) : true;
    },
  })
);

// Shared Redis cache for response cache plugin; reuse existing Redis URL and initialize once
const responseCacheRedisUrl =
  process.env.RESPONSE_CACHE_REDIS_URL ||
  process.env.REDIS_URL ||
  'redis://localhost:6379';
const responseCacheRedis = new Redis(responseCacheRedisUrl);
const responseCacheInstance = createRedisCache({
  redis: responseCacheRedis as any,
});

// PubSub over Redis for distributed subscription resolvers (if any local subscriptions exist)
const pubsubRedisUrl =
  process.env.PUBSUB_REDIS_URL ||
  process.env.REDIS_URL ||
  'redis://localhost:6379';
const pubsubRedisPublisher = new Redis(pubsubRedisUrl);
const pubsubRedisSubscriber = new Redis(pubsubRedisUrl);
const pubSub = createPubSub({
  eventTarget: createRedisEventTarget({
    publishClient: pubsubRedisPublisher as any,
    subscribeClient: pubsubRedisSubscriber as any,
  }),
});

// Register PubSub instance and GatewayMessagePublisher in DI container
Container.set('PubSub', pubSub);
Container.set({ id: 'PubSub', value: pubSub });

// Runtime response cache config snapshot (updated periodically)
const responseCacheConfig = {
  enabled: false,
  ttlMs: 30_000,
  includeExtensions: process.env.NODE_ENV === 'development',
  scope: 'per-session' as 'global' | 'per-session',
  ttlPerType: {} as Record<string, number>,
  ttlPerSchemaCoordinate: {} as Record<string, number>,
};

const yoga = createYoga({
  // Always provide a schema at request time. If not ready yet, reload lazily.
  schema: async () => {
    if (!loader.schema) {
      try {
        await loader.reload();
      } catch (e) {
        log.error('Lazy schema reload failed while handling request', {
          operation: 'createYoga.schema',
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    }
    if (!loader.schema) {
      // As a last resort, build the local schema so plugins (e.g., SSE) never see a missing schema
      try {
        const fallback = makeEndpointsSchema(loader);
        loader.schema = fallback;
        log.warn(
          'Using fallback local schema as stitched schema was unavailable',
          {
            operation: 'createYoga.schema',
          }
        );
      } catch (e) {
        log.error('Failed to construct fallback local schema', {
          operation: 'createYoga.schema',
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    }
    return loader.schema as any;
  },
  maskedErrors: false,
  multipart: true,
  logging: 'debug',
  landingPage: false,
  plugins: [
    // Enable single-connection SSE endpoint at /graphql/stream for clients using graphql-sse
    useGraphQLSSE(),
    // Rate limit (must come before session if it doesn't need session info; here we rely only on API key auth data)
    createRateLimitPlugin(),
    useSession(),
    createUsageTrackingPlugin(),
    createLatencyTrackingPlugin({
      enabled: process.env.LATENCY_TRACKING_ENABLED !== 'false',
      useBatching: process.env.LATENCY_TRACKING_USE_BATCHING !== 'false',
      useIntelligentSampling:
        process.env.LATENCY_TRACKING_USE_INTELLIGENT_SAMPLING !== 'false',
      fallbackSampleRate: parseFloat(
        process.env.LATENCY_TRACKING_FALLBACK_SAMPLE_RATE || '0.01'
      ),
      enableTelemetry:
        process.env.LATENCY_TRACKING_ENABLE_TELEMETRY !== 'false',
      maxLatencyMs: parseInt(process.env.LATENCY_TRACKING_MAX_MS || '300000'),
    }),
    // Response cache must be last so it can wrap executor
    useResponseCache({
      cache: responseCacheInstance,
      includeExtensionMetadata: responseCacheConfig.includeExtensions,
      enabled: () => responseCacheConfig.enabled,
      // Default TTL (ms)
      ttl: responseCacheConfig.ttlMs,
      ttlPerType: responseCacheConfig.ttlPerType,
      ttlPerSchemaCoordinate: responseCacheConfig.ttlPerSchemaCoordinate,
      // Default: invalidate cache entries touched by mutations
      invalidateViaMutation: true,
      session: (context: any) => {
        if (responseCacheConfig.scope === 'global') return null;
        const parts: string[] = [];
        if (context?.application?.id)
          parts.push(`app:${context.application.id}`);
        if (context?.apiKey?.id) parts.push(`key:${context.apiKey.id}`);
        if (context?.user?.id) parts.push(`user:${context.user.id}`);
        if (context?.sessionId) parts.push(`sess:${context.sessionId}`);
        return parts.length ? parts.join('|') : null;
      },
    }),
  ],
  graphiql: {
    title: 'GraphQL Gateway with Session Security',
    // Ensure GraphiQL uses SSE for subscriptions
    subscriptionsProtocol: 'SSE',
  },
  // GraphQL Playground will be handled at a separate endpoint (/playground)
  // to allow conditional access based on configuration settings
  context: async ({ request }) => {
    // Context will be extended by session plugin
    return {
      request,
      keyManager,
      schemaLoader: loader,
      pubSub,
    };
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true, // Important for sessions
  },
});

// Expose DI helper to clear response cache keys, initialized once
Container.set('ResponseCacheInvalidate', async () => {
  try {
    const redis: any = responseCacheRedis;
    if (redis && typeof redis.scan === 'function') {
      const prefixes = ['envelop:response-cache:', 'response-cache:'];
      for (const prefix of prefixes) {
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(
            cursor,
            'MATCH',
            `${prefix}*`,
            'COUNT',
            1000
          );
          cursor = next;
          if (Array.isArray(keys) && keys.length) {
            await redis.del(...keys);
          }
        } while (cursor !== '0');
      }
    }
    return true;
  } catch (e) {
    log.warn('Failed to clear response cache', e);
    return false;
  }
});

// We'll store the server instance returned by app.listen() so stopServer can close it
let server: import('http').Server | undefined;
// Optional memory usage logging interval id
let memoryLogInterval: NodeJS.Timeout | undefined;
// Response cache config refresh interval id
let responseCacheRefreshInterval: NodeJS.Timeout | undefined;

// Health check middleware
// Health and admin middleware
app.use(async (ctx, next) => {
  // Health endpoint
  if (ctx.path === '/health') {
    ctx.type = 'application/json';
    ctx.body = await checkHealth();
    return;
  }

  // GraphQL Voyager endpoint (when enabled)
  if (ctx.path === '/voyager') {
    try {
      const config = Container.get(ConfigurationService);
      const isEnabled = await config.isGraphQLVoyagerEnabled();

      if (!isEnabled) {
        ctx.status = 404;
        ctx.body = 'GraphQL Voyager is disabled';
        return;
      }

      // Import voyager only when needed
      const { default: koaMiddleware } = await import(
        'graphql-voyager/middleware/koa'
      );
      const voyagerHandler = koaMiddleware({
        endpointUrl: '/graphql',
        displayOptions: {
          skipRelay: false,
          skipDeprecated: false,
          showLeafFields: true,
          sortByAlphabet: false,
          hideRoot: false,
        },
      });

      await voyagerHandler(ctx, next);
      return;
    } catch (error) {
      log.error('Failed to serve GraphQL Voyager', {
        operation: 'voyagerMiddleware',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      ctx.status = 500;
      ctx.body = 'Failed to load GraphQL Voyager';
      return;
    }
  }

  // GraphQL Playground endpoint (when enabled) - redirects to GraphQL endpoint
  if (ctx.path === '/playground') {
    try {
      const config = Container.get(ConfigurationService);
      const isEnabled = await config.isGraphQLPlaygroundEnabled();

      if (!isEnabled) {
        ctx.status = 404;
        ctx.body = 'GraphQL Playground is disabled';
        return;
      }

      // Redirect to the GraphQL endpoint which includes GraphQL Playground when graphiql is enabled
      ctx.redirect('/graphql');
      return;
    } catch (error) {
      log.error('Failed to serve GraphQL Playground', {
        operation: 'playgroundRedirect',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      ctx.status = 500;
      ctx.body = 'Failed to load GraphQL Playground';
      return;
    }
  }

  // Dynamic docs theme CSS endpoint
  if (ctx.path.startsWith('/docs-theme.css')) {
    // In future support multi-tenant via query param `?tenant=<id>`; for now single global token set
    try {
      // Keys namespace: docs.theme.token.<name>
      const repo = dataSource.getRepository(Setting);
      const rows = await repo
        .createQueryBuilder('s')
        .where('s.key LIKE :prefix', { prefix: 'docs.theme.token.%' })
        .getMany();

      const tokens: Record<string, string> = {};
      for (const row of rows) {
        const name = row.key.replace('docs.theme.token.', '');
        const coerced = coerceSettingValue(row);
        if (coerced === null || coerced === undefined) continue;
        // Persisted values may be string/number/boolean/json; stringify scalars only
        if (typeof coerced === 'object') {
          // For JSON values we skip unless it's a primitive-like stored as JSON; stringify as fallback
          tokens[name] = JSON.stringify(coerced);
        } else {
          tokens[name] = String(coerced);
        }
      }

      // Always provide defaults for missing tokens, then override with saved values
  const allTokens: Record<string, string> = {
        // Primary brand colors - TESTING WITH GREEN
        'color-primary': '#059669',
        'color-primary-hover': '#047857',
        'color-primary-light': '#d1fae5',
        'color-secondary': '#0891b2',
        'color-success': '#10b981',
        'color-warning': '#f59e0b',
        'color-error': '#ef4444',

        // Text colors
        'color-text-primary': '#1f2937',
        'color-text-secondary': '#6b7280',
        'color-text-muted': '#9ca3af',
        'color-text-inverse': '#ffffff',

        // Background colors
        'color-background': '#ffffff',
        'color-background-secondary': '#f9fafb',
        'color-background-tertiary': '#f3f4f6',
    'color-background-code': '#1e293b',
    // New dedicated code tokens (will be overridden if theme provides them)
    'color-code-bg': '#1e293b',
    'color-code-text': '#e2e8f0',

        // Border colors
        'color-border': '#e5e7eb',
        'color-border-light': '#f3f4f6',
        'color-border-dark': '#d1d5db',

        // Typography
        'font-family-sans':
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        'font-family-mono':
          '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, monospace',
        'font-size-xs': '0.75rem',
        'font-size-sm': '0.875rem',
        'font-size-base': '1rem',
        'font-size-lg': '1.125rem',
        'font-size-xl': '1.25rem',
        'font-size-2xl': '1.5rem',
        'font-size-3xl': '1.875rem',
        'font-weight-normal': '400',
        'font-weight-medium': '500',
        'font-weight-semibold': '600',
        'font-weight-bold': '700',
        'line-height-tight': '1.25',
        'line-height-normal': '1.5',
        'line-height-relaxed': '1.625',

        // Spacing
        'spacing-xs': '0.25rem',
        'spacing-sm': '0.5rem',
        'spacing-md': '1rem',
        'spacing-lg': '1.5rem',
        'spacing-xl': '2rem',
        'spacing-2xl': '3rem',
        'spacing-3xl': '4rem',

        // Border radius
        'border-radius-sm': '0.25rem',
        'border-radius-md': '0.375rem',
        'border-radius-lg': '0.5rem',
        'border-radius-xl': '0.75rem',
        'border-radius-full': '9999px',

        // Shadows
        'shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'shadow-md':
          '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'shadow-lg':
          '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'shadow-xl':
          '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',

        // Layout
        'max-width-prose': '65ch',
        'max-width-container': '1200px',
        'sidebar-width': '280px',
        'header-height': '64px',

        // Transitions
        'transition-fast': '150ms ease-in-out',
        'transition-normal': '300ms ease-in-out',
        'transition-slow': '500ms ease-in-out',
      };

      // Override defaults with saved tokens
      Object.assign(allTokens, tokens);

      // Provide a few compatibility aliases if not explicitly set
      if (!('color-surface' in allTokens)) {
        allTokens['color-surface'] =
          allTokens['color-background-secondary'] ||
          allTokens['color-background'];
      }
      // code tokens already present in defaults; compatibility logic retained if needed for legacy themes
      if (!('color-primary-foreground' in allTokens)) {
        // Default readable foreground for primary surfaces
        allTokens['color-primary-foreground'] = '#ffffff';
      }

      ctx.type = 'text/css; charset=utf-8';
      ctx.set('Cache-Control', 'no-store');
      ctx.body = `:root{${Object.entries(allTokens)
        .map(([k, v]) => `--${k}:${String(v)}`)
        .join(';')}}`;
    } catch (e) {
      console.error('Failed to load theme tokens for /docs-theme.css', e);
      ctx.status = 500;
      ctx.type = 'text/css';
      ctx.body = ':root{--color-bg:#fff;--color-fg:#000;}';
    }
    return;
  }

  // Serve Postgres-backed docs assets
  if (ctx.path.startsWith('/docs-assets/')) {
    try {
      const repo = dataSource.getRepository(Asset);
      if (ctx.path === '/docs-assets/hero-image') {
        const row = await repo.findOne({
          where: { key: 'public.docs.heroImage' },
        });
        if (!row) {
          ctx.status = 404;
          return;
        }
        ctx.type = row.contentType || 'application/octet-stream';
        ctx.set('Cache-Control', 'no-store');
        ctx.body = row.data;
        return;
      }
      if (ctx.path === '/docs-assets/favicon') {
        const row = await repo.findOne({
          where: { key: 'public.docs.favicon' },
        });
        if (!row) {
          ctx.status = 404;
          return;
        }
        ctx.type = row.contentType || 'image/x-icon';
        ctx.set('Cache-Control', 'no-store');
        ctx.body = row.data;
        return;
      }
      if (ctx.path === '/docs-assets/brand-icon') {
        const row = await repo.findOne({
          where: { key: 'public.docs.brandIcon' },
        });
        if (!row) {
          ctx.status = 404;
          return;
        }
        ctx.type = row.contentType || 'application/octet-stream';
        ctx.set('Cache-Control', 'no-store');
        ctx.body = row.data;
        return;
      }
    } catch (e) {
      ctx.status = 500;
      return;
    }
  }

  // Documentation pages gating & static file serving (public). Avoid capturing admin docs management now under /admin/docs.
  if (
    (ctx.path === '/docs' || ctx.path.startsWith('/docs/')) &&
    !ctx.path.startsWith('/admin/docs/')
  ) {
    const config = Container.get(ConfigurationService);
    const mode = await config.getPublicDocumentationMode();
    if (mode === 'disabled') {
      ctx.status = 404;
      ctx.body = 'Documentation is disabled';
      return;
    }
    if (mode === 'preview') {
      let authenticated = false;
      try {
        const anyCtx: any = ctx as any;
        if (anyCtx?.state?.user || anyCtx?.user) authenticated = true;
      } catch {}
      if (!authenticated) {
        ctx.status = 401;
        ctx.body =
          'Authentication required to view documentation (preview mode)';
        return;
      }
    }

    // Serve the built docs.html if available
    if (ctx.path === '/docs') {
      const docsHtmlPath = path.join(
        __dirname,
        '..',
        'dist',
        'client',
        'docs.html'
      );
      if (fs.existsSync(docsHtmlPath)) {
        let html = fs.readFileSync(docsHtmlPath, 'utf-8');
        // Inject a mode badge placeholder replacement if template contains marker, else prepend small badge bar.
        if (html.includes('<!-- PUBLIC_DOC_MODE -->')) {
          html = html.replace(
            '<!-- PUBLIC_DOC_MODE -->',
            `<meta name="x-public-doc-mode" content="${mode}" />`
          );
        } else {
          // naive injection before closing head tag
          html = html.replace(
            '</head>',
            `  <meta name="x-public-doc-mode" content="${mode}" />\n</head>`
          );
        }
        // Inject favicon if present
        try {
          const assetRepo = dataSource.getRepository(Asset);
          const fav = await assetRepo.findOne({
            where: { key: 'public.docs.favicon' },
          });
          if (fav) {
            const linkTag = `<link rel="icon" href="/docs-assets/favicon?ts=${fav.updatedAt.getTime()}" />`;
            html = html.replace('</head>', `  ${linkTag}\n</head>`);
          }
        } catch {}
        ctx.type = 'text/html';
        ctx.body = html;
        return;
      }
      // Fallback minimal message if bundle not built yet
      ctx.type = 'text/html';
      ctx.body = `<!DOCTYPE html><html><head><title>API Docs</title></head><body><h1>API Documentation</h1><p>The documentation UI bundle has not been built yet. Run <code>npm run build:admin</code> to generate it.</p><p>Current mode: ${mode}</p></body></html>`;
      return;
    }

    // Serve docs branding assets at /docs/hero-image and /docs/favicon (in addition to /docs-assets/)
    if (ctx.path === '/docs/hero-image') {
      try {
        const repo = dataSource.getRepository(Asset);
        const row = await repo.findOne({
          where: { key: 'public.docs.heroImage' },
        });
        if (!row) {
          ctx.status = 404;
          return;
        }
        ctx.type = row.contentType || 'application/octet-stream';
        ctx.set('Cache-Control', 'no-store');
        ctx.body = row.data;
        return;
      } catch (err) {
        ctx.status = 500;
        ctx.body = 'Internal server error';
        return;
      }
    }
    if (ctx.path === '/docs/favicon') {
      try {
        const repo = dataSource.getRepository(Asset);
        const row = await repo.findOne({
          where: { key: 'public.docs.favicon' },
        });
        if (!row) {
          ctx.status = 404;
          return;
        }
        ctx.type = row.contentType || 'image/x-icon';
        ctx.set('Cache-Control', 'no-store');
        ctx.body = row.data;
        return;
      } catch (err) {
        ctx.status = 500;
        ctx.body = 'Internal server error';
        return;
      }
    }

    // Potential future: static assets under /docs/assets/* served from dist/client/assets
    const assetCandidate = path.join(
      __dirname,
      '..',
      'dist',
      'client',
      ctx.path.replace(/^\/docs\//, '')
    );
    if (fs.existsSync(assetCandidate) && fs.statSync(assetCandidate).isFile()) {
      ctx.type =
        path.extname(assetCandidate) === '.js'
          ? 'application/javascript'
          : undefined;
      ctx.body = fs.readFileSync(assetCandidate);
      return;
    }
    return; // nothing else matches /docs/*
  }

  // Admin UI (serve built static assets)
  if (ctx.path === '/admin' || ctx.path.startsWith('/admin/')) {
    const adminHtmlPath = path.join(
      __dirname,
      '..',
      'dist',
      'client',
      'index.html'
    );
    const fallbackHtmlPath = path.join(__dirname, 'client', 'fallback.html');

    if (fs.existsSync(adminHtmlPath)) {
      ctx.type = 'text/html';
      ctx.body = fs.readFileSync(adminHtmlPath, 'utf-8');
      return;
    } else if (fs.existsSync(fallbackHtmlPath)) {
      ctx.type = 'text/html';
      ctx.body = fs.readFileSync(fallbackHtmlPath, 'utf-8');
      return;
    } else {
      ctx.type = 'text/html';
      ctx.body = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>GraphQL Gateway Admin</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 2rem; text-align: center; }
            .container { max-width: 600px; margin: 0 auto; }
            .message { padding: 1rem; background: #f0f0f0; border-radius: 5px; margin: 1rem 0; }
            .btn { padding: 0.5rem 1rem; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>GraphQL Gateway Admin</h1>
            <div class="message">
              <h3>Admin UI Setup Required</h3>
              <p>Run <code>npm run build:admin</code> to build the admin interface.</p>
              <p>Or run <code>npm run dev:admin</code> for development mode.</p>
            </div>
            <a href="/graphql" class="btn">Access GraphQL Playground</a>
            <a href="/health" class="btn" style="margin-left: 0.5rem;">Check Health</a>
          </div>
        </body>
        </html>
      `;
      return;
    }
  }

  await next();
});

// Client -> Gateway msgpack response negotiation (before GraphQL handler mounting)
app.use(async (ctx, next) => {
  // Only engage for GraphQL endpoint; we wrap response after Yoga executes
  const wantsMsgPack = ctx.headers['x-msgpack-enabled'] === '1';
  if (!wantsMsgPack) return next();
  await next();
  if (!ctx.path.startsWith('/graphql')) return; // only transform graphql responses
  // If body is already a Buffer/string JSON we can attempt to parse then re-encode.
  try {
    if (!msgpackEncode) await ensureMsgPackEncodeLoaded();
    if (!msgpackEncode) return; // encoding lib unavailable
    if (
      ctx.body &&
      typeof ctx.body !== 'string' &&
      !(ctx.body instanceof Uint8Array)
    ) {
      // Body may be an object; encode directly
      ctx.set('content-type', 'application/x-msgpack');
      ctx.body = Buffer.from(msgpackEncode(ctx.body));
    } else if (typeof ctx.body === 'string') {
      // Try parse JSON
      try {
        const parsed = JSON.parse(ctx.body);
        ctx.set('content-type', 'application/x-msgpack');
        ctx.body = Buffer.from(msgpackEncode(parsed));
      } catch {
        // leave as-is if not JSON
      }
    }
  } catch (e) {
    log.warn('Failed to encode msgpack response for client', e);
  }
});

// Mount Yoga at /graphql
app.use(async (ctx, next) => {
  if (ctx.path === '/graphql' || ctx.path.startsWith('/graphql')) {
    // Let the Yoga handler write directly to the Node response.
    await new Promise<void>((resolve) => {
      // Prevent Koa from handling the response body
      ctx.respond = false;
      // yoga is a Node-style handler (req, res, next)
      (yoga as any)(ctx.req, ctx.res, () => resolve());
    });
    return;
  }

  await next();
});

export async function startServer() {
  const REFERSH_INTERVAL = process.env.REFRESH_INTERVAL
    ? parseInt(process.env.REFRESH_INTERVAL, 10)
    : 30_000;
  const MEMORY_LOG_INTERVAL = process.env.MEMORY_LOG_INTERVAL
    ? parseInt(process.env.MEMORY_LOG_INTERVAL, 10)
    : undefined; // disabled by default

  // Initialize dataSource before creating schema
  try {
    await dataSource.initialize();
    log.info('Database connection initialized successfully', {
      operation: 'startServer',
      metadata: { component: 'database' },
    });
  } catch (error) {
    log.error('Failed to initialize database connection', {
      operation: 'startServer',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { component: 'database' },
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
          metadata: { component: 'migrations' },
        });
        await dataSource.runMigrations();
        log.info('Migrations completed successfully', {
          operation: 'startServer',
          metadata: { component: 'migrations', status: 'completed' },
        });
      } else {
        log.info('No pending migrations', {
          operation: 'startServer',
          metadata: { component: 'migrations', status: 'up-to-date' },
        });
      }
    } catch (error) {
      log.error('Failed to run migrations', {
        operation: 'startServer',
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { component: 'migrations' },
      });
      throw error;
    }
  }

  // Ensure initial admin exists (non-fatal if env is missing)
  try {
    const { ensureInitialAdmin } = await import('./db/seed-admin');
    const res = await ensureInitialAdmin({ bcryptSaltRounds: 10 });
    if ((res as any).created) {
      log.info('Created initial admin user', {
        operation: 'ensureInitialAdmin',
        metadata: { email: (res as any).email },
      });
    } else if ((res as any).existed) {
      log.info('Initial admin already exists', {
        operation: 'ensureInitialAdmin',
        metadata: { email: (res as any).email },
      });
    } else {
      // missing-env or error – log at debug to avoid noisy startup without creds
      log.debug('Skipped ensuring initial admin (missing env or error)');
    }
  } catch (e) {
    log.warn('Failed to ensure initial admin user during startup', {
      operation: 'ensureInitialAdmin',
      error: e instanceof Error ? e : new Error(String(e)),
    });
  }

  // Initialize Redis for sessions
  try {
    await initializeRedis();
    log.info('Redis initialized for session storage', {
      operation: 'startServer',
      metadata: { component: 'redis' },
    });
  } catch (error) {
    log.error('Failed to initialize Redis', {
      operation: 'startServer',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { component: 'redis' },
    });
    throw error;
  }

  // Set up dependency injection
  Container.set('UserRepository', dataSource.getRepository(User));
  Container.set('SessionRepository', dataSource.getRepository(Session));
  // Note: use consistent DI tokens used by resolvers
  Container.set('ApplicationRepository', dataSource.getRepository(Application));
  Container.set('ServiceRepository', dataSource.getRepository(Service));
  Container.set('ServiceKeyRepository', dataSource.getRepository(ServiceKey));
  Container.set('AuditLogRepository', dataSource.getRepository(AuditLog));
  Container.set(
    'SchemaChangeRepository',
    dataSource.getRepository(SchemaChange)
  );
  Container.set(
    'ApplicationUsageRepository',
    dataSource.getRepository(ApplicationUsage)
  );
  Container.set('ApiKeyUsageRepository', dataSource.getRepository(ApiKeyUsage));
  Container.set(
    'RequestLatencyRepository',
    dataSource.getRepository(RequestLatency)
  );

  Container.set('SessionService', Container.get(SessionService));
  Container.set(
    'ServiceRegistryService',
    Container.get(ServiceRegistryService)
  );

  // JWTService is automatically registered via @Service() decorator

  // Load existing services into keyManager
  try {
    const serviceRegistryService = Container.get(ServiceRegistryService);
    await serviceRegistryService.loadServicesIntoKeyManager();
    log.info('Loaded existing services into key manager', {
      operation: 'startServer',
      metadata: { component: 'keyManager' },
    });
  } catch (error) {
    log.error('Failed to load services into key manager', {
      operation: 'startServer',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { component: 'keyManager' },
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

    log.debug(
      `Loaded ${serviceEndpoints.length} services from database:`,
      serviceEndpoints
    );
  } catch (error) {
    log.error('Failed to load services from database', {
      operation: 'loadServicesFromDatabase',
      error: error instanceof Error ? error : new Error(String(error)),
      metadata: { source: 'database' },
    });
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

  // Audit log retention cleanup scheduling
  const securityConfig = loadSecurityConfig(); // still provides cleanup interval + batch controls
  const auditRetentionInterval = setInterval(async () => {
    try {
      const deleted = await cleanupExpiredAuditLogs({
        batchSize: securityConfig.auditLogCleanupBatchSize,
        maxBatchesPerRun: securityConfig.auditLogCleanupMaxBatches,
      });
      if (deleted > 0) {
        log.debug('Audit retention cleanup deleted records', {
          operation: 'auditLogRetentionCleanup',
          metadata: { deleted },
        });
      }
    } catch (err) {
      log.error('Audit retention cleanup failed', {
        operation: 'auditLogRetentionCleanup',
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }, securityConfig.auditLogCleanupIntervalMs);

  // sleep 2s
  await loader.reload();

  // Start background flushers for buffered services (audit + usage)
  try {
    const usageSvc = Container.get(ApplicationUsageService);
    usageSvc.startBufferFlusher();
    const auditSvc = Container.get(AuditLogService);
    auditSvc.startBufferFlusher();
  } catch (err) {
    log.error('Failed to start background flushers', {
      operation: 'startServer',
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }

  // Periodically refresh response cache settings from DB
  try {
    const cfg = Container.get(ConfigurationService);
    const refresh = async () => {
      try {
        responseCacheConfig.enabled = await cfg.isResponseCacheEnabled();
        responseCacheConfig.ttlMs = await cfg.getResponseCacheTtlMs();
        responseCacheConfig.includeExtensions =
          await cfg.isResponseCacheIncludeExtensions();
        responseCacheConfig.scope = await cfg.getResponseCacheScope();
        // Update TTL maps in-place to preserve references held by the plugin
        const newPerType = await cfg.getResponseCacheTtlPerType();
        for (const key of Object.keys(responseCacheConfig.ttlPerType)) {
          if (!(key in newPerType))
            delete (responseCacheConfig.ttlPerType as any)[key];
        }
        Object.assign(responseCacheConfig.ttlPerType, newPerType);

        const newPerCoord = await cfg.getResponseCacheTtlPerSchemaCoordinate();
        for (const key of Object.keys(
          responseCacheConfig.ttlPerSchemaCoordinate
        )) {
          if (!(key in newPerCoord))
            delete (responseCacheConfig.ttlPerSchemaCoordinate as any)[key];
        }
        Object.assign(responseCacheConfig.ttlPerSchemaCoordinate, newPerCoord);
        log.debug('Refreshed response cache config', {
          operation: 'responseCacheRefresh',
          metadata: {
            enabled: responseCacheConfig.enabled,
            ttlMs: responseCacheConfig.ttlMs,
            includeExtensions: responseCacheConfig.includeExtensions,
            scope: responseCacheConfig.scope,
            ttlPerTypeKeys: Object.keys(responseCacheConfig.ttlPerType || {})
              .length,
            ttlPerSchemaCoordinateKeys: Object.keys(
              responseCacheConfig.ttlPerSchemaCoordinate || {}
            ).length,
          },
        });
      } catch (e) {
        log.warn('Failed to refresh response cache config', e);
      }
    };
    await refresh();
    responseCacheRefreshInterval = setInterval(refresh, 15_000);
  } catch (e) {
    log.warn('Response cache config refresh loop not started', e);
  }

  // Start Koa server
  await new Promise<void>((resolve) => {
    // log starting
    log.info('Starting GraphQL Gateway server on http://localhost:4000', {
      operation: 'startServer',
    });
    server = app.listen(4000, () => resolve());
    log.info('GraphQL Gateway server started on http://localhost:4000', {
      operation: 'startServer',
    });
  });
  log.debug('Gateway started on http://localhost:4000');
  log.debug(`HMAC key cleanup will run every ${KEY_CLEANUP_INTERVAL} ms`);

  await loader.autoRefresh(REFERSH_INTERVAL);
  log.debug(`Gateway schema will refresh every ${REFERSH_INTERVAL} ms`);

  // Store cleanup intervals for stopping later
  (server as any).keyCleanupInterval = cleanupInterval;
  (server as any).sessionCleanupInterval = sessionCleanupInterval;
  (server as any).auditRetentionInterval = auditRetentionInterval;

  if (MEMORY_LOG_INTERVAL && MEMORY_LOG_INTERVAL > 0) {
    memoryLogInterval = setInterval(() => {
      const usage = process.memoryUsage();
      const toMB = (n: number) => Math.round((n / 1024 / 1024) * 100) / 100;
      log.debug('Memory usage snapshot', {
        operation: 'memoryUsage',
        metadata: {
          rssMB: toMB(usage.rss),
          heapTotalMB: toMB(usage.heapTotal),
          heapUsedMB: toMB(usage.heapUsed),
          externalMB: toMB(usage.external),
          arrayBuffersMB: toMB((usage as any).arrayBuffers || 0),
          schemaLoader: loader.getMetrics(),
        },
      });
    }, MEMORY_LOG_INTERVAL);
    (server as any).memoryLogInterval = memoryLogInterval;
  }
}

export async function stopServer() {
  loader.stopAutoRefresh();

  // Clear the key cleanup interval
  if (server) {
    if ((server as any).keyCleanupInterval) {
      clearInterval((server as any).keyCleanupInterval);
    }

    if ((server as any).sessionCleanupInterval) {
      clearInterval((server as any).sessionCleanupInterval);
    }
    if ((server as any).auditRetentionInterval) {
      clearInterval((server as any).auditRetentionInterval);
    }
    if ((server as any).memoryLogInterval) {
      clearInterval((server as any).memoryLogInterval);
    }
    if ((server as any).responseCacheRefreshInterval) {
      clearInterval((server as any).responseCacheRefreshInterval);
    }

    // Close the HTTP server
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // Flush buffered services before shutdown
  try {
    const usageSvc = Container.get(ApplicationUsageService);
    await usageSvc.shutdown();
  } catch (e) {
    log.error('Failed to shutdown usage service cleanly', {
      operation: 'stopServer',
      error: e instanceof Error ? e : new Error(String(e)),
    });
  }
  try {
    const auditSvc = Container.get(AuditLogService);
    await auditSvc.shutdown();
  } catch (e) {
    log.error('Failed to shutdown audit service cleanly', {
      operation: 'stopServer',
      error: e instanceof Error ? e : new Error(String(e)),
    });
  }

  // Close database connection
  if (dataSource.isInitialized) {
    await dataSource.destroy();
    log.debug('Database connection closed');
  }

  // Clear response cache refresh interval
  if (responseCacheRefreshInterval) {
    clearInterval(responseCacheRefreshInterval);
    responseCacheRefreshInterval = undefined;
  }

  // Close response cache Redis connection
  try {
    if (responseCacheRedis) {
      responseCacheRedis.disconnect();
    }
  } catch (e) {
    log.warn('Failed to close response cache Redis connection', e);
  }

  // Close session Redis connection
  try {
    if (redisClient && typeof (redisClient as any).disconnect === 'function') {
      (redisClient as any).disconnect();
    }
  } catch (e) {
    log.warn('Failed to close session Redis connection', e);
  }

  // Close PubSub Redis connections
  try {
    if (pubsubRedisPublisher) pubsubRedisPublisher.disconnect();
    if (pubsubRedisSubscriber) pubsubRedisSubscriber.disconnect();
  } catch (e) {
    log.warn('Failed to close PubSub Redis connections', e);
  }
}
