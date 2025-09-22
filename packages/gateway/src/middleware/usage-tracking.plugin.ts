import { Plugin } from 'graphql-yoga';
import { Container } from 'typedi';
import { ExtendedYogaContext } from '../auth/auth.types';
import { dataSource } from '../db/datasource';
import { Application } from '../entities/application.entity';
import { AuditLogService } from '../services/audit/audit-log.service';
import { ApplicationUsageService } from '../services/usage/application-usage.service';
import { gatewayInternalLog, log } from '../utils/logger';
import { ApiKeyUsageCounterService } from '../services/usage/api-key-usage.counter';

interface UsageTrackingOptions {
  enabled?: boolean;
}

export function createUsageTrackingPlugin(options: UsageTrackingOptions = {}): Plugin {
  const { enabled = true } = options;

  if (!enabled) {
    return {};
  }

  return {
    onExecute: ({ args }) => {
      return {
        onExecuteDone: async ({ result }) => {
          try {
            const context = args.contextValue as ExtendedYogaContext;

            // Track usage for both API key and session authentication if user has applications
            let applicationToTrack: any = null;

            if (context.application && context.authType === 'api-key') {
              // API key authentication - track for the associated application
              applicationToTrack = context.application;
            } else if (context.user && context.authType === 'session') {
              // Session authentication: choose a deterministic default application for this user.
              // Strategy:
              // 1. If user has a previously cached default application ID (in memory), use it if still exists.
              // 2. Else query for earliest created application owned by user.
              // 3. If none exists, attempt to lazily create a personal application (optional future step – not implemented now).
              // 4. If still none, log a skip.
              const userId = context.user.id;
              const app = await getOrCacheDefaultApplication(userId);
              if (!app) {
                gatewayInternalLog.debug('Skipping usage tracking for session-based request - user has no applications', {
                  operation: 'usageTrackingSkip',
                  reason: 'sessionUserNoApplications',
                  userId
                });
                return;
              }
              applicationToTrack = app;
            }

            if (!applicationToTrack) {
              log.debug('No application context found for usage tracking');
              return;
            }

            const usageService = Container.has(ApplicationUsageService) ? Container.get(ApplicationUsageService) : null;

            const auditService = Container.has(AuditLogService) ? Container.get(AuditLogService) : null;

            if (!usageService) {
              log.debug('UsageService not available, skipping usage tracking');
              return;
            }

            // Determine if the operation had errors
            const hasErrors = result && 'errors' in result && result.errors && result.errors.length > 0;

            // For now, we'll track all operations against a generic "gateway" service
            // In the future, this could be enhanced to track per-service based on the operation
            const gatewayServiceId = await getCachedGatewayServiceId(applicationToTrack.ownerId);

            if (gatewayServiceId) {
              await usageService.increment(applicationToTrack.id, gatewayServiceId, {
                error: hasErrors,
                rateLimited: false // This would need to be determined from rate limiting middleware
              });

              log.info('Usage tracked successfully', {
                applicationId: applicationToTrack.id,
                applicationName: applicationToTrack.name,
                serviceId: gatewayServiceId,
                hasErrors,
                operationName: args.operationName || 'anonymous'
              });
            } else {
              log.warn('Failed to get gateway service ID for usage tracking');
            }

            // Additionally track per-API-key counters in Redis (non-blocking)
            try {
              if (context.authType === 'api-key' && (context as any).apiKey && gatewayServiceId && applicationToTrack?.id) {
                const counter = Container.get(ApiKeyUsageCounterService);
                // Fire and forget
                void counter.incr(applicationToTrack.id, gatewayServiceId, (context as any).apiKey.id, { error: hasErrors });
              }
            } catch (e) {
              // counters must not impact request path
              log.debug('Per-API-key usage counter error (ignored)', e);
            }

            // Track in audit log
            if (auditService && applicationToTrack) {
              await auditService.logApiRequest({
                applicationId: applicationToTrack.id,
                userId: context.user?.id,
                sessionId: context.sessionId || context.session?.id,
                operationName: args.operationName || 'anonymous',
                statusCode: hasErrors ? 500 : 200, // heuristic until granular per-field
                latencyMs: undefined, // Not measured here; could integrate via onExecute hooks with hrtime
                httpMethod: 'POST',
                success: !hasErrors,
                serviceId: gatewayServiceId || undefined,
                serviceName: 'graphql-gateway',
                extraMetadata: {
                  operationType: args.document?.definitions?.[0]?.kind,
                  hasErrors,
                  authType: context.authType
                }
              });
            }
          } catch (error) {
            log.error('Failed to track usage:', error);
            // Don't throw - usage tracking shouldn't break the operation
          }
        }
      };
    }
  };
}

// Helper function to get or create a gateway service for tracking
let cachedGatewayServiceId: string | null = null;
let gatewayLookupInFlight: Promise<string | null> | null = null;
const GATEWAY_SERVICE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let gatewayServiceCacheExpiry = 0;

// Option A wiring (phase 1): allow passing a preferredOwnerId (e.g. application.ownerId) which
// will be considered during service creation. In this phase we only add the parameter; logic
// will be updated in a subsequent patch.
// preferredOwnerId is supplied from an application context (application.ownerId) when available.
// It is only used the very first time the virtual gateway service is created. Subsequent lookups
// are served from cache until TTL expiry, after which creation path won't run again (service exists).
async function getCachedGatewayServiceId(preferredOwnerId?: string): Promise<string | null> {
  const now = Date.now();
  if (cachedGatewayServiceId && now < gatewayServiceCacheExpiry) return cachedGatewayServiceId;
  if (gatewayLookupInFlight) return gatewayLookupInFlight;
  gatewayLookupInFlight = getOrCreateGatewayService(preferredOwnerId).finally(() => {
    gatewayLookupInFlight = null;
  });
  return gatewayLookupInFlight;
}

async function getOrCreateGatewayService(preferredOwnerId?: string): Promise<string | null> {
  try {
    const { dataSource } = await import('../db/datasource');
    const { Service, ServiceStatus } = await import('../entities/service.entity');
    const { User } = await import('../services/users/user.entity');

    const serviceRepository = dataSource.getRepository(Service);

    // Try to find existing gateway service
    let gatewayService = await serviceRepository.findOne({
      where: { name: 'GraphQL Gateway' }
    });

    if (!gatewayService) {
      // Create a virtual gateway service for tracking
      // Owner selection policy (hardened):
      // 1. Use explicit GATEWAY_VIRTUAL_SERVICE_OWNER_ID if provided.
      // 2. Else select first admin user (permissions contains 'admin').
      // 3. If neither available, DO NOT create; log security event (attempted implicit owner assignment).
      const explicitOwnerId = process.env.GATEWAY_VIRTUAL_SERVICE_OWNER_ID?.trim();
      const userRepo = dataSource.getRepository(User);
      let ownerId: string | null = null;

      // New priority (Option A wiring):
      // 0. preferredOwnerId (passed from request context when first creation attempt occurs)
      // 1. explicit env GATEWAY_VIRTUAL_SERVICE_OWNER_ID
      // 2. first admin user
      // 3. otherwise abort creation

      if (preferredOwnerId) {
        // Validate that preferredOwnerId exists
        const exists = await userRepo.query(`SELECT id FROM "user" WHERE id = $1 LIMIT 1`, [preferredOwnerId]);
        if (exists.length > 0) {
          ownerId = preferredOwnerId;
        } else {
          log.warn('preferredOwnerId supplied but not found; continuing with fallback owner resolution', {
            operation: 'virtualServiceOwnerResolution',
            metadata: { preferredOwnerId }
          });
        }
      }

      if (explicitOwnerId) {
        const found = await userRepo.query(`SELECT id FROM "user" WHERE id = $1 LIMIT 1`, [explicitOwnerId]);
        if (found.length === 0) {
          log.error('Configured GATEWAY_VIRTUAL_SERVICE_OWNER_ID not found; refusing to create virtual service', {
            operation: 'virtualServiceOwnerResolution',
            metadata: { ownerId: explicitOwnerId }
          });
          return null;
        }
        // Only override if we have not already set a valid preferred owner
        if (!ownerId) ownerId = explicitOwnerId;
      } else {
        if (!ownerId) {
          const adminUser = await userRepo.query(
            `SELECT id FROM "user" WHERE POSITION('admin' IN permissions) > 0 ORDER BY "createdAt" ASC LIMIT 1`
          );
          if (adminUser.length > 0) ownerId = adminUser[0].id;
        }
      }

      if (!ownerId) {
        // Security note: we deliberately avoid silently assigning a random user to prevent privilege confusion.
        log.warn('No explicit or admin user owner available for virtual gateway service; creation skipped', {
          operation: 'virtualServiceOwnerResolution'
        });
        // Attempt to emit audit log event if service exists
        try {
          if (Container.has(AuditLogService)) {
            const audit = Container.get(AuditLogService);
            await audit.log('api_request' as any, {
              // Using a generic event type; consider dedicated event in enum later
              action: 'virtual_service_owner_missing',
              category: undefined,
              severity: undefined,
              success: false,
              metadata: { reason: 'no_owner_found', serviceName: 'GraphQL Gateway' },
              tags: ['security', 'virtual-service']
            });
          }
        } catch (e) {
          log.error('Failed to record audit incident for missing virtual service owner', e);
        }
        return null;
      }

      gatewayService = serviceRepository.create({
        name: 'GraphQL Gateway',
        url: 'internal://gateway',
        status: ServiceStatus.ACTIVE,
        externally_accessible: false,
        ownerId,
        description: 'Virtual service for tracking gateway operations'
      });

      gatewayService = await serviceRepository.save(gatewayService);
      log.info('Created virtual gateway service for usage tracking', { id: gatewayService.id });
    }

    cachedGatewayServiceId = gatewayService.id;
    gatewayServiceCacheExpiry = Date.now() + GATEWAY_SERVICE_CACHE_TTL_MS;
    return cachedGatewayServiceId;
  } catch (error) {
    log.error('Failed to get/create gateway service for usage tracking:', error);
    return null;
  }
}

// ---- Session default application resolution ----
// Lightweight in-memory cache: userId -> { application, expiresAt }
interface CachedDefaultApp {
  app: Application;
  expiresAt: number;
}
const DEFAULT_APP_CACHE = new Map<string, CachedDefaultApp>();
const DEFAULT_APP_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getOrCacheDefaultApplication(userId: string): Promise<Application | null> {
  const now = Date.now();
  const cached = DEFAULT_APP_CACHE.get(userId);
  if (cached && now < cached.expiresAt) return cached.app;
  try {
    const repo = dataSource.getRepository(Application);
    // Select deterministic earliest created application for the user
    const app = await repo.findOne({ where: { ownerId: userId }, order: { createdAt: 'ASC' } });
    if (!app) return null;
    DEFAULT_APP_CACHE.set(userId, { app, expiresAt: now + DEFAULT_APP_TTL_MS });
    return app;
  } catch (e) {
    log.error('Failed resolving default application for session user', {
      operation: 'defaultApplicationResolution',
      userId,
      error: e instanceof Error ? e : new Error(String(e))
    });
    return null;
  }
}
