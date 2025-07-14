import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { HMACUtils } from '../security/hmac';
import { keyManager } from '../security/keyManager';
import { log } from './logger';

export interface HMACExecutorOptions {
  endpoint: string;
  timeout?: number;
  enableHMAC?: boolean;
}

/**
 * Create an HTTP executor with HMAC signing capabilities
 */
export function buildHMACExecutor(options: HMACExecutorOptions): any {
  const { endpoint, timeout = 5000, enableHMAC = true } = options;

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

      // Debug logging
      log.debug(`Making request to ${url}`, {
        method: updatedOptions.method,
        hasBody: !!updatedOptions.body,
        bodyLength: updatedOptions.body ? String(updatedOptions.body).length : 0,
        headers: Object.keys(updatedOptions.headers || {})
      });

      return fetch(url, updatedOptions).catch((error) => {
        log.error(`Fetch error for ${url}:`, error);
        throw new Error(`Failed to fetch from ${url}: ${error.message}`);
      });
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
