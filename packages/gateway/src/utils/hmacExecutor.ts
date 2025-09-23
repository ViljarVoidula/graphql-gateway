import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { GraphQLError } from 'graphql';
import { Container } from 'typedi';
import { dataSource } from '../db/datasource';
import { Service } from '../entities/service.entity';
import { HMACUtils } from '../security/hmac';
import { keyManager } from '../security/keyManager';
import { AuditLogService } from '../services/audit/audit-log.service';
import { ConfigurationService } from '../services/config/configuration.service';
import { RequestLatencyService } from '../services/latency/request-latency.service';
import { ApplicationUsageService } from '../services/usage/application-usage.service';
import { log } from './logger';
import { withRemoteCallMetrics } from './telemetry/metrics';
import { withSpan } from './telemetry/tracing';

// Lazy loader for msgpack decoder (loaded only if a MsgPack response is actually received)
let msgpackDecode: ((buf: Uint8Array) => any) | null = null;
let msgpackDecodeLoading: Promise<void> | null = null;
async function ensureMsgPackDecodeLoaded() {
  if (msgpackDecode || msgpackDecodeLoading) return msgpackDecodeLoading;
  msgpackDecodeLoading = import('@msgpack/msgpack')
    .then((mod: any) => {
      if (typeof mod.decode === 'function') msgpackDecode = mod.decode;
    })
    .catch(() => {
      // Ignore; will just skip decoding
    })
    .finally(() => {
      msgpackDecodeLoading = null;
    });
  return msgpackDecodeLoading;
}

export interface HMACExecutorOptions {
  endpoint: string;
  timeout?: number;
  enableHMAC?: boolean;
  useMsgPack?: boolean; // when true, allow propagating x-msgpack-enabled header downstream
}

/**
 * Create an HTTP executor with HMAC signing capabilities
 */
export function buildHMACExecutor(options: HMACExecutorOptions): any {
  const { endpoint, timeout = 5000, enableHMAC = true, useMsgPack = false } = options;

  return buildHTTPExecutor({
    endpoint,
    timeout,
    fetch: async (url, requestOptions, context) => {
      // Get the original request object (context might be undefined during introspection)
      const req = context?.req ?? requestOptions;

      // Start with existing headers
      const headers: Record<string, string> = {};

      // Properly merge existing headers, but exclude Content-Length to avoid mismatches
      if (requestOptions.headers) {
        if (Array.isArray(requestOptions.headers)) {
          requestOptions.headers.forEach(([key, value]) => {
            if (key.toLowerCase() !== 'content-length') {
              headers[key] = value;
            }
          });
        } else {
          Object.entries(requestOptions.headers).forEach(([key, value]) => {
            if (typeof value === 'string' && key.toLowerCase() !== 'content-length') {
              headers[key] = value;
            }
          });
        }
      }

      // Add existing header passthrough logic from context request
      const contextHeaders = context?.req?.headers || {};

      if (contextHeaders.authorization) {
        headers['Authorization'] = contextHeaders.authorization;
      }

      if (contextHeaders.cookie) {
        headers['Cookie'] = contextHeaders.cookie;
      }

      if (contextHeaders['x-request-id']) {
        headers['x-request-id'] = contextHeaders['x-request-id'];
      }

      if (contextHeaders['x-correlation-id']) {
        headers['x-correlation-id'] = contextHeaders['x-correlation-id'];
      }

      if (contextHeaders.traceparent) {
        headers['traceparent'] = contextHeaders.traceparent;
      }

      // Propagate API key header to downstream if present (some downstream services may authorize at their edge)
      if (contextHeaders['x-api-key']) {
        headers['x-api-key'] = contextHeaders['x-api-key'];
      }

      // Propagate MessagePack preference if enabled for this service and present on incoming request
      if (useMsgPack) {
        // Always request msgpack from downstream if the service is configured for it
        headers['x-msgpack-enabled'] = '1';
        // Accept header for clarity (remote may ignore)
        headers['Accept'] = headers['Accept']
          ? headers['Accept'] + ',application/x-msgpack'
          : 'application/x-msgpack,application/json';
      }

      // Add HMAC signing if enabled
      if (enableHMAC) {
        const serviceKey = keyManager.getActiveKey(endpoint);
        if (serviceKey) {
          try {
            const method = requestOptions.method || 'POST';
            const body = requestOptions.body ? String(requestOptions.body) : undefined;

            const hmacHeaders = HMACUtils.createHeaders(
              {
                method,
                url: url.toString(),
                body,
                keyId: serviceKey.keyId
              },
              serviceKey.secretKey
            );

            // Add HMAC headers
            Object.assign(headers, hmacHeaders);

            log.debug(`Added HMAC signature for request to ${endpoint}, keyId: ${serviceKey.keyId}`);
          } catch (error) {
            log.error(`Failed to generate HMAC signature for ${endpoint}:`, error);
            // Continue without HMAC if signing fails
          }
        } else {
          log.warn(`No active HMAC key found for service: ${endpoint}`);
          // throw new GraphQLError(`No active HMAC key found for service: ${endpoint}`, {
          //   extensions: {
          //     code: 'HMAC_KEY_NOT_FOUND',
          //     service: endpoint
          //   }
          // });
        }
      }

      // Update request options with new headers
      const updatedOptions = {
        ...requestOptions,
        headers
      };

      // Enforce downstream authentication if configured: must have either user session or application (api-key)
      try {
        const config = Container.get(ConfigurationService);
        const enforce = await config.isDownstreamAuthEnforced();
        if (enforce) {
          // Only enforce for actual incoming requests (skip internal stitching/introspection calls where no req is present)
          const hasRequestContext = !!(context as any)?.req;
          const hasUser = !!(context as any)?.user?.id;
          const hasApp = !!(context as any)?.application?.id;
          if (hasRequestContext && !hasUser && !hasApp) {
            throw new GraphQLError(
              'Authentication required: downstream service requests require user session or application API key',
              {
                extensions: { code: 'UNAUTHENTICATED' }
              }
            );
          }
        }
      } catch (e) {
        // If configuration service unavailable, default to not enforcing to avoid breaking startup
        if (e instanceof GraphQLError) throw e;
      }

      // Debug logging
      log.debug(`Making request to ${url}`, {
        method: updatedOptions.method,
        hasBody: !!updatedOptions.body,
        bodyLength: updatedOptions.body ? String(updatedOptions.body).length : 0,
        headers: Object.keys(updatedOptions.headers || {})
      });

      return withSpan(
        'remote.graphql.request',
        () =>
          withRemoteCallMetrics({
            service: (() => {
              try {
                return new URL(String(url)).host;
              } catch {
                return 'unknown';
              }
            })(),
            url: String(url),
            method: String((updatedOptions as any).method || 'POST'),
            operation: 'GraphQL POST',
            fn: async () => {
              const serviceHost = (() => {
                try {
                  return new URL(String(url)).host;
                } catch {
                  return 'unknown';
                }
              })();
              const contextApp = (context as any)?.application; // Provided by auth layer for api-key
              const contextUser = (context as any)?.user; // User context if available
              const usageService = Container.has(ApplicationUsageService) ? Container.get(ApplicationUsageService) : null;
              const audit = Container.has(AuditLogService) ? Container.get(AuditLogService) : null;
              const latencyService = Container.has(RequestLatencyService) ? Container.get(RequestLatencyService) : null;

              // Look up service ID by URL for usage tracking
              let serviceId: string | undefined;
              try {
                const serviceRepository = dataSource.getRepository(Service);
                const service = await serviceRepository.findOne({ where: { url: String(url) } });
                serviceId = service?.id;
              } catch (error) {
                log.debug('Failed to resolve service ID for usage tracking:', error);
              }
              const start = Date.now();
              try {
                const res = await fetch(url, updatedOptions);
                const latencyMs = Date.now() - start;

                // Track downstream service latency if we have the required context
                if (latencyService && serviceId && contextApp) {
                  await latencyService.recordDownstreamLatency({
                    serviceId,
                    applicationId: contextApp.id,
                    userId: contextUser?.id,
                    serviceUrl: String(url),
                    latencyMs,
                    success: res.ok,
                    statusCode: res.status,
                    httpMethod: String((updatedOptions as any).method || 'POST'),
                    correlationId: headers['x-correlation-id'] || headers['x-request-id']
                    // TODO: Add request/response size tracking if needed
                  });
                }

                if (contextApp && usageService && serviceId) {
                  await usageService.increment(contextApp.id, serviceId, { error: !res.ok });
                }
                if (contextApp && audit) {
                  await audit.logApiRequest({
                    applicationId: contextApp.id,
                    serviceId,
                    serviceName: serviceHost,
                    statusCode: res.status,
                    latencyMs,
                    httpMethod: String((updatedOptions as any).method || 'POST'),
                    success: res.ok,
                    extraMetadata: { rawStatus: res.status, url: String(url) }
                  });
                }
                // If we requested msgpack, attempt transparent decode so gateway continues operating on JSON
                if (useMsgPack) {
                  try {
                    const contentType = res.headers.get('content-type') || '';
                    if (contentType.includes('application/x-msgpack')) {
                      const arrayBuffer = await res.arrayBuffer();
                      const originalSize = arrayBuffer.byteLength;
                      // Lazy import msgpack decoder from @msgpack/msgpack if available; fallback gracefully
                      let decoded: any = null;
                      try {
                        if (!msgpackDecode) {
                          await ensureMsgPackDecodeLoaded();
                        }
                        if (msgpackDecode) decoded = msgpackDecode(new Uint8Array(arrayBuffer));
                      } catch (e) {
                        log.warn('MsgPack decode failed, passing raw response', e);
                      }
                      if (decoded != null) {
                        try {
                          const jsonStr = JSON.stringify(decoded);
                          const jsonSize = Buffer.byteLength(jsonStr);
                          log.debug('MsgPack downstream stats', {
                            operation: 'msgpackDecode',
                            service: serviceHost,
                            endpoint: String(url),
                            msgpackBytes: originalSize,
                            jsonBytes: jsonSize,
                            savingsBytes: jsonSize - originalSize,
                            savingsPercent: jsonSize > 0 ? Math.round(((jsonSize - originalSize) / jsonSize) * 100) : 0
                          });
                          return new Response(jsonStr, {
                            status: res.status,
                            statusText: res.statusText,
                            headers: { 'content-type': 'application/json' }
                          });
                        } catch (encodeErr) {
                          log.warn('Failed to stringify decoded msgpack; falling back to raw', encodeErr);
                        }
                      }
                    }
                  } catch (e) {
                    log.warn('Failed to transparently decode msgpack response', e);
                  }
                }
                return res;
              } catch (error: any) {
                const latencyMs = Date.now() - start;
                log.error(`Fetch error for ${url}:`, error);

                // Track failed downstream service latency
                if (latencyService && serviceId && contextApp) {
                  await latencyService.recordDownstreamLatency({
                    serviceId,
                    applicationId: contextApp.id,
                    userId: contextUser?.id,
                    serviceUrl: String(url),
                    latencyMs,
                    success: false,
                    httpMethod: String((updatedOptions as any).method || 'POST'),
                    errorClass: error?.name,
                    errorMessage: error?.message?.slice(0, 300),
                    correlationId: headers['x-correlation-id'] || headers['x-request-id']
                  });
                }

                if (contextApp && usageService && serviceId) {
                  await usageService.increment(contextApp.id, serviceId, { error: true });
                }
                if (contextApp && audit) {
                  await audit.logApiRequest({
                    applicationId: contextApp.id,
                    serviceId,
                    serviceName: serviceHost,
                    statusCode: undefined,
                    latencyMs,
                    httpMethod: String((updatedOptions as any).method || 'POST'),
                    success: false,
                    errorClass: error?.name,
                    errorMessage: error?.message?.slice(0, 300),
                    extraMetadata: { networkError: true, url: String(url) }
                  });
                }
                throw new Error(`Failed to fetch from ${url}: ${error.message}`);
              }
            }
          }),
        { attributes: { 'url.full': String(url) } }
      );
    }
  });
}

/**
 * HMAC validation middleware for incoming requests
 */
export function createHMACValidationMiddleware(
  options: {
    timeoutMs?: number;
    required?: boolean;
  } = {}
) {
  const { timeoutMs = 5 * 60 * 1000, required = false } = options;

  return async (req: any, res: any, next: any) => {
    try {
      const hmacHeaders = HMACUtils.parseHeaders(req.headers);

      if (!hmacHeaders) {
        if (required) {
          return res.status(401).json({
            error: 'Missing HMAC headers',
            code: 'HMAC_MISSING'
          });
        }
        return next(); // Continue without HMAC validation
      }

      const { signature, timestamp, keyId } = hmacHeaders;

      // Get the service key
      const serviceKey = keyManager.getKey(keyId);
      if (!serviceKey) {
        return res.status(401).json({
          error: 'Invalid HMAC key ID',
          code: 'HMAC_INVALID_KEY'
        });
      }

      if (serviceKey.status !== 'active') {
        return res.status(401).json({
          error: 'HMAC key is not active',
          code: 'HMAC_KEY_INACTIVE'
        });
      }

      // Check if key is expired
      if (serviceKey.expiresAt && serviceKey.expiresAt < new Date()) {
        return res.status(401).json({
          error: 'HMAC key has expired',
          code: 'HMAC_KEY_EXPIRED'
        });
      }

      // Get request body for validation
      let body = '';
      if (req.body) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }

      // Verify HMAC signature
      const isValid = HMACUtils.verifySignature(
        {
          method: req.method,
          url: req.originalUrl || req.url,
          body,
          timestamp,
          keyId
        },
        signature,
        serviceKey.secretKey,
        timeoutMs
      );

      if (!isValid) {
        return res.status(401).json({
          error: 'Invalid HMAC signature',
          code: 'HMAC_INVALID_SIGNATURE'
        });
      }

      // Add service info to request context
      req.hmacValidated = true;
      req.serviceKey = serviceKey;

      next();
    } catch (error) {
      log.error('HMAC validation error:', error);

      if (required) {
        return res.status(500).json({
          error: 'HMAC validation failed',
          code: 'HMAC_VALIDATION_ERROR'
        });
      }

      next(); // Continue without HMAC validation if not required
    }
  };
}

/**
 * Generate HMAC key for a service and return key info
 */
export function generateServiceKey(serviceUrl: string): {
  keyId: string;
  secretKey: string;
  instructions: string;
} {
  const key = keyManager.generateKey(serviceUrl);

  return {
    keyId: key.keyId,
    secretKey: key.secretKey,
    instructions: `
To authenticate requests to this gateway, include these headers:
- X-HMAC-Signature: HMAC-SHA256 signature of the request
- X-HMAC-Timestamp: Unix timestamp in milliseconds
- X-HMAC-Key-ID: ${key.keyId}

The HMAC signature should be calculated from:
METHOD\\nURL\\nBODY_SHA256\\nTIMESTAMP\\nKEY_ID

Example implementation available in gateway documentation.
    `.trim()
  };
}
