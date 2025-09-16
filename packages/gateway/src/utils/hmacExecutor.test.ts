import { parse } from 'graphql';
import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { HMACUtils } from '../security/hmac';
import { keyManager } from '../security/keyManager';
import { buildHMACExecutor, createHMACValidationMiddleware, generateServiceKey } from './hmacExecutor';

// Mock Date.now() to have predictable timestamps
const MOCK_TIMESTAMP = 1672531200000; // 2023-01-01T00:00:00.000Z
mock.method(Date, 'now', () => MOCK_TIMESTAMP);

// Mock dependencies
const mockActiveKey = {
  keyId: 'test-key-id',
  secretKey: 'test-secret-key',
  serviceUrl: 'http://service.com/graphql',
  status: 'active' as const,
  createdAt: new Date(MOCK_TIMESTAMP - 10000),
  expiresAt: null
};

const mockInactiveKey = {
  ...mockActiveKey,
  keyId: 'inactive-key',
  secretKey: 'inactive-secret',
  status: 'inactive' as const
};

const mockExpiredKey = {
  ...mockActiveKey,
  keyId: 'expired-key',
  secretKey: 'expired-secret',
  expiresAt: new Date(MOCK_TIMESTAMP - 1)
};

mock.method(keyManager, 'getActiveKey', (endpoint: string) => {
  if (endpoint === 'http://service.com/graphql') {
    return mockActiveKey;
  }
  return null;
});

mock.method(keyManager, 'getKey', (keyId: string) => {
  if (keyId === 'test-key-id') return mockActiveKey;
  if (keyId === 'inactive-key') return mockInactiveKey;
  if (keyId === 'expired-key') return mockExpiredKey;
  return null;
});

mock.method(keyManager, 'generateKey', (serviceUrl: string) => ({
  keyId: 'new-key-id',
  secretKey: 'new-secret-key',
  serviceUrl,
  status: 'active' as const,
  createdAt: new Date(),
  expiresAt: null
}));

const mockHmacHeaders = {
  'x-hmac-signature': 'signed-signature',
  'x-hmac-timestamp': String(MOCK_TIMESTAMP),
  'x-hmac-key-id': 'test-key-id'
};

mock.method(HMACUtils, 'createHeaders', () => mockHmacHeaders);
mock.method(HMACUtils, 'verifySignature', () => true);
mock.method(HMACUtils, 'parseHeaders', (headers: Record<string, any>) => {
  if (headers['x-hmac-key-id']) {
    return {
      signature: headers['x-hmac-signature'],
      timestamp: headers['x-hmac-timestamp'],
      keyId: headers['x-hmac-key-id']
    };
  }
  return null;
});

describe('hmacExecutor', () => {
  beforeEach(() => {
    // Restore all mocks before each test
    mock.restoreAll();

    // Re-apply mocks for each test
    mock.method(Date, 'now', () => MOCK_TIMESTAMP);

    mock.method(keyManager, 'getActiveKey', (endpoint: string) => {
      if (endpoint === 'http://service.com/graphql') {
        return mockActiveKey;
      }
      return null;
    });

    mock.method(keyManager, 'getKey', (keyId: string) => {
      if (keyId === 'test-key-id') return mockActiveKey;
      if (keyId === 'inactive-key') return mockInactiveKey;
      if (keyId === 'expired-key') return mockExpiredKey;
      return null;
    });

    mock.method(HMACUtils, 'createHeaders', () => mockHmacHeaders);
    mock.method(HMACUtils, 'verifySignature', () => true);
    mock.method(HMACUtils, 'parseHeaders', (headers: Record<string, any>) => {
      if (headers['x-hmac-key-id']) {
        return {
          signature: headers['x-hmac-signature'],
          timestamp: String(headers['x-hmac-timestamp']),
          keyId: headers['x-hmac-key-id']
        };
      }
      return null;
    });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('buildHMACExecutor', () => {
    let originalFetch: typeof global.fetch;
    let mockFetch: any;

    beforeEach(() => {
      mockFetch = mock.fn(async () => new Response('{}', { status: 200 }));
      originalFetch = global.fetch;
      global.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should add HMAC headers to requests when enabled', async () => {
      const executor = buildHMACExecutor({ endpoint: 'http://service.com/graphql' });
      const request = { document: parse('query { hello }'), variables: {}, extensions: {} };

      await executor(request);

      const fetchOptions = mockFetch.mock.calls[0].arguments[1];
      assert.strictEqual(fetchOptions.headers['x-hmac-signature'], 'signed-signature');
      assert.strictEqual(fetchOptions.headers['x-hmac-key-id'], 'test-key-id');
      assert.strictEqual(fetchOptions.headers['x-hmac-timestamp'], String(MOCK_TIMESTAMP));
    });

    it('should not add HMAC headers if disabled', async () => {
      const executor = buildHMACExecutor({ endpoint: 'http://service.com/graphql', enableHMAC: false });
      const request = { document: parse('query { hello }'), variables: {}, extensions: {} };

      await executor(request);

      const fetchOptions = mockFetch.mock.calls[0].arguments[1];
      assert.strictEqual(fetchOptions.headers['x-hmac-signature'], undefined);
    });

    it('should passthrough specified headers from context', async () => {
      const executor = buildHMACExecutor({ endpoint: 'http://service.com/graphql' });
      const request = {
        document: parse('query { hello }'),
        variables: {},
        extensions: {},
        context: {
          req: {
            headers: {
              authorization: 'Bearer token',
              cookie: 'session=123',
              'x-request-id': 'req-id',
              'x-correlation-id': 'corr-id',
              traceparent: 'trace-p'
            }
          }
        }
      };

      await executor(request);

      const fetchOptions = mockFetch.mock.calls[0].arguments[1];
      assert.strictEqual(fetchOptions.headers['Authorization'], 'Bearer token');
      assert.strictEqual(fetchOptions.headers['Cookie'], 'session=123');
      assert.strictEqual(fetchOptions.headers['x-request-id'], 'req-id');
      assert.strictEqual(fetchOptions.headers['x-correlation-id'], 'corr-id');
      assert.strictEqual(fetchOptions.headers['traceparent'], 'trace-p');
    });

    it('should handle HMAC creation errors gracefully', async () => {
      mock.method(
        HMACUtils,
        'createHeaders',
        () => {
          throw new Error('Signing failed');
        },
        { times: 1 }
      );
      const executor = buildHMACExecutor({ endpoint: 'http://service.com/graphql' });
      const request = { document: parse('query { hello }'), variables: {}, extensions: {} };

      await executor(request);

      const fetchOptions = mockFetch.mock.calls[0].arguments[1];
      assert.strictEqual(fetchOptions.headers['x-hmac-signature'], undefined, 'Should not add HMAC headers on error');
    });

    it('should always send x-msgpack-enabled when service useMsgPack is true (independent of client header)', async () => {
      const executor = buildHMACExecutor({ endpoint: 'http://service.com/graphql', useMsgPack: true });
      const request = { document: parse('query { test }'), variables: {}, extensions: {}, context: { req: { headers: {} } } };
      await executor(request);
      const fetchOptions = mockFetch.mock.calls[0].arguments[1];
      assert.strictEqual(fetchOptions.headers['x-msgpack-enabled'], '1');
    });
  });

  describe('createHMACValidationMiddleware', () => {
    let req: any, res: any, next: any;

    beforeEach(() => {
      req = {
        method: 'POST',
        originalUrl: '/graphql',
        headers: { ...mockHmacHeaders },
        body: { query: '{ hello }' }
      };
      res = {
        status: mock.fn(() => res),
        json: mock.fn()
      };
      next = mock.fn();
    });

    it('should call next() if HMAC is valid', async () => {
      const middleware = createHMACValidationMiddleware();
      await middleware(req, res, next);

      assert.strictEqual(next.mock.callCount(), 1, 'next() should be called once');
      assert.strictEqual(res.status.mock.callCount(), 0, 'res.status() should not be called');
      assert.strictEqual(req.hmacValidated, true);
      assert.deepStrictEqual(req.serviceKey, mockActiveKey);
    });

    it('should reject with 401 if signature is invalid', async () => {
      mock.method(HMACUtils, 'verifySignature', () => false);
      const middleware = createHMACValidationMiddleware();
      await middleware(req, res, next);

      assert.strictEqual(next.mock.callCount(), 0);
      assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
      assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
        error: 'Invalid HMAC signature',
        code: 'HMAC_INVALID_SIGNATURE'
      });
    });

    it('should reject with 401 if headers are missing and required is true', async () => {
      req.headers = {};
      const middleware = createHMACValidationMiddleware({ required: true });
      await middleware(req, res, next);

      assert.strictEqual(next.mock.callCount(), 0);
      assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
      assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
        error: 'Missing HMAC headers',
        code: 'HMAC_MISSING'
      });
    });

    it('should call next() if headers are missing and required is false', async () => {
      req.headers = {};
      const middleware = createHMACValidationMiddleware({ required: false });
      await middleware(req, res, next);

      assert.strictEqual(next.mock.callCount(), 1);
      assert.strictEqual(res.status.mock.callCount(), 0);
    });

    it('should reject with 401 if key ID is invalid', async () => {
      req.headers['x-hmac-key-id'] = 'unknown-key';
      mock.method(keyManager, 'getKey', () => null); // Explicitly mock for this case
      const middleware = createHMACValidationMiddleware();
      await middleware(req, res, next);

      assert.strictEqual(next.mock.callCount(), 0);
      assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
      assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
        error: 'Invalid HMAC key ID',
        code: 'HMAC_INVALID_KEY'
      });
    });

    it('should reject with 401 if key is inactive', async () => {
      req.headers['x-hmac-key-id'] = 'inactive-key';
      const middleware = createHMACValidationMiddleware();
      await middleware(req, res, next);

      assert.strictEqual(next.mock.callCount(), 0);
      assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
      assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
        error: 'HMAC key is not active',
        code: 'HMAC_KEY_INACTIVE'
      });
    });

    it('should reject with 401 if key is expired', async () => {
      req.headers['x-hmac-key-id'] = 'expired-key';
      const middleware = createHMACValidationMiddleware();
      await middleware(req, res, next);

      assert.strictEqual(next.mock.callCount(), 0);
      assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);
      assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
        error: 'HMAC key has expired',
        code: 'HMAC_KEY_EXPIRED'
      });
    });

    it('should handle validation errors and respond with 500 if required', async () => {
      mock.method(
        HMACUtils,
        'parseHeaders',
        () => {
          throw new Error('Parsing failed');
        },
        { times: 1 }
      );
      const middleware = createHMACValidationMiddleware({ required: true });
      await middleware(req, res, next);

      assert.strictEqual(next.mock.callCount(), 0);
      assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);
      assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
        error: 'HMAC validation failed',
        code: 'HMAC_VALIDATION_ERROR'
      });
    });
  });

  describe('generateServiceKey', () => {
    it('should return a new key and instructions', () => {
      const serviceUrl = 'http://new-service.com/graphql';

      // This function doesn't have external dependencies, so we test its actual output
      // We can mock keyManager.generateKey if we want to test the output of generateServiceKey in isolation
      const generatedKey = {
        keyId: 'a-real-key-id',
        secretKey: 'a-real-secret-key',
        serviceUrl,
        status: 'active' as const,
        createdAt: new Date(),
        expiresAt: null
      };
      mock.method(keyManager, 'generateKey', () => generatedKey);

      const result = generateServiceKey(serviceUrl);

      assert.strictEqual(result.keyId, generatedKey.keyId);
      assert.strictEqual(result.secretKey, generatedKey.secretKey);
      assert.ok(result.instructions.includes(`X-HMAC-Key-ID: ${generatedKey.keyId}`));
    });
  });
});
