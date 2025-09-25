import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { ApiKeyService } from '../../auth/api-key.service';
import { ApiKey, ApiKeyStatus } from '../../entities/api-key.entity';
import { Application } from '../../entities/application.entity';
import {
  Service as ServiceEntity,
  ServiceStatus,
} from '../../entities/service.entity';
import { TestDatabaseManager } from '../../test/test-utils';
import { User } from '../users/user.entity';
import { ApplicationResolver } from './application.resolver';

interface MockContext {
  user?: { id: string; permissions?: string[] };
}

describe.skip('ApplicationResolver', { concurrency: 1, timeout: 15000 }, () => {
  let applicationRepository: any;
  let serviceRepository: any;
  let userRepository: any;
  let apiKeyRepository: any;
  let apiKeyService: ApiKeyService;
  let resolver: ApplicationResolver;

  let owner: User;
  let otherUser: User;
  let admin: User;
  let appOwned: Application;
  let appOther: Application;
  let svcAccessible: ServiceEntity;
  let svcInactive: ServiceEntity;
  let svcNotExternal: ServiceEntity;

  beforeEach(async () => {
    await TestDatabaseManager.setupTest();

    applicationRepository = TestDatabaseManager.getRepository(Application);
    serviceRepository = TestDatabaseManager.getRepository(ServiceEntity);
    userRepository = TestDatabaseManager.getRepository(User);
    apiKeyRepository = TestDatabaseManager.getRepository(ApiKey);
    apiKeyService = new ApiKeyService();
    resolver = new ApplicationResolver(
      applicationRepository,
      serviceRepository,
      apiKeyService
    );

    // Users
    owner = await userRepository.save(
      userRepository.create({
        email: 'owner@app.test',
        password: 'pwd',
        permissions: ['user'],
      })
    );
    otherUser = await userRepository.save(
      userRepository.create({
        email: 'other@app.test',
        password: 'pwd',
        permissions: ['user'],
      })
    );
    admin = await userRepository.save(
      userRepository.create({
        email: 'admin@app.test',
        password: 'pwd',
        permissions: ['user', 'admin'],
      })
    );

    // Applications
    appOwned = await applicationRepository.save(
      applicationRepository.create({
        name: 'Owner App',
        description: 'Test',
        ownerId: owner.id,
      })
    );
    appOther = await applicationRepository.save(
      applicationRepository.create({
        name: 'Other App',
        description: 'Test',
        ownerId: otherUser.id,
      })
    );

    // Services
    svcAccessible = await serviceRepository.save(
      serviceRepository.create({
        name: 'svc-access',
        url: 'http://service/access',
        status: ServiceStatus.ACTIVE,
        externally_accessible: true,
        ownerId: owner.id,
      })
    );
    svcInactive = await serviceRepository.save(
      serviceRepository.create({
        name: 'svc-inactive',
        url: 'http://service/inactive',
        status: ServiceStatus.INACTIVE,
        externally_accessible: true,
        ownerId: owner.id,
      })
    );
    svcNotExternal = await serviceRepository.save(
      serviceRepository.create({
        name: 'svc-internal',
        url: 'http://service/internal',
        status: ServiceStatus.ACTIVE,
        externally_accessible: false,
        ownerId: owner.id,
      })
    );
  });

  describe('queries', () => {
    it('myApplications returns only apps owned by user', async () => {
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      const apps = await resolver.myApplications(ctx as any);
      assert.ok(Array.isArray(apps));
      assert.strictEqual(apps.length, 1);
      assert.strictEqual(apps[0].id, appOwned.id);
      assert.ok(apps[0].owner);
    });

    it('allApplications returns all applications', async () => {
      const apps = await resolver.allApplications();
      assert.strictEqual(apps.length, 2);
      const ids = apps.map((a) => a.id);
      assert.ok(ids.includes(appOwned.id));
      assert.ok(ids.includes(appOther.id));
    });
  });

  describe('createApplication', () => {
    it('creates new app with current user as owner', async () => {
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      const app = await resolver.createApplication(
        'New App',
        'desc',
        ctx as any
      );
      assert.ok(app.id);
      assert.strictEqual(app.ownerId, owner.id);
      const found = await applicationRepository.findOne({
        where: { id: app.id },
      });
      assert.ok(found);
    });
  });

  describe('service whitelisting', () => {
    it('adds accessible service to app (owner)', async () => {
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      const ok = await resolver.addServiceToApplication(
        appOwned.id,
        svcAccessible.id,
        ctx as any
      );
      assert.strictEqual(ok, true);
      const app = await applicationRepository.findOne({
        where: { id: appOwned.id },
        relations: ['whitelistedServices'],
      });
      assert.ok(app);
      assert.strictEqual(app.whitelistedServices.length, 1);
      assert.strictEqual(app.whitelistedServices[0].id, svcAccessible.id);

      // Idempotent
      const ok2 = await resolver.addServiceToApplication(
        appOwned.id,
        svcAccessible.id,
        ctx as any
      );
      assert.strictEqual(ok2, true);
      const app2 = await applicationRepository.findOne({
        where: { id: appOwned.id },
        relations: ['whitelistedServices'],
      });
      assert.ok(app2);
      assert.strictEqual(app2.whitelistedServices.length, 1);
    });

    it('rejects adding by non-owner non-admin', async () => {
      const ctx: MockContext = {
        user: { id: otherUser.id, permissions: ['user'] },
      };
      await assert.rejects(
        () =>
          resolver.addServiceToApplication(
            appOwned.id,
            svcAccessible.id,
            ctx as any
          ),
        /Insufficient permissions/
      );
    });

    it('rejects when service not externally accessible or inactive', async () => {
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      await assert.rejects(
        () =>
          resolver.addServiceToApplication(
            appOwned.id,
            svcInactive.id,
            ctx as any
          ),
        /Service not found or not externally accessible/
      );
      await assert.rejects(
        () =>
          resolver.addServiceToApplication(
            appOwned.id,
            svcNotExternal.id,
            ctx as any
          ),
        /Service not found or not externally accessible/
      );
      await assert.rejects(
        () =>
          resolver.addServiceToApplication(
            appOwned.id,
            '00000000-0000-0000-0000-000000000000',
            ctx as any
          ),
        /Service not found or not externally accessible/
      );
    });

    it('rejects for non-existent application', async () => {
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      await assert.rejects(
        () =>
          resolver.addServiceToApplication(
            '00000000-0000-0000-0000-000000000000',
            svcAccessible.id,
            ctx as any
          ),
        /Application not found/
      );
    });

    it('removes service from application (owner)', async () => {
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      await resolver.addServiceToApplication(
        appOwned.id,
        svcAccessible.id,
        ctx as any
      );
      const ok = await resolver.removeServiceFromApplication(
        appOwned.id,
        svcAccessible.id,
        ctx as any
      );
      assert.strictEqual(ok, true);
      const app = await applicationRepository.findOne({
        where: { id: appOwned.id },
        relations: ['whitelistedServices'],
      });
      assert.ok(app);
      assert.strictEqual(app.whitelistedServices.length, 0);
    });

    it('rejects removal by non-owner non-admin', async () => {
      const ctx: MockContext = {
        user: { id: otherUser.id, permissions: ['user'] },
      };
      await assert.rejects(
        () =>
          resolver.removeServiceFromApplication(
            appOwned.id,
            svcAccessible.id,
            ctx as any
          ),
        /Insufficient permissions/
      );
    });
  });

  describe('API keys', () => {
    it('creates an API key for application (owner) and persists it', async () => {
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      const key = await resolver.createApiKey(
        appOwned.id,
        'primary',
        ['read'],
        undefined as any,
        ctx as any
      );
      assert.ok(typeof key === 'string' && key.startsWith('app_'));
      const keys = await apiKeyRepository.find({
        where: { applicationId: appOwned.id },
      });
      assert.strictEqual(keys.length, 1);
      assert.strictEqual(keys[0].status, ApiKeyStatus.ACTIVE);
    });

    it('rejects API key creation by non-owner non-admin', async () => {
      const ctx: MockContext = {
        user: { id: otherUser.id, permissions: ['user'] },
      };
      await assert.rejects(
        () =>
          resolver.createApiKey(
            appOwned.id,
            'bad',
            [],
            undefined as any,
            ctx as any
          ),
        /Insufficient permissions/
      );
    });

    it('revokes API key by owner and by admin', async () => {
      // Create key via service directly to get entity id
      const { entity } = await apiKeyService.generateApiKey(
        appOwned.id,
        'to-revoke'
      );
      const ownerCtx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      const adminCtx: MockContext = {
        user: { id: admin.id, permissions: ['user', 'admin'] },
      };

      // Owner can revoke
      const ok = await resolver.revokeApiKey(entity.id, ownerCtx as any);
      assert.strictEqual(ok, true);
      let updated = await apiKeyRepository.findOne({
        where: { id: entity.id },
      });
      assert.ok(updated);
      assert.strictEqual(updated.status, ApiKeyStatus.REVOKED);

      // Create another key owned by otherUser and revoke as admin
      const otherApp = await applicationRepository.save(
        applicationRepository.create({
          name: 'Other User App',
          ownerId: otherUser.id,
        })
      );
      const { entity: entity2 } = await apiKeyService.generateApiKey(
        otherApp.id,
        'to-revoke-2'
      );
      const okAdmin = await resolver.revokeApiKey(entity2.id, adminCtx as any);
      assert.strictEqual(okAdmin, true);
      updated = await apiKeyRepository.findOne({ where: { id: entity2.id } });
      assert.ok(updated);
      assert.strictEqual(updated.status, ApiKeyStatus.REVOKED);
    });
  });

  describe('listing relations', () => {
    it('getApplicationAccessibleServices returns whitelisted services for owner', async () => {
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      await resolver.addServiceToApplication(
        appOwned.id,
        svcAccessible.id,
        ctx as any
      );
      const services = await resolver.getApplicationAccessibleServices(
        appOwned.id,
        ctx as any
      );
      assert.strictEqual(services.length, 1);
      assert.strictEqual(services[0].id, svcAccessible.id);
    });

    it('getApplicationAccessibleServices rejects non-owner non-admin', async () => {
      const ctx: MockContext = {
        user: { id: otherUser.id, permissions: ['user'] },
      };
      await assert.rejects(
        () =>
          resolver.getApplicationAccessibleServices(appOwned.id, ctx as any),
        /Insufficient permissions/
      );
    });

    it('getApplicationApiKeys returns keys for owner', async () => {
      const { entity: k1 } = await apiKeyService.generateApiKey(
        appOwned.id,
        'k1'
      );
      const { entity: k2 } = await apiKeyService.generateApiKey(
        appOwned.id,
        'k2'
      );
      assert.ok(k1 && k2);
      const ctx: MockContext = {
        user: { id: owner.id, permissions: ['user'] },
      };
      const keys = await resolver.getApplicationApiKeys(
        appOwned.id,
        ctx as any
      );
      const ids = keys.map((k) => k.id);
      assert.strictEqual(keys.length, 2);
      assert.ok(ids.includes(k1.id) && ids.includes(k2.id));
    });

    it('getApplicationApiKeys rejects non-owner non-admin', async () => {
      const ctx: MockContext = {
        user: { id: otherUser.id, permissions: ['user'] },
      };
      await assert.rejects(
        () => resolver.getApplicationApiKeys(appOwned.id, ctx as any),
        /Insufficient permissions/
      );
    });
  });
});
