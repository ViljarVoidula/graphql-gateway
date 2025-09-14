import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds indexes to accelerate compliance queries filtering by sessionId and time windows.
 * - Composite btree on (sessionId, "createdAt") supports range scans for a specific session.
 * - Partial index on ("createdAt") WHERE sessionId IS NOT NULL for recent non-null session filtering + ordering.
 * - (Optional future) BRIN index on createdAt if table becomes extremely large and mostly scanned by time.
 */
export class AddSessionIdAuditIndexes1760000001000 implements MigrationInterface {
  name = 'AddSessionIdAuditIndexes1760000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS audit_logs_session_created_idx ON audit_logs USING btree ("sessionId", "createdAt")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS audit_logs_session_not_null_created_partial_idx ON audit_logs USING btree ("createdAt") WHERE "sessionId" IS NOT NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS audit_logs_session_not_null_created_partial_idx');
    await queryRunner.query('DROP INDEX IF EXISTS audit_logs_session_created_idx');
  }
}
