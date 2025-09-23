import * as opentelemetry from '@opentelemetry/api';
import { Plugin } from 'graphql-yoga';
import { Container } from 'typedi';
import { ExtendedYogaContext } from '../auth/auth.types';
import { ConfigurationService } from '../services/config/configuration.service';
import { latencyTelemetry } from '../services/latency/latency-telemetry.service';
import { RequestLatencyService } from '../services/latency/request-latency.service';
import { log } from '../utils/logger';

interface LatencyTrackingOptions {
  enabled?: boolean;
  sampleRate?: number; // 0.0 to 1.0, for high-volume environments
  maxLatencyMs?: number; // Ignore outliers above this threshold
}

interface RequestTiming {
  startTime: [number, number]; // process.hrtime() result
  startTimestamp: Date;
  operationName?: string;
  operationType?: string;
}

interface ExtendedYogaContextWithRequest extends ExtendedYogaContext {
  request?: {
    headers: {
      get(name: string): string | null;
    };
  };
  requestId?: string;
}

// Store request timings by request ID
const requestTimings = new Map<string, RequestTiming>();

export function createLatencyTrackingPlugin(options: LatencyTrackingOptions = {}): Plugin {
  const {
    enabled = true,
    sampleRate = 1.0,
    maxLatencyMs = 300000 // 5 minutes default max
  } = options;

  if (!enabled) {
    return {};
  }

  return {
    onExecute: ({ args }) => {
      // Generate unique request ID for tracking
      const requestId = generateRequestId();
      const context = args.contextValue as ExtendedYogaContextWithRequest;

      // Add request ID to context for correlation
      context.requestId = requestId;

      // Start timing
      const startTime = process.hrtime();
      const startTimestamp = new Date();

      // Extract operation info
      const document = args.document;
      const operation = document?.definitions?.[0];
      const operationName = args.operationName || 'anonymous';
      const operationType = operation?.kind === 'OperationDefinition' ? operation.operation : 'unknown';

      // Store timing data
      requestTimings.set(requestId, {
        startTime,
        startTimestamp,
        operationName,
        operationType
      });

      // Add OpenTelemetry attributes for correlation
      const activeSpan = opentelemetry.trace.getActiveSpan();
      if (activeSpan) {
        activeSpan.setAttributes({
          'graphql.operation.name': operationName,
          'graphql.operation.type': operationType,
          'gateway.request.id': requestId
        });
      }

      return {
        onExecuteDone: async ({ result }) => {
          try {
            // Check if latency tracking is enabled via settings
            let trackingEnabled: boolean = enabled; // Fall back to static option if service unavailable
            try {
              const configService = Container.get(ConfigurationService);
              trackingEnabled = await configService.isLatencyTrackingEnabled();
            } catch (error) {
              log.debug('Failed to check latency tracking setting, using static enabled state', { error });
            }

            // Exit early if tracking is disabled
            if (!trackingEnabled) {
              requestTimings.delete(requestId);
              return;
            }

            // Apply sampling
            if (Math.random() > sampleRate) {
              requestTimings.delete(requestId);
              return;
            }

            const timing = requestTimings.get(requestId);
            if (!timing) {
              log.debug('Request timing data not found', { requestId });
              return;
            }

            // Calculate latency
            const endTime = process.hrtime(timing.startTime);
            const latencyMs = endTime[0] * 1000 + endTime[1] / 1000000;

            // Skip outliers that might indicate system issues
            if (latencyMs > maxLatencyMs) {
              log.warn('Latency measurement exceeds maximum threshold, skipping', {
                requestId,
                latencyMs,
                maxLatencyMs,
                operationName: timing.operationName
              });
              requestTimings.delete(requestId);
              return;
            }

            // Determine if the request had errors
            const hasErrors = result && 'errors' in result && result.errors && result.errors.length > 0;

            // Get application and service info from context
            let applicationToTrack: any = null;

            if (context.application && context.authType === 'api-key') {
              applicationToTrack = context.application;
            } else if (context.user && context.authType === 'session') {
              // Use the same logic as usage tracking for session users
              applicationToTrack = await getDefaultApplicationForUser(context.user.id);
            }

            if (!applicationToTrack) {
              log.debug('No application context for latency tracking', {
                requestId,
                authType: context.authType
              });
              requestTimings.delete(requestId);
              return;
            }

            // Get service ID (use same logic as usage tracking)
            const serviceId = await getCachedGatewayServiceId(applicationToTrack.ownerId);

            if (!serviceId) {
              log.debug('No service ID available for latency tracking', { requestId });
              requestTimings.delete(requestId);
              return;
            }

            // Record latency in database
            const latencyService = Container.get(RequestLatencyService);

            const latencyData = {
              serviceId,
              applicationId: applicationToTrack.id,
              userId: context.user?.id,
              operationName: timing.operationName || 'anonymous',
              operationType: timing.operationType || 'unknown',
              latencyMs,
              hasErrors,
              statusCode: hasErrors ? 500 : 200,
              ipAddress: extractClientIP(context),
              userAgent: extractUserAgent(context),
              correlationId: context.sessionId || context.session?.id || requestId,
              requestSizeBytes: estimateRequestSize(args),
              responseSizeBytes: estimateResponseSize(result),
              authType: context.authType || 'unknown'
            };

            await latencyService.recordLatency(latencyData);

            // Record latency in telemetry system
            latencyTelemetry.recordRequestLatency({
              ...latencyData,
              serviceName: 'graphql-gateway', // Could be enhanced to get actual service name
              applicationName: applicationToTrack.name
            });

            // Add latency to OpenTelemetry span
            if (activeSpan) {
              activeSpan.setAttributes({
                'gateway.request.latency_ms': latencyMs,
                'gateway.request.has_errors': hasErrors,
                'gateway.request.service_id': serviceId,
                'gateway.request.application_id': applicationToTrack.id
              });
            }

            log.debug('Request latency recorded', {
              requestId,
              operationName: timing.operationName,
              operationType: timing.operationType,
              latencyMs: Math.round(latencyMs * 100) / 100, // Round to 2 decimal places
              applicationId: applicationToTrack.id,
              serviceId,
              hasErrors
            });
          } catch (error) {
            const timing = requestTimings.get(requestId);
            log.error('Failed to record request latency', {
              error,
              requestId,
              operationName: timing?.operationName
            });
            // Don't throw - latency tracking shouldn't break requests
          } finally {
            // Clean up timing data
            requestTimings.delete(requestId);
          }
        }
      };
    }
  };
}

// Helper functions
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function extractClientIP(context: ExtendedYogaContextWithRequest): string | undefined {
  const request = context.request;
  if (!request) return undefined;

  // Try various headers for client IP
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) {
    return xRealIP;
  }

  // Note: request.ip or similar might not be available depending on the server setup
  return undefined;
}

function extractUserAgent(context: ExtendedYogaContextWithRequest): string | undefined {
  return context.request?.headers.get('user-agent') || undefined;
}

function estimateRequestSize(args: any): number | undefined {
  try {
    // Rough estimation based on query string length
    const query = args.source || '';
    const variables = args.variableValues || {};
    const variablesStr = JSON.stringify(variables);

    return Buffer.byteLength(query + variablesStr, 'utf8');
  } catch {
    return undefined;
  }
}

function estimateResponseSize(result: any): number | undefined {
  try {
    // Rough estimation based on JSON serialization
    const resultStr = JSON.stringify(result);
    return Buffer.byteLength(resultStr, 'utf8');
  } catch {
    return undefined;
  }
}

// Import helper functions from usage tracking plugin
// These are copied here to avoid circular dependencies
let cachedGatewayServiceId: string | null = null;
let gatewayLookupInFlight: Promise<string | null> | null = null;
const GATEWAY_SERVICE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let gatewayServiceCacheExpiry = 0;

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

    let gatewayService = await serviceRepository.findOne({
      where: { name: 'GraphQL Gateway' }
    });

    if (!gatewayService) {
      const explicitOwnerId = process.env.GATEWAY_VIRTUAL_SERVICE_OWNER_ID?.trim();
      const userRepo = dataSource.getRepository(User);
      let ownerId: string | null = null;

      if (preferredOwnerId) {
        const exists = await userRepo.query(`SELECT id FROM "user" WHERE id = $1 LIMIT 1`, [preferredOwnerId]);
        if (exists.length > 0) {
          ownerId = preferredOwnerId;
        }
      }

      if (explicitOwnerId && !ownerId) {
        const found = await userRepo.query(`SELECT id FROM "user" WHERE id = $1 LIMIT 1`, [explicitOwnerId]);
        if (found.length > 0) ownerId = explicitOwnerId;
      }

      if (!ownerId) {
        const adminUser = await userRepo.query(
          `SELECT id FROM "user" WHERE POSITION('admin' IN permissions) > 0 ORDER BY "createdAt" ASC LIMIT 1`
        );
        if (adminUser.length > 0) ownerId = adminUser[0].id;
      }

      if (!ownerId) {
        log.warn('No owner available for virtual gateway service; latency tracking skipped');
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
      log.info('Created virtual gateway service for latency tracking', { id: gatewayService.id });
    }

    cachedGatewayServiceId = gatewayService.id;
    gatewayServiceCacheExpiry = Date.now() + GATEWAY_SERVICE_CACHE_TTL_MS;
    return cachedGatewayServiceId;
  } catch (error) {
    log.error('Failed to get/create gateway service for latency tracking:', error);
    return null;
  }
}

// Default application lookup for session users
const DEFAULT_APP_CACHE = new Map<string, { app: any; expiresAt: number }>();
const DEFAULT_APP_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getDefaultApplicationForUser(userId: string): Promise<any | null> {
  const now = Date.now();
  const cached = DEFAULT_APP_CACHE.get(userId);
  if (cached && now < cached.expiresAt) return cached.app;

  try {
    const { dataSource } = await import('../db/datasource');
    const { Application } = await import('../entities/application.entity');

    const repo = dataSource.getRepository(Application);
    const app = await repo.findOne({
      where: { ownerId: userId },
      order: { createdAt: 'ASC' }
    });

    if (!app) return null;

    DEFAULT_APP_CACHE.set(userId, { app, expiresAt: now + DEFAULT_APP_TTL_MS });
    return app;
  } catch (e) {
    log.error('Failed resolving default application for session user', {
      operation: 'defaultApplicationResolution',
      userId,
      error: e
    });
    return null;
  }
}
