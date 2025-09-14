import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds covering / helper indexes to support common query patterns:
 * - application_usage: unique constraint already covers (applicationId, serviceId, date). Optional index on date for time-range scans.
 * - audit_logs: timeline & filtering patterns (createdAt DESC by eventType, per-application timelines, retention cleanup ordering, success filtering).
 *
 * Notes:
 * 1. We create the date index on application_usage only if it does not exist. If table is massive and queries frequently filter by date alone
 *    (e.g., daily aggregations across many apps), this helps avoid scanning unique index fully.
 * 2. For audit_logs we add:
 *    - ("createdAt" DESC, "eventType") for event type timelines
 *    - ("applicationId", "createdAt" DESC) for per-application timelines
 *    - ("retentionUntil") already exists from previous migration, ensure again
 *    - Partial index on (createdAt) WHERE retentionUntil IS NOT NULL for faster retention scanning (optional)
 */
export class AddPerformanceIndexes1759000000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // application_usage date index (optional)
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_application_usage_date" ON "application_usage" ("date")');

    // audit_logs timeline indexes
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt_eventType" ON "audit_logs" ("createdAt" DESC, "eventType")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_application_createdAt" ON "audit_logs" ("applicationId", "createdAt" DESC)'
    );

    // Retention support (already added earlier but ensure idempotent)
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_audit_logs_retentionUntil" ON "audit_logs" ("retentionUntil")');

    // Partial index for retention scanning (only rows with retentionUntil)
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_retentionUntil_partial" ON "audit_logs" ("retentionUntil") WHERE "retentionUntil" IS NOT NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_audit_logs_retentionUntil_partial"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_audit_logs_application_createdAt"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_audit_logs_createdAt_eventType"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_application_usage_date"');
    // Do not drop retentionUntil index; earlier migrations may rely on it. (Safe to leave.)
  }
}
