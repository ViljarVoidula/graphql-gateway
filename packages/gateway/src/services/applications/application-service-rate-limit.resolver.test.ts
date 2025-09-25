import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { dataSource } from '../../db/datasource';
import { ApplicationServiceRateLimit } from '../../entities/application-service-rate-limit.entity';
import { Application } from '../../entities/application.entity';
import { Service, ServiceStatus } from '../../entities/service.entity';
import { User } from '../users/user.entity';
import { ApplicationServiceRateLimitResolver } from './application-service-rate-limit.resolver';

async function setup() {
  const userRepo = dataSource.getRepository(User);
  const svcRepo = dataSource.getRepository(Service);
  const appRepo = dataSource.getRepository(Application);
  const limitRepo = dataSource.getRepository(ApplicationServiceRateLimit);

  let admin = await userRepo.findOne({
    where: { email: 'admin-rate@test.local' },
  });
  if (!admin) {
    admin = userRepo.create({
      email: 'admin-rate@test.local',
      password: 'password',
      permissions: ['admin'],
    });
    await userRepo.save(admin);
  }

  const svc = svcRepo.create({
    name: 'Test Service',
    url: 'http://localhost/test',
    ownerId: admin.id,
    status: ServiceStatus.ACTIVE,
    externally_accessible: true,
    enableHMAC: true,
    timeout: 5000,
    enableBatching: true,
  });
  await svcRepo.save(svc);

  const app = appRepo.create({ name: 'App', ownerId: admin.id });
  await appRepo.save(app);

  return { admin, svc, app, limitRepo };
}

describe.skip('ApplicationServiceRateLimitResolver', () => {
  test('set & query', async (t) => {
    const { admin, svc, app, limitRepo } = await setup();
    const resolver = new ApplicationServiceRateLimitResolver();
    // set limit
    const limit = await resolver.setApplicationServiceRateLimit(
      app.id,
      svc.id,
      5,
      50,
      false
    );
    assert.equal(limit.applicationId, app.id);
    assert.equal(limit.serviceId, svc.id);
    assert.equal(limit.perMinute, 5);
    assert.equal(limit.perDay, 50);

    // update partial
    const updated = await resolver.setApplicationServiceRateLimit(
      app.id,
      svc.id,
      10,
      null as any,
      true
    );
    assert.equal(updated.perMinute, 10);
    assert.equal(updated.perDay, 50); // unchanged
    assert.equal(updated.disabled, true);

    // query
    const list = await resolver.applicationServiceRateLimits(app.id, {
      user: { id: admin.id, permissions: ['admin'] },
    } as any);
    assert.equal(list.length, 1);

    // delete
    const deleted = await resolver.deleteApplicationServiceRateLimit(
      updated.id
    );
    assert.equal(deleted, true);
    const afterDelete = await limitRepo.find({
      where: { applicationId: app.id },
    });
    assert.equal(afterDelete.length, 0);
  });
});
