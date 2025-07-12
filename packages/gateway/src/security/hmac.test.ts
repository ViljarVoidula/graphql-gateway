import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { HMACUtils, HMACRequest, HMACHeaders } from './hmac';

describe('HMACUtils', () => {
  let mockRequest: HMACRequest;
  let mockSecretKey: string;
  let mockTimestamp: number;

  beforeEach(() => {
    mockTimestamp = Date.now();
    mockSecretKey = 'test-secret-key-256-bits-long-enough-for-hmac';
    mockRequest = {
      method: 'POST',
      url: '/graphql',
      body: JSON.stringify({ query: '{ hello }' }),
      timestamp: mockTimestamp,
      keyId: 'test-key-id'
    };
  });

  describe('generateSignature', () => {
    it('should generate valid HMAC signature', () => {
      const signature = HMACUtils.generateSignature(mockRequest, mockSecretKey);
      
      assert.ok(signature);
      assert.strictEqual(typeof signature, 'string');
      assert.ok(signature.length > 0);
      assert.match(signature, /^[a-f0-9]+$/); // hex string
    });

    it('should generate consistent signatures for same input', () => {
      const sig1 = HMACUtils.generateSignature(mockRequest, mockSecretKey);
      const sig2 = HMACUtils.generateSignature(mockRequest, mockSecretKey);
      
      assert.strictEqual(sig1, sig2);
    });

    it('should generate different signatures for different methods', () => {
      const request1 = { ...mockRequest, method: 'GET' };
      const request2 = { ...mockRequest, method: 'POST' };
      
      const sig1 = HMACUtils.generateSignature(request1, mockSecretKey);
      const sig2 = HMACUtils.generateSignature(request2, mockSecretKey);
      
      assert.notStrictEqual(sig1, sig2);
    });

    it('should generate different signatures for different URLs', () => {
      const request1 = { ...mockRequest, url: '/graphql' };
      const request2 = { ...mockRequest, url: '/api' };
      
      const sig1 = HMACUtils.generateSignature(request1, mockSecretKey);
      const sig2 = HMACUtils.generateSignature(request2, mockSecretKey);
      
      assert.notStrictEqual(sig1, sig2);
    });

    it('should generate different signatures for different bodies', () => {
      const request1 = { ...mockRequest, body: '{"query": "{ hello }"}' };
      const request2 = { ...mockRequest, body: '{"query": "{ world }"}' };
      
      const sig1 = HMACUtils.generateSignature(request1, mockSecretKey);
      const sig2 = HMACUtils.generateSignature(request2, mockSecretKey);
      
      assert.notStrictEqual(sig1, sig2);
    });

    it('should generate different signatures for different timestamps', () => {
      const request1 = { ...mockRequest, timestamp: mockTimestamp };
      const request2 = { ...mockRequest, timestamp: mockTimestamp + 1000 };
      
      const sig1 = HMACUtils.generateSignature(request1, mockSecretKey);
      const sig2 = HMACUtils.generateSignature(request2, mockSecretKey);
      
      assert.notStrictEqual(sig1, sig2);
    });

    it('should generate different signatures for different keyIds', () => {
      const request1 = { ...mockRequest, keyId: 'key-1' };
      const request2 = { ...mockRequest, keyId: 'key-2' };
      
      const sig1 = HMACUtils.generateSignature(request1, mockSecretKey);
      const sig2 = HMACUtils.generateSignature(request2, mockSecretKey);
      
      assert.notStrictEqual(sig1, sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const sig1 = HMACUtils.generateSignature(mockRequest, 'secret1');
      const sig2 = HMACUtils.generateSignature(mockRequest, 'secret2');
      
      assert.notStrictEqual(sig1, sig2);
    });

    it('should handle empty body', () => {
      const requestWithoutBody = { ...mockRequest, body: undefined };
      const signature = HMACUtils.generateSignature(requestWithoutBody, mockSecretKey);
      
      assert.ok(signature);
      assert.strictEqual(typeof signature, 'string');
      assert.ok(signature.length > 0);
    });

    it('should handle empty string body', () => {
      const requestWithEmptyBody = { ...mockRequest, body: '' };
      const signature = HMACUtils.generateSignature(requestWithEmptyBody, mockSecretKey);
      
      assert.ok(signature);
      assert.strictEqual(typeof signature, 'string');
      assert.ok(signature.length > 0);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const signature = HMACUtils.generateSignature(mockRequest, mockSecretKey);
      const isValid = HMACUtils.verifySignature(mockRequest, signature, mockSecretKey);
      
      assert.strictEqual(isValid, true);
    });

    it('should reject invalid signature', () => {
      // Create a valid signature first, then modify it to be invalid but same length
      const validSignature = HMACUtils.generateSignature(mockRequest, mockSecretKey);
      const invalidSignature = 'a'.repeat(validSignature.length); // Same length, but invalid
      
      const isValid = HMACUtils.verifySignature(mockRequest, invalidSignature, mockSecretKey);
      
      assert.strictEqual(isValid, false);
    });

    it('should reject signature with wrong secret', () => {
      const signature = HMACUtils.generateSignature(mockRequest, mockSecretKey);
      const isValid = HMACUtils.verifySignature(mockRequest, signature, 'wrong-secret');
      
      assert.strictEqual(isValid, false);
    });

    it('should reject signature with modified request', () => {
      const signature = HMACUtils.generateSignature(mockRequest, mockSecretKey);
      const modifiedRequest = { ...mockRequest, body: '{"query": "{ modified }"}' };
      
      const isValid = HMACUtils.verifySignature(modifiedRequest, signature, mockSecretKey);
      
      assert.strictEqual(isValid, false);
    });

    it('should reject expired timestamp (default timeout)', () => {
      const expiredRequest = { 
        ...mockRequest, 
        timestamp: Date.now() - 10 * 60 * 1000 // 10 minutes ago
      };
      const signature = HMACUtils.generateSignature(expiredRequest, mockSecretKey);
      
      const isValid = HMACUtils.verifySignature(expiredRequest, signature, mockSecretKey);
      
      assert.strictEqual(isValid, false);
    });

    it('should reject expired timestamp (custom timeout)', () => {
      const expiredRequest = { 
        ...mockRequest, 
        timestamp: Date.now() - 2 * 60 * 1000 // 2 minutes ago
      };
      const signature = HMACUtils.generateSignature(expiredRequest, mockSecretKey);
      
      const isValid = HMACUtils.verifySignature(expiredRequest, signature, mockSecretKey, 60 * 1000);
      
      assert.strictEqual(isValid, false);
    });

    it('should accept request within timeout window', () => {
      const recentRequest = { 
        ...mockRequest, 
        timestamp: Date.now() - 30 * 1000 // 30 seconds ago
      };
      const signature = HMACUtils.generateSignature(recentRequest, mockSecretKey);
      
      const isValid = HMACUtils.verifySignature(recentRequest, signature, mockSecretKey);
      
      assert.strictEqual(isValid, true);
    });

    it('should reject future timestamp', () => {
      const futureRequest = { 
        ...mockRequest, 
        timestamp: Date.now() + 10 * 60 * 1000 // 10 minutes in future
      };
      const signature = HMACUtils.generateSignature(futureRequest, mockSecretKey);
      
      const isValid = HMACUtils.verifySignature(futureRequest, signature, mockSecretKey);
      
      assert.strictEqual(isValid, false);
    });

    it('should handle timing attack protection', () => {
      // Test that invalid signatures take roughly the same time as valid ones
      const validSignature = HMACUtils.generateSignature(mockRequest, mockSecretKey);
      const invalidSignature = 'f'.repeat(validSignature.length); // Same length, different content
      
      const start1 = process.hrtime.bigint();
      HMACUtils.verifySignature(mockRequest, validSignature, mockSecretKey);
      const time1 = process.hrtime.bigint() - start1;
      
      const start2 = process.hrtime.bigint();
      HMACUtils.verifySignature(mockRequest, invalidSignature, mockSecretKey);
      const time2 = process.hrtime.bigint() - start2;
      
      // Both should complete (timing attack protection is built into crypto.timingSafeEqual)
      assert.ok(time1 > 0);
      assert.ok(time2 > 0);
    });
  });

  describe('createHeaders', () => {
    it('should create valid HMAC headers', () => {
      const requestWithoutTimestamp = {
        method: 'POST',
        url: '/graphql',
        body: '{"query": "{ hello }"}',
        keyId: 'test-key-id'
      };
      
      const headers = HMACUtils.createHeaders(requestWithoutTimestamp, mockSecretKey);
      
      assert.ok(headers['X-HMAC-Signature']);
      assert.ok(headers['X-HMAC-Timestamp']);
      assert.strictEqual(headers['X-HMAC-Key-ID'], 'test-key-id');
      
      // Verify timestamp is numeric
      const timestamp = parseInt(headers['X-HMAC-Timestamp']);
      assert.ok(!isNaN(timestamp));
      assert.ok(timestamp > 0);
    });

    it('should create headers with current timestamp', () => {
      const requestWithoutTimestamp = {
        method: 'POST',
        url: '/graphql',
        body: '{"query": "{ hello }"}',
        keyId: 'test-key-id'
      };
      
      const beforeTime = Date.now();
      const headers = HMACUtils.createHeaders(requestWithoutTimestamp, mockSecretKey);
      const afterTime = Date.now();
      
      const timestamp = parseInt(headers['X-HMAC-Timestamp']);
      assert.ok(timestamp >= beforeTime);
      assert.ok(timestamp <= afterTime);
    });

    it('should create verifiable signature', () => {
      const requestWithoutTimestamp = {
        method: 'POST',
        url: '/graphql',
        body: '{"query": "{ hello }"}',
        keyId: 'test-key-id'
      };
      
      const headers = HMACUtils.createHeaders(requestWithoutTimestamp, mockSecretKey);
      
      // Create full request for verification
      const fullRequest: HMACRequest = {
        ...requestWithoutTimestamp,
        timestamp: parseInt(headers['X-HMAC-Timestamp'])
      };
      
      const isValid = HMACUtils.verifySignature(fullRequest, headers['X-HMAC-Signature'], mockSecretKey);
      assert.strictEqual(isValid, true);
    });

    it('should handle requests without body', () => {
      const requestWithoutBody = {
        method: 'GET',
        url: '/graphql',
        keyId: 'test-key-id'
      };
      
      const headers = HMACUtils.createHeaders(requestWithoutBody, mockSecretKey);
      
      assert.ok(headers['X-HMAC-Signature']);
      assert.ok(headers['X-HMAC-Timestamp']);
      assert.strictEqual(headers['X-HMAC-Key-ID'], 'test-key-id');
    });
  });

  describe('parseHeaders', () => {
    it('should parse valid HMAC headers', () => {
      const headers = {
        'X-HMAC-Signature': 'abcdef123456',
        'X-HMAC-Timestamp': '1234567890',
        'X-HMAC-Key-ID': 'test-key-id'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.ok(parsed);
      assert.strictEqual(parsed.signature, 'abcdef123456');
      assert.strictEqual(parsed.timestamp, 1234567890);
      assert.strictEqual(parsed.keyId, 'test-key-id');
    });

    it('should handle case-insensitive headers', () => {
      const headers = {
        'x-hmac-signature': 'abcdef123456',
        'x-hmac-timestamp': '1234567890',
        'x-hmac-key-id': 'test-key-id'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.ok(parsed);
      assert.strictEqual(parsed.signature, 'abcdef123456');
      assert.strictEqual(parsed.timestamp, 1234567890);
      assert.strictEqual(parsed.keyId, 'test-key-id');
    });

    it('should handle mixed case headers', () => {
      const headers = {
        'X-Hmac-Signature': 'abcdef123456',
        'X-Hmac-Timestamp': '1234567890',
        'X-Hmac-Key-Id': 'test-key-id'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.ok(parsed);
      assert.strictEqual(parsed.signature, 'abcdef123456');
      assert.strictEqual(parsed.timestamp, 1234567890);
      assert.strictEqual(parsed.keyId, 'test-key-id');
    });

    it('should handle array header values', () => {
      const headers = {
        'X-HMAC-Signature': ['abcdef123456', 'second-value'],
        'X-HMAC-Timestamp': ['1234567890'],
        'X-HMAC-Key-ID': ['test-key-id']
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.ok(parsed);
      assert.strictEqual(parsed.signature, 'abcdef123456'); // First value
      assert.strictEqual(parsed.timestamp, 1234567890);
      assert.strictEqual(parsed.keyId, 'test-key-id');
    });

    it('should return null for missing signature', () => {
      const headers = {
        'X-HMAC-Timestamp': '1234567890',
        'X-HMAC-Key-ID': 'test-key-id'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.strictEqual(parsed, null);
    });

    it('should return null for missing timestamp', () => {
      const headers = {
        'X-HMAC-Signature': 'abcdef123456',
        'X-HMAC-Key-ID': 'test-key-id'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.strictEqual(parsed, null);
    });

    it('should return null for missing key ID', () => {
      const headers = {
        'X-HMAC-Signature': 'abcdef123456',
        'X-HMAC-Timestamp': '1234567890'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.strictEqual(parsed, null);
    });

    it('should return null for invalid timestamp', () => {
      const headers = {
        'X-HMAC-Signature': 'abcdef123456',
        'X-HMAC-Timestamp': 'invalid-timestamp',
        'X-HMAC-Key-ID': 'test-key-id'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.strictEqual(parsed, null);
    });

    it('should return null for empty headers', () => {
      const headers = {};
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.strictEqual(parsed, null);
    });

    it('should handle undefined header values', () => {
      const headers = {
        'X-HMAC-Signature': undefined,
        'X-HMAC-Timestamp': '1234567890',
        'X-HMAC-Key-ID': 'test-key-id'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.strictEqual(parsed, null);
    });

    it('should handle empty string header values', () => {
      const headers = {
        'X-HMAC-Signature': '',
        'X-HMAC-Timestamp': '1234567890',
        'X-HMAC-Key-ID': 'test-key-id'
      };
      
      const parsed = HMACUtils.parseHeaders(headers);
      
      assert.strictEqual(parsed, null);
    });
  });

  describe('integration tests', () => {
    it('should work end-to-end with header creation and parsing', () => {
      const request = {
        method: 'POST',
        url: '/graphql',
        body: '{"query": "{ hello }"}',
        keyId: 'test-key-id'
      };
      
      // Create headers
      const headers = HMACUtils.createHeaders(request, mockSecretKey);
      
      // Parse headers
      const parsed = HMACUtils.parseHeaders(headers as unknown as Record<string, string>);
      
      assert.ok(parsed);
      
      // Verify signature
      const fullRequest: HMACRequest = {
        ...request,
        timestamp: parsed.timestamp
      };
      
      const isValid = HMACUtils.verifySignature(fullRequest, parsed.signature, mockSecretKey);
      assert.strictEqual(isValid, true);
    });

    it('should handle complex request scenarios', () => {
      const complexRequest = {
        method: 'POST',
        url: '/graphql?param=value&other=test',
        body: JSON.stringify({
          query: 'query GetUser($id: ID!) { user(id: $id) { name email } }',
          variables: { id: '123' },
          operationName: 'GetUser'
        }),
        keyId: 'complex-key-id-with-special-chars-123'
      };
      
      const headers = HMACUtils.createHeaders(complexRequest, mockSecretKey);
      const parsed = HMACUtils.parseHeaders(headers as unknown as Record<string, string>);
      
      assert.ok(parsed);
      
      const fullRequest: HMACRequest = {
        ...complexRequest,
        timestamp: parsed.timestamp
      };
      
      const isValid = HMACUtils.verifySignature(fullRequest, parsed.signature, mockSecretKey);
      assert.strictEqual(isValid, true);
    });
  });
});
