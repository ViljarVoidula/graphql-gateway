import { strict as assert } from 'assert';
import describe, { after, before, beforeEach, test } from 'node:test';
import { Application } from '../entities/application.entity';
import { enforceRateLimit } from '../middleware/rate-limit.middleware';
import { User } from '../services/users/user.entity';
import { TestDatabaseManager } from './test-utils';

describe.skip(
  'Rate Limit Integration',
  { concurrency: 1, timeout: 5000 },
  () => {
    let baseApp: Application;

    before(async () => {
      await TestDatabaseManager.setupDatabase();
    });

    after(async () => {
      await TestDatabaseManager.teardownDatabase();
    });

    beforeEach(async () => {
      await TestDatabaseManager.clearDatabase();

      const userRepo = await TestDatabaseManager.getRepository(User);
      const appRepo = await TestDatabaseManager.getRepository(Application);
      const testUser = await userRepo.save(
        userRepo.create({
          email: 'ratelimit@test.local',
          password: 'password123',
          permissions: [],
        })
      );
      baseApp = await appRepo.save(
        appRepo.create({
          name: 'RateLimit Test App',
          ownerId: testUser.id,
          rateLimitPerMinute: 3,
          rateLimitPerDay: 10,
          rateLimitDisabled: false,
        })
      );
    });

    test('enforces per-minute limit', async () => {
      async function runSequential(times: number) {
        const results: any[] = [];
        for (let i = 0; i < times; i++) {
          const ctx: any = {
            authType: 'api-key',
            application: baseApp,
            request: { headers: new Map() },
          };
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
  }
);
