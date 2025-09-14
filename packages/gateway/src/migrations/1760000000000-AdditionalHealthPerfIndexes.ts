import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additional performance indexes to accelerate health & dashboard summaries.
 *
 * Rationale:
 * - audit_logs queries now aggregate over recent time windows by createdAt, severity, action.
 *   Existing indexes cover (createdAt,eventType) and (applicationId, createdAt DESC) but not severity/action combos.
 *   We add composite indexes to support filtering/aggregation patterns:
 *     1. (createdAt DESC, severity) for fast severity histogram in recent window.
 *     2. (createdAt DESC, action) for top action counts in recent window.
 * - schema_changes breaking change aggregation by serviceId over recent window benefits from (serviceId, createdAt DESC, classification).
 * - application_usage daily rollups by serviceId and applicationId over a small date set benefit from covering indexes:
 *     (serviceId, date) and (applicationId, date) (the table may already have a unique (applicationId, serviceId, date)).
 */
export class AdditionalHealthPerfIndexes1760000000000 implements MigrationInterface {
  name = 'AdditionalHealthPerfIndexes1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // AUDIT LOGS
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt_severity" ON "audit_logs" ("createdAt" DESC, "severity")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt_action" ON "audit_logs" ("createdAt" DESC, "action")'
    );

    // SCHEMA CHANGES (serviceId + createdAt + classification)
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_schema_changes_service_createdAt_class" ON "schema_changes" ("serviceId", "createdAt" DESC, "classification")'
    );

    // APPLICATION USAGE (support quick serviceId/date & applicationId/date aggregation)
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_application_usage_service_date" ON "application_usage" ("serviceId", "date")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_application_usage_app_date" ON "application_usage" ("applicationId", "date")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_application_usage_app_date"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_application_usage_service_date"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_schema_changes_service_createdAt_class"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_audit_logs_createdAt_action"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_audit_logs_createdAt_severity"');
  }
}
