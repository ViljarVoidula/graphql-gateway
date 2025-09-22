import 'reflect-metadata';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiKeyUsageResolver } from './api-key-usage.resolver';
import { TestDatabaseManager } from '../../test/test-utils';
import { dataSource } from '../../db/datasource';
import { User } from '../users/user.entity';
import { Application } from '../../entities/application.entity';
import { ApiKey, ApiKeyStatus } from '../../entities/api-key.entity';
import { Service, ServiceStatus } from '../../entities/service.entity';
import { ApiKeyUsage } from '../../entities/api-key-usage.entity';

before(async () => {
  await TestDatabaseManager.setupDatabase();
});

after(async () => {
  await TestDatabaseManager.teardownDatabase();
});

beforeEach(async () => {
  await TestDatabaseManager.clearDatabase();
});

test('apiKeyUsage denies non-owner non-admin', async () => {
  // Seed owner and app
  const owner = await dataSource.getRepository(User).save({ email: 'o@example.com', password: 'x', permissions: [] });
  const other = await dataSource.getRepository(User).save({ email: 'x@example.com', password: 'x', permissions: [] });
  const app = await dataSource.getRepository(Application).save({ name: 'app', ownerId: owner.id });
  const apiKeyRepo = dataSource.getRepository(ApiKey);
  const key = await apiKeyRepo.save(
    apiKeyRepo.create({
      keyPrefix: 'app_12345678',
      hashedKey: 'h',
      status: ApiKeyStatus.ACTIVE,
      name: 'k',
      scopes: [],
      applicationId: app.id
    })
  );

  const resolver = new ApiKeyUsageResolver();
  const ctx: any = { user: { id: other.id, permissions: [] } };
  const rows = await resolver.apiKeyUsage(key.id, 14, null, ctx);
  assert.equal(rows.length, 0);
});

test('apiKeyUsage returns mapped rows for owner', async () => {
  // Seed owner/user, app, key and usage rows
  const owner = await dataSource.getRepository(User).save({ email: 'u1@example.com', password: 'x', permissions: [] });
  const app = await dataSource.getRepository(Application).save({ name: 'app', ownerId: owner.id });
  const apiKeyRepo = dataSource.getRepository(ApiKey);
  const key = await apiKeyRepo.save(
    apiKeyRepo.create({
      keyPrefix: 'app_abcdef12',
      hashedKey: 'h',
      status: ApiKeyStatus.ACTIVE,
      name: 'k',
      scopes: [],
      applicationId: app.id
    })
  );
  // Create a service and use its UUID
  const service = await dataSource.getRepository(Service).save({
    name: 'svc-1',
    url: 'http://svc-1/graphql',
    ownerId: owner.id,
    status: ServiceStatus.ACTIVE,
    externally_accessible: true
  } as any);
  await dataSource.getRepository(ApiKeyUsage).save([
    {
      apiKeyId: key.id,
      applicationId: app.id,
      serviceId: null,
      date: '2025-09-21',
      requestCount: 10,
      errorCount: 2,
      rateLimitExceededCount: 1
    },
    {
      apiKeyId: key.id,
      applicationId: app.id,
      serviceId: service.id,
      date: '2025-09-22',
      requestCount: 5,
      errorCount: 0,
      rateLimitExceededCount: 0
    }
  ]);

  const resolver = new ApiKeyUsageResolver();
  const ctx: any = { user: { id: owner.id, permissions: [] } };
  const rows = await resolver.apiKeyUsage(key.id, 14, null, ctx);
  assert.equal(rows.length, 2);
  // Ensure mapping and ordering desc by date
  assert.deepEqual(rows[0], {
    date: '2025-09-22',
    requestCount: 5,
    errorCount: 0,
    rateLimitExceededCount: 0,
    serviceId: service.id
  });
  assert.deepEqual(rows[1], {
    date: '2025-09-21',
    requestCount: 10,
    errorCount: 2,
    rateLimitExceededCount: 1,
    serviceId: null
  });
});
