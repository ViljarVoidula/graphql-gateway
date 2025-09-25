import assert from 'node:assert/strict';
import test, { after, before, beforeEach, describe } from 'node:test';
import 'reflect-metadata';
import { dataSource } from '../../db/datasource';
import { ApiKeyUsage } from '../../entities/api-key-usage.entity';
import { ApiKey, ApiKeyStatus } from '../../entities/api-key.entity';
import { ApplicationUsage } from '../../entities/application-usage.entity';
import { Application } from '../../entities/application.entity';
import { Service, ServiceStatus } from '../../entities/service.entity';
import { TestDatabaseManager } from '../../test/test-utils';
import { User } from '../users/user.entity';
import { UsageDashboardResolver } from './usage-dashboard.resolver';

describe('UsageDashboardResolver', () => {
  before(async () => {
    await TestDatabaseManager.setupDatabase();
  });

  after(async () => {
    await TestDatabaseManager.teardownDatabase();
  });

  beforeEach(async () => {
    await TestDatabaseManager.clearDatabase();
  });
  test('usageTotals sums rows for current user', async () => {
    const user = await dataSource
      .getRepository(User)
      .save({ email: 'u1@example.com', password: 'x', permissions: [] });
    const app = await dataSource
      .getRepository(Application)
      .save({ name: 'app', ownerId: user.id });
    const svc1 = await dataSource.getRepository(Service).save({
      name: 'svc-1',
      url: 'http://svc-1/graphql',
      ownerId: user.id,
      status: ServiceStatus.ACTIVE,
      externally_accessible: true,
    } as any);
    const svc2 = await dataSource.getRepository(Service).save({
      name: 'svc-2',
      url: 'http://svc-2/graphql',
      ownerId: user.id,
      status: ServiceStatus.ACTIVE,
      externally_accessible: true,
    } as any);
    await dataSource.getRepository(ApplicationUsage).save([
      {
        applicationId: app.id,
        serviceId: svc1.id,
        date: '2025-09-21',
        requestCount: 40,
        errorCount: 2,
        rateLimitExceededCount: 1,
      },
      {
        applicationId: app.id,
        serviceId: svc2.id,
        date: '2025-09-22',
        requestCount: 60,
        errorCount: 3,
        rateLimitExceededCount: 1,
      },
    ]);
    const resolver = new UsageDashboardResolver();
    const out = await resolver.usageTotals(7, { user } as any);
    assert.deepEqual(out, {
      totalRequests: 100,
      totalErrors: 5,
      totalRateLimited: 2,
    });
  });

  test('usageDailyRequests maps series', async () => {
    const user = await dataSource
      .getRepository(User)
      .save({ email: 'u2@example.com', password: 'x', permissions: [] });
    const app = await dataSource
      .getRepository(Application)
      .save({ name: 'app2', ownerId: user.id });
    const s1 = await dataSource.getRepository(Service).save({
      name: 'svc-1b',
      url: 'http://svc-1b/graphql',
      ownerId: user.id,
      status: ServiceStatus.ACTIVE,
      externally_accessible: true,
    } as any);
    const s2 = await dataSource.getRepository(Service).save({
      name: 'svc-2b',
      url: 'http://svc-2b/graphql',
      ownerId: user.id,
      status: ServiceStatus.ACTIVE,
      externally_accessible: true,
    } as any);
    await dataSource.getRepository(ApplicationUsage).save([
      {
        applicationId: app.id,
        serviceId: s1.id,
        date: '2025-09-21',
        requestCount: 10,
        errorCount: 0,
        rateLimitExceededCount: 0,
      },
      {
        applicationId: app.id,
        serviceId: s2.id,
        date: '2025-09-22',
        requestCount: 25,
        errorCount: 0,
        rateLimitExceededCount: 0,
      },
    ]);
    const resolver = new UsageDashboardResolver();
    const out = await resolver.usageDailyRequests(14, { user } as any);
    assert.deepEqual(out, [
      { date: '2025-09-21', requestCount: 10 },
      { date: '2025-09-22', requestCount: 25 },
    ]);
  });

  test('usageTopApiKeys maps rows', async () => {
    const user = await dataSource
      .getRepository(User)
      .save({ email: 'u3@example.com', password: 'x', permissions: [] });
    const app = await dataSource
      .getRepository(Application)
      .save({ name: 'app3', ownerId: user.id });
    const apiKeyRepo = dataSource.getRepository(ApiKey);
    const k1 = await apiKeyRepo.save(
      apiKeyRepo.create({
        keyPrefix: 'app_11111111',
        hashedKey: 'h1',
        status: ApiKeyStatus.ACTIVE,
        name: 'k1',
        scopes: [],
        applicationId: app.id,
      })
    );
    const k2 = await apiKeyRepo.save(
      apiKeyRepo.create({
        keyPrefix: 'app_22222222',
        hashedKey: 'h2',
        status: ApiKeyStatus.ACTIVE,
        name: 'k2',
        scopes: [],
        applicationId: app.id,
      })
    );
    await dataSource.getRepository(ApiKeyUsage).save([
      {
        apiKeyId: k1.id,
        applicationId: app.id,
        serviceId: null,
        date: '2025-09-22',
        requestCount: 77,
        errorCount: 0,
        rateLimitExceededCount: 0,
      },
      {
        apiKeyId: k2.id,
        applicationId: app.id,
        serviceId: null,
        date: '2025-09-22',
        requestCount: 33,
        errorCount: 0,
        rateLimitExceededCount: 0,
      },
    ]);
    const resolver = new UsageDashboardResolver();
    const out = await resolver.usageTopApiKeys(7, 2, { user } as any);
    assert.deepEqual(out, [
      { apiKeyId: k1.id, requestCount: 77 },
      { apiKeyId: k2.id, requestCount: 33 },
    ]);
  });
});
