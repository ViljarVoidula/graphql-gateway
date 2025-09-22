import 'reflect-metadata';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as worker from './api-key-usage-consolidator';
import { TestDatabaseManager } from '../test/test-utils';
import { dataSource } from '../db/datasource';
import { redisClient } from '../auth/session.config';
import { ApiKey, ApiKeyStatus } from '../entities/api-key.entity';
import { Application } from '../entities/application.entity';
import { User } from '../services/users/user.entity';
import { ApiKeyUsage } from '../entities/api-key-usage.entity';
import { Service, ServiceStatus } from '../entities/service.entity';

before(async () => {
  await TestDatabaseManager.setupDatabase();
});

after(async () => {
  await TestDatabaseManager.teardownDatabase();
});

beforeEach(async () => {
  await TestDatabaseManager.clearDatabase();
});

test('consolidator drains a key and upserts into Postgres', async () => {
  // Seed User, App, ApiKey
  const user = await dataSource.getRepository(User).save({ email: 'owner@example.com', password: 'x', permissions: [] });
  const app = await dataSource.getRepository(Application).save({ name: 'app', ownerId: user.id });
  const apiKeyRepo = dataSource.getRepository(ApiKey);
  const key = await apiKeyRepo.save(
    apiKeyRepo.create({
      keyPrefix: 'app_abcd1234',
      hashedKey: 'h',
      status: ApiKeyStatus.ACTIVE,
      name: 'k',
      scopes: [],
      applicationId: app.id
    })
  );
  const svc = await dataSource.getRepository(Service).save({
    name: 'svc-1',
    url: 'http://svc-1/graphql',
    ownerId: user.id,
    status: ServiceStatus.ACTIVE,
    externally_accessible: true
  } as any);

  // Write a Redis usage key for today-like fixed date
  const date = '2025-09-22';
  const prefix = process.env.API_KEY_USAGE_REDIS_PREFIX || 'gqlgw:ak:usage:v1';
  const redisKey = `${prefix}:${date}:${key.id}:${svc.id}`;
  await redisClient.hIncrBy(redisKey, 'req', 3);
  await redisClient.hIncrBy(redisKey, 'err', 1);
  await redisClient.hSet(redisKey, { applicationId: app.id, serviceId: svc.id } as any);
  await redisClient.expire(redisKey, 3600);

  // Run consolidator briefly
  process.env.API_KEY_USAGE_FLUSH_INTERVAL_MS = '50';
  const stop = await worker.startApiKeyUsageConsolidator();
  await new Promise((r) => setTimeout(r, 120));
  stop();

  // Assert DB upsert
  const rows = await dataSource.getRepository(ApiKeyUsage).find({ where: { apiKeyId: key.id, date } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].applicationId, app.id);
  assert.equal(rows[0].serviceId, svc.id);
  assert.equal(rows[0].requestCount, 3);
  assert.equal(rows[0].errorCount, 1);
});
