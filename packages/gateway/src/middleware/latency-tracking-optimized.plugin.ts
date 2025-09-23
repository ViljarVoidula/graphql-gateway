import { Plugin } from 'graphql-yoga';
import { Container } from 'typedi';
import { ExtendedYogaContext } from '../auth/auth.types';
import { ConfigurationService } from '../services/config/configuration.service';
import { LatencyBatchWriter } from '../services/latency/latency-batch-writer.service';
import { LatencySamplingService } from '../services/latency/latency-sampling.service';
import { latencyTelemetry } from '../services/latency/latency-telemetry.service';
import { log } from '../utils/logger';

interface LatencyTrackingOptions {
  enabled?: boolean;
  useBatching?: boolean;
  useIntelligentSampling?: boolean;
  fallbackSampleRate?: number; // Fallback if intelligent sampling fails
  enableTelemetry?: boolean;
  maxLatencyMs?: number;
}

interface ExtendedYogaContextWithRequest extends ExtendedYogaContext {
  request: {
    headers: {
      get(name: string): string | null;
    };
  };
  requestId?: string;
}

// Ultra-lightweight request tracking (pre-allocated for performance)
interface RequestTiming {
  startTime: bigint; // Use bigint for nanosecond precision
  operationName: string;
  operationType: string;
}

// Pre-allocated pools to minimize GC pressure
const timingPool = new Map<string, RequestTiming>();
const requestIdCounter = { value: 0 }; // Faster than crypto.randomUUID()

export function createLatencyTrackingPlugin(options: LatencyTrackingOptions = {}): Plugin {
  const {
    enabled = true,
    useBatching = true,
    useIntelligentSampling = true,
    fallbackSampleRate = 0.01,
    enableTelemetry = true,
    maxLatencyMs = 300000
  } = options;

  if (!enabled) {
    return {};
  }

  // Pre-warm services to avoid lazy loading during requests
  let batchWriter: LatencyBatchWriter | null = null;
  let samplingService: LatencySamplingService | null = null;
  let configService: ConfigurationService | null = null;

  if (useBatching) {
    try {
      batchWriter = Container.get(LatencyBatchWriter);
    } catch (error) {
      log.warn('Failed to initialize batch writer, falling back to direct writes', { error });
    }
  }

  if (useIntelligentSampling) {
    try {
      samplingService = Container.get(LatencySamplingService);
    } catch (error) {
      log.warn('Failed to initialize sampling service, using fallback rate', { error });
    }
  }

  try {
    configService = Container.get(ConfigurationService);
  } catch (error) {
    log.warn('Failed to initialize configuration service, using static enabled state', { error });
  }

  return {
    onExecute: ({ args }) => {
      // Ultra-fast request ID generation (no UUID overhead)
      const requestId = `${Date.now()}-${++requestIdCounter.value}`;
      const context = args.contextValue as ExtendedYogaContextWithRequest;

      // Minimal timing setup
      const startTime = process.hrtime.bigint();
      const operationName = args.operationName || 'anonymous';
      const operationType =
        args.document?.definitions?.[0]?.kind === 'OperationDefinition'
          ? (args.document.definitions[0] as any).operation
          : 'unknown';

      // Store minimal timing data
      timingPool.set(requestId, {
        startTime,
        operationName,
        operationType
      });

      return {
        onExecuteDone: async ({ result }) => {
          // Get timing data and clean up immediately
          const timing = timingPool.get(requestId);
          timingPool.delete(requestId);

          if (!timing) return;

          try {
            // Check if latency tracking is enabled via settings
            let trackingEnabled: boolean = enabled; // Fall back to static option if service unavailable
            if (configService) {
              try {
                trackingEnabled = await configService.isLatencyTrackingEnabled();
              } catch (error) {
                log.debug('Failed to check latency tracking setting, using static enabled state', { error });
              }
            }

            // Exit early if tracking is disabled
            if (!trackingEnabled) {
              return;
            }
            // Calculate latency with nanosecond precision
            const endTime = process.hrtime.bigint();
            const latencyNs = Number(endTime - timing.startTime);
            const latencyMs = latencyNs / 1_000_000; // Convert to milliseconds

            // Skip outliers early
            if (latencyMs > maxLatencyMs) return;

            const hasErrors = result && 'errors' in result && result.errors && result.errors.length > 0;

            // Get application context (optimized path)
            const applicationId =
              context.application?.id || (context.user ? await getDefaultApplicationId(context.user.id) : null);

            if (!applicationId) return;

            const serviceId = await getCachedGatewayServiceId();
            if (!serviceId) return;

            // Fast sampling decision
            let shouldTrack = false;
            if (samplingService) {
              shouldTrack = samplingService.shouldSample(
                timing.operationName,
                serviceId,
                applicationId,
                latencyMs,
                hasErrors,
                requestId
              );

              // Record for adaptive sampling (non-blocking)
              samplingService.recordRequest(timing.operationName, serviceId, applicationId, latencyMs, hasErrors);
            } else {
              // Fallback sampling
              shouldTrack = hasErrors || latencyMs > 2000 || Math.random() < fallbackSampleRate;
            }

            if (!shouldTrack) return;

            // Calculate request and response sizes
            const requestSize = calculateRequestSize(args);
            const responseSize = calculateResponseSize(result);

            // Prepare minimal data structure
            const latencyData = {
              serviceId,
              applicationId,
              userId: context.user?.id,
              operationName: timing.operationName,
              operationType: timing.operationType,
              latencyMs,
              hasErrors,
              statusCode: hasErrors ? 500 : 200,
              ipAddress: extractClientIP(context),
              userAgent: extractUserAgent(context),
              correlationId: context.sessionId || requestId,
              requestSizeBytes: requestSize,
              responseSizeBytes: responseSize,
              authType: context.authType || 'unknown'
            };

            // Async processing (non-blocking)
            if (batchWriter) {
              batchWriter.addRecord(latencyData);
            }

            // Telemetry (non-blocking, minimal overhead)
            if (enableTelemetry) {
              latencyTelemetry.recordRequestLatency({
                ...latencyData,
                serviceName: 'graphql-gateway',
                applicationName: context.application?.name
              });
            }
          } catch (error) {
            // Minimal error logging to avoid impact on request path
            if (Math.random() < 0.001) {
              // Only log 0.1% of errors
              log.error('Latency tracking error', { error, requestId });
            }
          }
        }
      };
    }
  };
}

// Optimized helper functions with caching
const DEFAULT_APP_CACHE = new Map<string, { id: string; expires: number }>();
const GATEWAY_SERVICE_CACHE = { id: null as string | null, expires: 0 };

async function getDefaultApplicationId(userId: string): Promise<string | null> {
  const now = Date.now();
  const cached = DEFAULT_APP_CACHE.get(userId);

  if (cached && now < cached.expires) {
    return cached.id;
  }

  try {
    const { dataSource } = await import('../db/datasource');
    const result = await dataSource.query('SELECT id FROM applications WHERE "ownerId" = $1 ORDER BY "createdAt" ASC LIMIT 1', [
      userId
    ]);

    if (result.length === 0) return null;

    const applicationId = result[0].id;
    DEFAULT_APP_CACHE.set(userId, {
      id: applicationId,
      expires: now + 300000 // 5 minutes
    });

    return applicationId;
  } catch {
    return null;
  }
}

async function getCachedGatewayServiceId(): Promise<string | null> {
  const now = Date.now();

  if (GATEWAY_SERVICE_CACHE.id && now < GATEWAY_SERVICE_CACHE.expires) {
    return GATEWAY_SERVICE_CACHE.id;
  }

  try {
    const { dataSource } = await import('../db/datasource');
    const result = await dataSource.query('SELECT id FROM services WHERE name = $1 LIMIT 1', ['GraphQL Gateway']);

    if (result.length === 0) return null;

    GATEWAY_SERVICE_CACHE.id = result[0].id;
    GATEWAY_SERVICE_CACHE.expires = now + 600000; // 10 minutes

    return GATEWAY_SERVICE_CACHE.id;
  } catch {
    return null;
  }
}

// Minimal helper functions
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

  // Fallback to connection remote address if available
  return undefined;
}

function extractUserAgent(context: ExtendedYogaContextWithRequest): string | undefined {
  const request = context.request;
  if (!request) return undefined;

  return request.headers.get('user-agent') || undefined;
}

// Calculate request size in bytes
function calculateRequestSize(args: any): number | undefined {
  try {
    // Calculate size of query + variables + operation name
    let size = 0;

    if (args.document) {
      // Estimate query size (rough approximation)
      const queryString = args.document.loc?.source?.body || '';
      size += Buffer.byteLength(queryString, 'utf8');
    }

    if (args.variableValues) {
      size += Buffer.byteLength(JSON.stringify(args.variableValues), 'utf8');
    }

    if (args.operationName) {
      size += Buffer.byteLength(args.operationName, 'utf8');
    }

    return size > 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

// Calculate response size in bytes
function calculateResponseSize(result: any): number | undefined {
  try {
    if (!result) return undefined;

    const responseString = JSON.stringify(result);
    return Buffer.byteLength(responseString, 'utf8');
  } catch {
    return undefined;
  }
}
