import 'reflect-metadata';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ApiKeyUsageCounterService } from './api-key-usage.counter';
import { TestDatabaseManager } from '../../test/test-utils';
import { redisClient } from '../../auth/session.config';

before(async () => {
  await TestDatabaseManager.setupDatabase();
});

after(async () => {
  await TestDatabaseManager.teardownDatabase();
});

test('ApiKeyUsageCounterService.incr writes expected Redis fields and TTL (with serviceId)', async () => {
  const svc = new ApiKeyUsageCounterService();
  // Freeze date for deterministic key
  (svc as any).today = () => '2025-09-22';

  await svc.incr('app-1', 'svc-9', 'key-123', { error: true, rateLimited: true });

  const key = `${process.env.API_KEY_USAGE_REDIS_PREFIX || 'gqlgw:ak:usage:v1'}:2025-09-22:key-123:svc-9`;
  const fields = await redisClient.hGetAll(key);
  assert.equal(Number(fields.req || '0'), 1);
  assert.equal(Number(fields.err || '0'), 1);
  assert.equal(Number(fields.rl || '0'), 1);
  assert.equal(fields.applicationId, 'app-1');
  assert.equal(fields.serviceId, 'svc-9');
  const ttl = await redisClient.ttl(key);
  assert.ok(ttl > 0 && ttl <= parseInt(process.env.API_KEY_USAGE_REDIS_TTL_DAYS || '35', 10) * 86400);
});

test('ApiKeyUsageCounterService.incr omits serviceId field when null', async () => {
  const svc = new ApiKeyUsageCounterService();
  (svc as any).today = () => '2025-09-22';

  await svc.incr('app-2', null, 'key-abc', {});

  const key = `${process.env.API_KEY_USAGE_REDIS_PREFIX || 'gqlgw:ak:usage:v1'}:2025-09-22:key-abc:∅`;
  const fields = await redisClient.hGetAll(key);
  assert.equal(Number(fields.req || '0'), 1);
  assert.equal(fields.applicationId, 'app-2');
  assert.ok(!('serviceId' in fields));
});
