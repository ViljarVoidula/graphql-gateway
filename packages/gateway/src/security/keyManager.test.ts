import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { KeyManager, ServiceKey, ServiceKeyInfo, keyManager } from './keyManager';

describe('KeyManager', () => {
  let testKeyManager: KeyManager;
  let mockServiceUrl: string;

  beforeEach(() => {
    testKeyManager = new KeyManager();
    mockServiceUrl = 'http://test-service.com/graphql';
  });

  afterEach(() => {
    // Clean up any keys created during tests
    testKeyManager.removeService(mockServiceUrl);
  });

  describe('generateKey', () => {
    it('should generate a new key for a service', () => {
      const key = testKeyManager.generateKey(mockServiceUrl);

      assert.ok(key);
      assert.ok(key.keyId);
      assert.ok(key.secretKey);
      assert.ok(key.createdAt);
      assert.strictEqual(key.status, 'active');
      assert.strictEqual(key.expiresAt, undefined);

      // Verify key ID format
      assert.match(key.keyId, /^[a-f0-9]{8}_[a-z0-9]+_[a-f0-9]{16}$/);

      // Verify secret key format (64 hex characters for 32 bytes)
      assert.match(key.secretKey, /^[a-f0-9]{64}$/);
    });

    it('should generate unique keys for same service', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      assert.notStrictEqual(key1.keyId, key2.keyId);
      assert.notStrictEqual(key1.secretKey, key2.secretKey);
    });

    it('should generate different keys for different services', () => {
      const service1 = 'http://service1.com/graphql';
      const service2 = 'http://service2.com/graphql';

      const key1 = testKeyManager.generateKey(service1);
      const key2 = testKeyManager.generateKey(service2);

      assert.notStrictEqual(key1.keyId, key2.keyId);
      assert.notStrictEqual(key1.secretKey, key2.secretKey);

      // Different services should have different URL hash prefixes
      const prefix1 = key1.keyId.split('_')[0];
      const prefix2 = key2.keyId.split('_')[0];
      assert.notStrictEqual(prefix1, prefix2);
    });

    it('should track keys by service URL', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      const serviceKeys = testKeyManager.getServiceKeys(mockServiceUrl);

      assert.strictEqual(serviceKeys.length, 2);
      assert.ok(serviceKeys.some((k) => k.keyId === key1.keyId));
      assert.ok(serviceKeys.some((k) => k.keyId === key2.keyId));
    });
  });

  describe('getActiveKey', () => {
    it('should return null for service with no keys', () => {
      const activeKey = testKeyManager.getActiveKey('http://nonexistent.com/graphql');

      assert.strictEqual(activeKey, null);
    });

    it('should return the most recent active key', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);

      // Wait a bit to ensure different timestamps
      setTimeout(() => {
        const key2 = testKeyManager.generateKey(mockServiceUrl);

        const activeKey = testKeyManager.getActiveKey(mockServiceUrl);

        assert.ok(activeKey);
        assert.strictEqual(activeKey.keyId, key2.keyId);
      }, 10);
    });

    it('should ignore revoked keys', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      // Revoke the newer key
      testKeyManager.revokeKey(key2.keyId);

      const activeKey = testKeyManager.getActiveKey(mockServiceUrl);

      assert.ok(activeKey);
      assert.strictEqual(activeKey.keyId, key1.keyId);
    });

    it('should return null if all keys are revoked', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      testKeyManager.revokeKey(key1.keyId);
      testKeyManager.revokeKey(key2.keyId);

      const activeKey = testKeyManager.getActiveKey(mockServiceUrl);

      assert.strictEqual(activeKey, null);
    });
  });

  describe('getKey', () => {
    it('should return key by keyId', () => {
      const originalKey = testKeyManager.generateKey(mockServiceUrl);

      const retrievedKey = testKeyManager.getKey(originalKey.keyId);

      assert.ok(retrievedKey);
      assert.strictEqual(retrievedKey.keyId, originalKey.keyId);
      assert.strictEqual(retrievedKey.secretKey, originalKey.secretKey);
      assert.strictEqual(retrievedKey.status, originalKey.status);
    });

    it('should return null for non-existent keyId', () => {
      const key = testKeyManager.getKey('non-existent-key-id');

      assert.strictEqual(key, null);
    });
  });

  describe('revokeKey', () => {
    it('should revoke an existing key', () => {
      const key = testKeyManager.generateKey(mockServiceUrl);

      const result = testKeyManager.revokeKey(key.keyId);

      assert.strictEqual(result, true);

      const retrievedKey = testKeyManager.getKey(key.keyId);
      assert.ok(retrievedKey);
      assert.strictEqual(retrievedKey.status, 'revoked');
    });

    it('should return false for non-existent key', () => {
      const result = testKeyManager.revokeKey('non-existent-key-id');

      assert.strictEqual(result, false);
    });

    it('should not affect already revoked keys', () => {
      const key = testKeyManager.generateKey(mockServiceUrl);

      testKeyManager.revokeKey(key.keyId);
      const result = testKeyManager.revokeKey(key.keyId);

      assert.strictEqual(result, true); // Should still return true

      const retrievedKey = testKeyManager.getKey(key.keyId);
      assert.ok(retrievedKey);
      assert.strictEqual(retrievedKey.status, 'revoked');
    });
  });

  describe('rotateKey', () => {
    it('should generate new key and set old keys to expire', () => {
      const oldKey = testKeyManager.generateKey(mockServiceUrl);

      const newKey = testKeyManager.rotateKey(mockServiceUrl);

      assert.ok(newKey);
      assert.notStrictEqual(newKey.keyId, oldKey.keyId);
      assert.strictEqual(newKey.status, 'active');

      // Check that old key is still there but set to expire
      const retrievedOldKey = testKeyManager.getKey(oldKey.keyId);
      assert.ok(retrievedOldKey);
      assert.strictEqual(retrievedOldKey.status, 'active');
      assert.ok(retrievedOldKey.expiresAt);

      // Expiration should be about 1 hour from now
      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 60 * 60 * 1000);
      const timeDiff = Math.abs(retrievedOldKey.expiresAt.getTime() - expectedExpiry.getTime());
      assert.ok(timeDiff < 1000); // Within 1 second
    });

    it('should handle service with no existing keys', () => {
      const newKey = testKeyManager.rotateKey('http://new-service.com/graphql');

      assert.ok(newKey);
      assert.strictEqual(newKey.status, 'active');
      assert.strictEqual(newKey.expiresAt, undefined);
    });

    it('should set multiple old keys to expire', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      const newKey = testKeyManager.rotateKey(mockServiceUrl);

      const oldKey1 = testKeyManager.getKey(key1.keyId);
      const oldKey2 = testKeyManager.getKey(key2.keyId);

      assert.ok(oldKey1?.expiresAt);
      assert.ok(oldKey2?.expiresAt);
      assert.strictEqual(newKey.expiresAt, undefined);
    });
  });

  describe('getServiceKeys', () => {
    it('should return all keys for a service', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      const serviceKeys = testKeyManager.getServiceKeys(mockServiceUrl);

      assert.strictEqual(serviceKeys.length, 2);
      assert.ok(serviceKeys.some((k) => k.keyId === key1.keyId));
      assert.ok(serviceKeys.some((k) => k.keyId === key2.keyId));

      // Check ServiceKeyInfo structure
      serviceKeys.forEach((keyInfo) => {
        assert.ok(keyInfo.url);
        assert.ok(keyInfo.keyId);
        assert.ok(keyInfo.createdAt);
        assert.ok(['active', 'revoked'].includes(keyInfo.status));
      });
    });

    it('should return empty array for service with no keys', () => {
      const serviceKeys = testKeyManager.getServiceKeys('http://nonexistent.com/graphql');

      assert.strictEqual(serviceKeys.length, 0);
    });

    it('should include both active and revoked keys', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      testKeyManager.revokeKey(key1.keyId);

      const serviceKeys = testKeyManager.getServiceKeys(mockServiceUrl);

      assert.strictEqual(serviceKeys.length, 2);

      const revokedKey = serviceKeys.find((k) => k.keyId === key1.keyId);
      const activeKey = serviceKeys.find((k) => k.keyId === key2.keyId);

      assert.ok(revokedKey);
      assert.ok(activeKey);
      assert.strictEqual(revokedKey.status, 'revoked');
      assert.strictEqual(activeKey.status, 'active');
    });
  });

  describe('removeService', () => {
    it('should remove service and all its keys', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      const result = testKeyManager.removeService(mockServiceUrl);

      assert.strictEqual(result, true);

      // Keys should be removed
      assert.strictEqual(testKeyManager.getKey(key1.keyId), null);
      assert.strictEqual(testKeyManager.getKey(key2.keyId), null);

      // Service should be removed
      assert.strictEqual(testKeyManager.getServiceKeys(mockServiceUrl).length, 0);
    });

    it('should return false for non-existent service', () => {
      const result = testKeyManager.removeService('http://nonexistent.com/graphql');

      assert.strictEqual(result, false);
    });

    it('should not affect other services', () => {
      const service1 = 'http://service1.com/graphql';
      const service2 = 'http://service2.com/graphql';

      const key1 = testKeyManager.generateKey(service1);
      const key2 = testKeyManager.generateKey(service2);

      testKeyManager.removeService(service1);

      // Service1 should be removed
      assert.strictEqual(testKeyManager.getKey(key1.keyId), null);
      assert.strictEqual(testKeyManager.getServiceKeys(service1).length, 0);

      // Service2 should remain
      assert.ok(testKeyManager.getKey(key2.keyId));
      assert.strictEqual(testKeyManager.getServiceKeys(service2).length, 1);
    });
  });

  describe('cleanupExpiredKeys', () => {
    it('should remove expired keys', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      // Manually set one key to expired
      const retrievedKey1 = testKeyManager.getKey(key1.keyId);
      if (retrievedKey1) {
        retrievedKey1.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      }

      const cleanedCount = testKeyManager.cleanupExpiredKeys();

      assert.strictEqual(cleanedCount, 1);

      // Expired key should be removed
      assert.strictEqual(testKeyManager.getKey(key1.keyId), null);

      // Non-expired key should remain
      assert.ok(testKeyManager.getKey(key2.keyId));
    });

    it('should not remove non-expired keys', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      // Set one key to expire in the future
      const retrievedKey1 = testKeyManager.getKey(key1.keyId);
      if (retrievedKey1) {
        retrievedKey1.expiresAt = new Date(Date.now() + 60000); // 1 minute from now
      }

      const cleanedCount = testKeyManager.cleanupExpiredKeys();

      assert.strictEqual(cleanedCount, 0);

      // Both keys should remain
      assert.ok(testKeyManager.getKey(key1.keyId));
      assert.ok(testKeyManager.getKey(key2.keyId));
    });

    it('should not remove keys without expiration', () => {
      const key = testKeyManager.generateKey(mockServiceUrl);

      const cleanedCount = testKeyManager.cleanupExpiredKeys();

      assert.strictEqual(cleanedCount, 0);
      assert.ok(testKeyManager.getKey(key.keyId));
    });

    it('should clean up service tracking when all keys are removed', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      // Set both keys to expired
      const retrievedKey1 = testKeyManager.getKey(key1.keyId);
      const retrievedKey2 = testKeyManager.getKey(key2.keyId);

      if (retrievedKey1) retrievedKey1.expiresAt = new Date(Date.now() - 1000);
      if (retrievedKey2) retrievedKey2.expiresAt = new Date(Date.now() - 1000);

      const cleanedCount = testKeyManager.cleanupExpiredKeys();

      assert.strictEqual(cleanedCount, 2);

      // Service should be removed from tracking
      assert.strictEqual(testKeyManager.getServiceKeys(mockServiceUrl).length, 0);
      assert.strictEqual(testKeyManager.getServices().includes(mockServiceUrl), false);
    });
  });

  describe('getServices', () => {
    it('should return list of registered services', () => {
      const service1 = 'http://service1.com/graphql';
      const service2 = 'http://service2.com/graphql';

      testKeyManager.generateKey(service1);
      testKeyManager.generateKey(service2);

      const services = testKeyManager.getServices();

      assert.ok(services.includes(service1));
      assert.ok(services.includes(service2));
    });

    it('should return empty array when no services are registered', () => {
      const services = testKeyManager.getServices();

      assert.strictEqual(services.length, 0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const service1 = 'http://service1.com/graphql';
      const service2 = 'http://service2.com/graphql';

      const key1 = testKeyManager.generateKey(service1);
      const key2 = testKeyManager.generateKey(service1);
      const key3 = testKeyManager.generateKey(service2);

      testKeyManager.revokeKey(key1.keyId);

      const stats = testKeyManager.getStats();

      assert.strictEqual(stats.totalKeys, 3);
      assert.strictEqual(stats.activeKeys, 2);
      assert.strictEqual(stats.revokedKeys, 1);
      assert.strictEqual(stats.services, 2);
    });

    it('should return zero stats for empty manager', () => {
      const stats = testKeyManager.getStats();

      assert.strictEqual(stats.totalKeys, 0);
      assert.strictEqual(stats.activeKeys, 0);
      assert.strictEqual(stats.revokedKeys, 0);
      assert.strictEqual(stats.services, 0);
    });
  });

  describe('private methods', () => {
    it('should generate key IDs with correct format', () => {
      const key1 = testKeyManager.generateKey('http://service1.com/graphql');
      const key2 = testKeyManager.generateKey('http://service2.com/graphql');

      // Should have format: urlHash_timestamp_random
      const parts1 = key1.keyId.split('_');
      const parts2 = key2.keyId.split('_');

      assert.strictEqual(parts1.length, 3);
      assert.strictEqual(parts2.length, 3);

      // URL hashes should be different for different services
      assert.notStrictEqual(parts1[0], parts2[0]);

      // All parts should be hex strings
      assert.match(parts1[0], /^[a-f0-9]{8}$/);
      assert.match(parts1[1], /^[a-z0-9]+$/);
      assert.match(parts1[2], /^[a-f0-9]{16}$/);
    });

    it('should generate secret keys with correct format', () => {
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      const key2 = testKeyManager.generateKey(mockServiceUrl);

      // Should be 64 hex characters (32 bytes)
      assert.match(key1.secretKey, /^[a-f0-9]{64}$/);
      assert.match(key2.secretKey, /^[a-f0-9]{64}$/);

      // Should be different
      assert.notStrictEqual(key1.secretKey, key2.secretKey);
    });
  });

  describe('integration tests', () => {
    it('should handle complex key lifecycle', () => {
      // Generate initial key
      const key1 = testKeyManager.generateKey(mockServiceUrl);
      assert.ok(testKeyManager.getActiveKey(mockServiceUrl));

      // Rotate key
      const key2 = testKeyManager.rotateKey(mockServiceUrl);
      assert.notStrictEqual(key2.keyId, key1.keyId);
      assert.strictEqual(key2.status, 'active');

      // Old key should still exist but be set to expire
      const oldKey = testKeyManager.getKey(key1.keyId);
      assert.ok(oldKey);
      assert.ok(oldKey.expiresAt);

      // Generate another key
      const key3 = testKeyManager.generateKey(mockServiceUrl);

      // Should have 3 keys total
      assert.strictEqual(testKeyManager.getServiceKeys(mockServiceUrl).length, 3);

      // There should be an active key
      const activeKey = testKeyManager.getActiveKey(mockServiceUrl);
      assert.ok(activeKey);
      // The active key should be one of the keys (key1 is still active but expires later)
      assert.ok([key1.keyId, key2.keyId, key3.keyId].includes(activeKey.keyId));

      // Revoke the active key
      testKeyManager.revokeKey(activeKey.keyId);

      // There should still be an active key (the other one)
      const newActiveKey = testKeyManager.getActiveKey(mockServiceUrl);
      assert.ok(newActiveKey);
      assert.notStrictEqual(newActiveKey.keyId, activeKey.keyId);

      // Stats should reflect changes
      const stats = testKeyManager.getStats();
      assert.strictEqual(stats.totalKeys, 3);
      assert.strictEqual(stats.activeKeys, 2); // key2 or key3, plus the old key1 that expires later
      assert.strictEqual(stats.revokedKeys, 1);
      assert.strictEqual(stats.services, 1);
    });
  });

  describe('singleton keyManager', () => {
    it('should provide singleton instance', () => {
      assert.ok(keyManager);
      assert.strictEqual(keyManager instanceof KeyManager, true);
    });

    it('should maintain state across imports', () => {
      const testService = 'http://singleton-test.com/graphql';

      // Generate key using singleton
      const key = keyManager.generateKey(testService);

      // Should be able to retrieve it
      const retrievedKey = keyManager.getKey(key.keyId);
      assert.ok(retrievedKey);
      assert.strictEqual(retrievedKey.keyId, key.keyId);

      // Clean up
      keyManager.removeService(testService);
    });
  });
});
