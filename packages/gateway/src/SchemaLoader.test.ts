import { describe, mock, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { GraphQLSchema, buildSchema, introspectionFromSchema } from 'graphql';
import { SchemaLoader, schemaCache } from './SchemaLoader';

// Create a mock executor that we can control
let mockExecutor: any;
let originalBuildHMACExecutor: any;



describe('SchemaLoader', () => {
  let schemaLoader: SchemaLoader;
  let mockBuildSchema: (endpoints: any[]) => GraphQLSchema;
  let mockSchema: GraphQLSchema;

  beforeEach(async () => {
    // Clear all caches before each test
    schemaCache.clear();
    
    // Create a mock schema
    mockSchema = buildSchema(`
      type Query {
        hello: String
      }
    `);

    // Create mock build schema function
    mockBuildSchema = () => mockSchema;

    // Reset mock executor
    mockExecutor = mock.fn();

    // Mock the buildHMACExecutor function by dynamically importing and overriding
    const hmacExecutorModule = require('./utils/hmacExecutor');
    originalBuildHMACExecutor = hmacExecutorModule.buildHMACExecutor;
    hmacExecutorModule.buildHMACExecutor = () => mockExecutor;

    // Create SchemaLoader instance
    schemaLoader = new SchemaLoader(mockBuildSchema, ['http://localhost:4000/graphql']);
  });

  afterEach(async () => {
    // Restore original function
    if (originalBuildHMACExecutor) {
      const hmacExecutorModule = require('./utils/hmacExecutor');
      hmacExecutorModule.buildHMACExecutor = originalBuildHMACExecutor;
    }
    
    // Stop any running intervals
    schemaLoader?.stopAutoRefresh();
  });

  describe('constructor', () => {
    it('should initialize with provided endpoints and build schema function', () => {
      const endpoints = ['http://localhost:4000/graphql', 'http://localhost:4001/graphql'];
      const buildSchemaFn = () => mockSchema;
      
      const loader = new SchemaLoader(buildSchemaFn, endpoints);
      
      assert.deepStrictEqual(loader.endpoints, endpoints);
      assert.strictEqual(loader.schema, null);
      assert.strictEqual(loader.loadedEndpoints.length, 0);
    });
  });

  describe('reload', () => {
    it('should load schemas from endpoints and build combined schema', async () => {
      const mockIntrospectionData = {
        data: {
          __schema: introspectionFromSchema(mockSchema).__schema
        }
      };
      
      // Mock executor to return introspection data
      mockExecutor = mock.fn(() => Promise.resolve(mockIntrospectionData));

      const result = await schemaLoader.reload();

      assert.strictEqual(result, mockSchema);
      assert.strictEqual(schemaLoader.schema, mockSchema);
      assert.strictEqual(schemaLoader.loadedEndpoints.length, 1);
      assert.strictEqual(schemaLoader.loadedEndpoints[0].url, 'http://localhost:4000/graphql');
      assert.ok(schemaLoader.loadedEndpoints[0].sdl.includes('type Query'));
    });

    it('should use cached schema when available and not expired', async () => {
      const url = 'http://localhost:4000/graphql';
      const cachedSdl = 'type Query { cached: String }';
      
      // Pre-populate cache
      schemaCache.set(url, {
        sdl: cachedSdl,
        lastUpdated: Date.now()
      });

      await schemaLoader.reload();

      assert.strictEqual(schemaLoader.loadedEndpoints[0].sdl, cachedSdl);
    });

    it('should handle expired cache by fetching fresh schema', async () => {
      const url = 'http://localhost:4000/graphql';
      const mockIntrospectionData = {
        data: {
          __schema: introspectionFromSchema(mockSchema).__schema
        }
      };
      
      // Pre-populate cache with expired entry
      schemaCache.set(url, {
        sdl: 'type Query { old: String }',
        lastUpdated: Date.now() - 15 * 60 * 1000 // 15 minutes ago
      });

      // Mock executor to return introspection data
      mockExecutor = mock.fn(() => Promise.resolve(mockIntrospectionData));

      await schemaLoader.reload();

      assert.ok(schemaLoader.loadedEndpoints[0].sdl.includes('type Query'));
    });

    it('should handle endpoint errors gracefully and use cached schema', async () => {
      const url = 'http://localhost:4000/graphql';
      const cachedSdl = 'type Query { cached: String }';
      
      // Pre-populate cache with expired entry
      schemaCache.set(url, {
        sdl: cachedSdl,
        lastUpdated: Date.now() - 15 * 60 * 1000 // 15 minutes ago
      });

      // Mock executor to throw error
      mockExecutor = mock.fn(() => Promise.reject(new Error('Network error')));

      await schemaLoader.reload();

      // Should use cached schema despite error
      assert.strictEqual(schemaLoader.loadedEndpoints[0].sdl, cachedSdl);
    });

    it('should skip endpoints that fail and have no cache', async () => {
      // Mock executor to throw error
      mockExecutor = mock.fn(() => Promise.reject(new Error('Network error')));

      await schemaLoader.reload();

      // Should have no loaded endpoints
      assert.strictEqual(schemaLoader.loadedEndpoints.length, 0);
    });

    it('should handle invalid introspection response', async () => {
      // Mock executor to return invalid data
      mockExecutor = mock.fn(() => Promise.resolve({ data: null }));

      await schemaLoader.reload();

      assert.strictEqual(schemaLoader.loadedEndpoints.length, 0);
    });

    it('should handle async iterable response from executor', async () => {
      const mockIntrospectionData = {
        data: {
          __schema: introspectionFromSchema(mockSchema).__schema
        }
      };

      // Mock async iterable response
      const asyncIterable = {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.resolve({ value: mockIntrospectionData, done: false })
        })
      };

      mockExecutor = mock.fn(() => Promise.resolve(asyncIterable));

      await schemaLoader.reload();

      assert.strictEqual(schemaLoader.loadedEndpoints.length, 1);
      assert.ok(schemaLoader.loadedEndpoints[0].sdl.includes('type Query'));
    });
  });

  describe('loadEndpoints', () => {
    it('should return static endpoints when no loader is set', async () => {
      const endpoints = await schemaLoader.loadEndpoints();
      
      assert.deepStrictEqual(endpoints, ['http://localhost:4000/graphql']);
    });

    it('should use endpoint loader when set', async () => {
      const dynamicEndpoints = ['http://dynamic1.com/graphql', 'http://dynamic2.com/graphql'];
      const mockLoader = mock.fn(() => Promise.resolve(dynamicEndpoints));
      
      schemaLoader.setEndpointLoader(mockLoader);
      
      const endpoints = await schemaLoader.loadEndpoints();
      
      assert.deepStrictEqual(endpoints, dynamicEndpoints);
      assert.strictEqual(mockLoader.mock.callCount(), 1);
    });

    it('should handle endpoint loader errors gracefully', async () => {
      const mockLoader = mock.fn(() => Promise.reject(new Error('Loader failed')));
      
      schemaLoader.setEndpointLoader(mockLoader);
      
      const endpoints = await schemaLoader.loadEndpoints();
      
      // Should fallback to static endpoints
      assert.deepStrictEqual(endpoints, ['http://localhost:4000/graphql']);
    });
  });

  describe('autoRefresh', () => {
    it('should set up automatic refresh interval', (t, done) => {
      const mockIntrospectionData = {
        data: {
          __schema: introspectionFromSchema(mockSchema).__schema
        }
      };
      mockExecutor = mock.fn(() => Promise.resolve(mockIntrospectionData));

      // Use a very short interval for testing
      schemaLoader.autoRefresh(50);
      
      // Wait for the interval to trigger
      setTimeout(() => {
        // Should have been called at least once
        assert.ok(mockExecutor.mock.callCount() >= 1);
        schemaLoader.stopAutoRefresh();
        done();
      }, 100);
    });

    it('should stop previous interval when called again', () => {
      schemaLoader.autoRefresh(1000);
      const firstIntervalId = (schemaLoader as any).intervalId;
      
      schemaLoader.autoRefresh(2000);
      const secondIntervalId = (schemaLoader as any).intervalId;
      
      assert.notStrictEqual(firstIntervalId, secondIntervalId);
      
      schemaLoader.stopAutoRefresh();
    });
  });

  describe('stopAutoRefresh', () => {
    it('should clear the refresh interval', () => {
      schemaLoader.autoRefresh(1000);
      assert.ok((schemaLoader as any).intervalId !== null);
      
      schemaLoader.stopAutoRefresh();
      assert.strictEqual((schemaLoader as any).intervalId, null);
    });

    it('should handle being called when no interval is set', () => {
      // Should not throw
      schemaLoader.stopAutoRefresh();
      assert.strictEqual((schemaLoader as any).intervalId, null);
    });
  });

  describe('setEndpointLoader', () => {
    it('should set the endpoint loader function', () => {
      const mockLoader = mock.fn();
      
      schemaLoader.setEndpointLoader(mockLoader);
      
      assert.strictEqual((schemaLoader as any).endpointLoader, mockLoader);
    });
  });

  describe('cleanupExpiredCache', () => {
    it('should remove expired cache entries', () => {
      const url1 = 'http://old.com/graphql';
      const url2 = 'http://fresh.com/graphql';
      
      // Add old cache entry
      schemaCache.set(url1, {
        sdl: 'old schema',
        lastUpdated: Date.now() - 25 * 60 * 1000 // 25 minutes ago
      });
      
      // Add fresh cache entry
      schemaCache.set(url2, {
        sdl: 'fresh schema',
        lastUpdated: Date.now()
      });
      
      schemaLoader.cleanupExpiredCache();
      
      // Old entry should be removed, fresh entry should remain
      assert.strictEqual(schemaCache.has(url1), false);
      assert.strictEqual(schemaCache.has(url2), true);
    });

    it('should keep recently expired entries within 2x TTL', () => {
      const url = 'http://recent.com/graphql';
      
      // Add recently expired entry (15 minutes ago, TTL is 10 minutes)
      schemaCache.set(url, {
        sdl: 'recent schema',
        lastUpdated: Date.now() - 15 * 60 * 1000
      });
      
      schemaLoader.cleanupExpiredCache();
      
      // Should still be present
      assert.strictEqual(schemaCache.has(url), true);
    });
  });

  describe('caching behavior', () => {
    it('should respect schema cache TTL', async () => {
      const url = 'http://localhost:4000/graphql';
      const mockIntrospectionData = {
        data: {
          __schema: introspectionFromSchema(mockSchema).__schema
        }
      };
      
      let callCount = 0;
      mockExecutor = mock.fn(() => {
        callCount++;
        return Promise.resolve(mockIntrospectionData);
      });

      // First load should fetch and cache
      await schemaLoader.reload();
      assert.strictEqual(callCount, 1);
      
      // Second load should use cache
      await schemaLoader.reload();
      assert.strictEqual(callCount, 1);
      
      // Verify cache was used
      assert.ok(schemaCache.has(url));
    });
  });

  describe('error handling', () => {
    it('should handle multiple endpoint failures gracefully', async () => {
      const multiEndpointLoader = new SchemaLoader(mockBuildSchema, [
        'http://failing1.com/graphql',
        'http://failing2.com/graphql'
      ]);
      
      mockExecutor = mock.fn(() => Promise.reject(new Error('All endpoints failed')));

      await multiEndpointLoader.reload();
      
      // Should complete without throwing
      assert.strictEqual(multiEndpointLoader.loadedEndpoints.length, 0);
      assert.strictEqual(multiEndpointLoader.schema, mockSchema);
    });

    it('should handle malformed introspection data', async () => {
      mockExecutor = mock.fn(() => Promise.resolve({
        data: {
          __schema: null // Invalid schema
        }
      }));

      await schemaLoader.reload();
      
      assert.strictEqual(schemaLoader.loadedEndpoints.length, 0);
    });
  });
});
