import { strict as assert } from 'assert';
import { beforeEach, test } from 'node:test';
import { dataSource } from '../db/datasource';
import { Application } from '../entities/application.entity';
import { enforceRateLimit } from '../middleware/rate-limit.middleware';
import { User } from '../services/users/user.entity';
import { describeWithDatabase } from './test-utils';

describeWithDatabase('Rate Limit Integration', () => {
  let baseApp: Application;

  beforeEach(async () => {
    const userRepo = dataSource.getRepository(User);
    const appRepo = dataSource.getRepository(Application);
    const testUser = await userRepo.save(
      userRepo.create({ email: 'ratelimit@test.local', password: 'password123', permissions: [] })
    );
    baseApp = await appRepo.save(
      appRepo.create({
        name: 'RateLimit Test App',
        ownerId: testUser.id,
        rateLimitPerMinute: 3,
        rateLimitPerDay: 10,
        rateLimitDisabled: false
      })
    );
  });

  test('enforces per-minute limit', async () => {
    async function runSequential(times: number) {
      const results: any[] = [];
      for (let i = 0; i < times; i++) {
        const ctx: any = { authType: 'api-key', application: baseApp, request: { headers: new Map() } };
        const r = await enforceRateLimit(ctx);
        results.push(r);
        if (!r.allowed) break;
      }
      return results;
    }
    const results = await runSequential(5);
    assert.equal(results[0].allowed, true, '1 allowed');
    assert.equal(results[1].allowed, true, '2 allowed');
    assert.equal(results[2].allowed, true, '3 allowed');
    assert.equal(results[3].allowed, false, '4 should be blocked');
  });
});
