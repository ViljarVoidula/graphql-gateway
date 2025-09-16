import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import { YogaContext } from '../../auth/session.config';
import { ServiceRegistryResolver } from './service-registry.resolver';

describe('ServiceRegistryResolver Authorization', () => {
  let serviceRegistryResolver: ServiceRegistryResolver;
  let mockServiceRegistryService: any;

  beforeEach(() => {
    // Mock the service
    mockServiceRegistryService = {
      registerService: mock.fn(),
      updateService: mock.fn(),
      removeService: mock.fn(),
      getAllServices: mock.fn(),
      getServicesByOwner: mock.fn(),
      getServiceById: mock.fn(),
      getServiceKeys: mock.fn(),
      rotateServiceKey: mock.fn(),
      revokeServiceKey: mock.fn(),
      getExternallyAccessibleServices: mock.fn()
    };

    serviceRegistryResolver = new ServiceRegistryResolver(mockServiceRegistryService);
  });

  describe('registerService', () => {
    it('should throw error if user is not authenticated', async () => {
      const ctx: YogaContext = { user: null } as any;
      const input = {
        name: 'test-service',
        url: 'http://test.com/graphql',
        description: 'Test service',
        enableHMAC: true,
        timeout: 5000,
        enableBatching: true,
        useMsgPack: false
      };

      await assert.rejects(() => serviceRegistryResolver.registerService(input, ctx), /User not authenticated/);
    });

    it('should throw error if user is not admin', async () => {
      const ctx: YogaContext = {
        user: {
          id: 'user123',
          email: 'test@example.com',
          permissions: ['user'] // Not admin
        }
      } as any;
      const input = {
        name: 'test-service',
        url: 'http://test.com/graphql',
        description: 'Test service',
        enableHMAC: true,
        timeout: 5000,
        enableBatching: true,
        useMsgPack: false
      };

      await assert.rejects(
        () => serviceRegistryResolver.registerService(input, ctx),
        /Only administrators can register new services/
      );
    });

    it('should allow admin to register service', async () => {
      const ctx: YogaContext = {
        user: {
          id: 'admin123',
          email: 'admin@example.com',
          permissions: ['admin'] // Admin user
        }
      } as any;
      const input = {
        name: 'test-service',
        url: 'http://test.com/graphql',
        description: 'Test service',
        enableHMAC: true,
        timeout: 5000,
        enableBatching: true,
        useMsgPack: false
      };

      const mockService = { id: 'service123', name: 'test-service' };
      const mockHmacKey = { keyId: 'key123', secretKey: 'secret123' };

      mockServiceRegistryService.registerService.mock.mockImplementationOnce(() =>
        Promise.resolve({ service: mockService, hmacKey: mockHmacKey })
      );

      const result = await serviceRegistryResolver.registerService(input, ctx);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.service, mockService);
      assert.strictEqual(result.hmacKey, mockHmacKey);

      // Verify service was called with correct parameters
      const callArgs = mockServiceRegistryService.registerService.mock.calls[0];
      assert.strictEqual(callArgs.arguments[0].name, input.name);
      assert.strictEqual(callArgs.arguments[0].url, input.url);
      assert.strictEqual(callArgs.arguments[0].ownerId, ctx.user.id);
    });

    it('should allow admin to assign service to another user', async () => {
      const ctx: YogaContext = {
        user: {
          id: 'admin123',
          email: 'admin@example.com',
          permissions: ['admin'] // Admin user
        }
      } as any;
      const input = {
        name: 'test-service',
        url: 'http://test.com/graphql',
        description: 'Test service',
        ownerId: 'otheruser123', // Assigning to another user
        enableHMAC: true,
        timeout: 5000,
        enableBatching: true,
        useMsgPack: false
      };

      const mockService = { id: 'service123', name: 'test-service' };
      const mockHmacKey = { keyId: 'key123', secretKey: 'secret123' };

      mockServiceRegistryService.registerService.mock.mockImplementationOnce(() =>
        Promise.resolve({ service: mockService, hmacKey: mockHmacKey })
      );

      const result = await serviceRegistryResolver.registerService(input, ctx);

      assert.strictEqual(result.success, true);

      // Verify service was called with the specified owner
      const callArgs = mockServiceRegistryService.registerService.mock.calls[0];
      assert.strictEqual(callArgs.arguments[0].ownerId, input.ownerId);
    });
  });

  describe('transferServiceOwnership', () => {
    it('should throw error if user is not admin', async () => {
      const ctx: YogaContext = {
        user: {
          id: 'user123',
          email: 'test@example.com',
          permissions: ['user'] // Not admin
        }
      } as any;

      await assert.rejects(
        () => serviceRegistryResolver.transferServiceOwnership('service123', 'newowner123', ctx),
        /Only administrators can transfer service ownership/
      );
    });

    it('should allow admin to transfer service ownership', async () => {
      const ctx: YogaContext = {
        user: {
          id: 'admin123',
          email: 'admin@example.com',
          permissions: ['admin'] // Admin user
        }
      } as any;

      const mockService = { id: 'service123', name: 'test-service' };
      mockServiceRegistryService.updateService.mock.mockImplementationOnce(() => Promise.resolve(mockService));

      const result = await serviceRegistryResolver.transferServiceOwnership('service123', 'newowner123', ctx);

      assert.strictEqual(result, true);

      // Verify service was updated with new owner
      const callArgs = mockServiceRegistryService.updateService.mock.calls[0];
      assert.strictEqual(callArgs.arguments[0], 'service123');
      assert.strictEqual(callArgs.arguments[1].ownerId, 'newowner123');
    });
  });
});
