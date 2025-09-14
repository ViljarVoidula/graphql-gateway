import assert from 'node:assert/strict';
import test from 'node:test';
import 'reflect-metadata';
import { dataSource } from '../../db/datasource';
import { AuditEventType, AuditLog } from '../../entities/audit-log.entity';
import { describeWithDatabase } from '../../test/test-utils';
import { cleanupExpiredAuditLogs } from './audit-log.retention';

describeWithDatabase('AuditLog retention cleanup', () => {
  test('should delete only expired records', async () => {
    const repo = dataSource.getRepository(AuditLog);
    const unique = `retention-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Deterministic expired timestamps far in the past to avoid boundary issues
    const past1 = await repo.save(
      repo.create({ eventType: AuditEventType.USER_LOGIN, metadata: { marker: unique }, retentionUntil: new Date(0) })
    );
    const past2 = await repo.save(
      repo.create({ eventType: AuditEventType.API_REQUEST, metadata: { marker: unique }, retentionUntil: new Date(1) })
    );
    // Future log far in the future
    const future = await repo.save(
      repo.create({
        eventType: AuditEventType.API_KEY_CREATED,
        metadata: { marker: unique },
        retentionUntil: new Date(Date.now() + 365 * 24 * 3600_000)
      })
    );

    const deleted = await cleanupExpiredAuditLogs({ batchSize: 10, maxBatchesPerRun: 2 });
    assert.equal(deleted, 2, 'Should delete exactly the two expired records inserted by this test');

    // Verify specific records were deleted
    const reloadedPast1 = await repo.findOne({ where: { id: past1.id } });
    const reloadedPast2 = await repo.findOne({ where: { id: past2.id } });
    assert.equal(reloadedPast1, null, 'First expired record should be deleted');
    assert.equal(reloadedPast2, null, 'Second expired record should be deleted');

    // Future record should remain intact
    const reloadedFuture = await repo.findOne({ where: { id: future.id } });
    assert.ok(reloadedFuture, 'Future (non-expired) record should still exist');
    assert.ok(
      reloadedFuture!.retentionUntil && reloadedFuture!.retentionUntil > new Date(),
      'Future record retentionUntil should be in the future'
    );
  });
});
