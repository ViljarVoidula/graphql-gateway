import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { ExecutionRequest } from '@graphql-tools/utils';
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
export function buildHMACExecutor(options: HMACExecutorOptions) {
  const { endpoint, timeout = 5000, enableHMAC = true } = options;

  return buildHTTPExecutor({
    endpoint,
    timeout,
    fetch: async (url, requestOptions, context) => {
      // Get the original request object (context might be undefined during introspection)
      const req = context?.req ?? requestOptions;
      
      // Start with existing headers
      const headers: Record<string, string> = {};
      
      // Properly merge existing headers
      if (req.headers) {
        if (Array.isArray(requestOptions.headers)) {
          req.headers.forEach(([key, value]) => {
            headers[key] = value;
          });
        } else {
          Object.entries(req.headers).forEach(([key, value]) => {
            if (typeof value === 'string') {
              headers[key] = value;
            }
          });
        }
      }

      // Add existing header passthrough logic
      if (req.headers?.authorization) {
        headers['Authorization'] = req.headers.authorization;
      }

      if (req.headers?.cookie) {
        headers['Cookie'] = req.headers.cookie;
      }

      if (req.headers?.['x-request-id']) {
        headers['x-request-id'] = req.headers['x-request-id'];
      }

      if (req.headers?.['x-correlation-id']) {
        headers['x-correlation-id'] = req.headers['x-correlation-id'];
      }

      if (req.headers?.traceparent) {
        headers['traceparent'] = req.headers.traceparent;
      }

      // Add HMAC signing if enabled
      if (enableHMAC) {
        const serviceKey = keyManager.getActiveKey(endpoint);
        if (serviceKey) {
          try {
            const method = req.method || 'POST';
            const body = req.body ? String(req.body) : undefined;
            
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
        }
      }

      // Update request options with new headers
      const updatedOptions = {
        ...requestOptions,
        headers,
      };

      return fetch(url, updatedOptions).catch((error) => {
        log.error(`Fetch error for ${url}:`, error);
        throw new Error(`Failed to fetch from ${url}: ${error.message}`);
      })
    }
  });
}

/**
 * HMAC validation middleware for incoming requests
 */
export function createHMACValidationMiddleware(options: {
  timeoutMs?: number;
  required?: boolean;
} = {}) {
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
