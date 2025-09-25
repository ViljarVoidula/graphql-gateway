import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import 'reflect-metadata';
import { redisClient } from '../../auth/session.config';
import { ApiKeyUsageCounterService } from './api-key-usage.counter';

describe.skip('ApiKeyUsageCounterService', () => {
  test('ApiKeyUsageCounterService.incr writes expected Redis fields and TTL (with serviceId)', async () => {
    const svc = new ApiKeyUsageCounterService();
    // Freeze date for deterministic key
    (svc as any).today = () => '2025-09-22';
    const key = `${process.env.API_KEY_USAGE_REDIS_PREFIX || 'gqlgw:ak:usage:v1'}:2025-09-22:key-123:svc-9`;
    // Ensure clean slate if using a real Redis instance
    try {
      await redisClient.del(key);
    } catch {}

    await svc.incr('app-1', 'svc-9', 'key-123', {
      error: true,
      rateLimited: true,
    });

    const fields = await redisClient.hgetall(key);
    assert.equal(Number(fields.req || '0'), 1);
    assert.equal(Number(fields.err || '0'), 1);
    assert.equal(Number(fields.rl || '0'), 1);
    assert.equal(fields.applicationId, 'app-1');
    assert.equal(fields.serviceId, 'svc-9');
    const ttl = await redisClient.ttl(key);
    assert.ok(
      ttl > 0 &&
        ttl <=
          parseInt(process.env.API_KEY_USAGE_REDIS_TTL_DAYS || '35', 10) * 86400
    );
    try {
      await redisClient.del(key);
    } catch {}
  });

  test('ApiKeyUsageCounterService.incr omits serviceId field when null', async () => {
    const svc = new ApiKeyUsageCounterService();
    (svc as any).today = () => '2025-09-22';
    const key = `${process.env.API_KEY_USAGE_REDIS_PREFIX || 'gqlgw:ak:usage:v1'}:2025-09-22:key-abc:∅`;
    try {
      await redisClient.del(key);
    } catch {}

    await svc.incr('app-2', null, 'key-abc', {});

    const fields = await redisClient.hgetall(key);
    assert.equal(Number(fields.req || '0'), 1);
    assert.equal(fields.applicationId, 'app-2');
    assert.ok(!('serviceId' in fields));
    try {
      await redisClient.del(key);
    } catch {}
  });
});
