import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendAuditLog1757730000000 implements MigrationInterface {
  name = 'ExtendAuditLog1757730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new enum types if needed (Postgres will auto-create). Using text columns for some for easier evolution.
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "category" text NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "severity" text NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "action" varchar(64) NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "success" boolean NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ipAddress" varchar(45) NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "userAgent" text NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "sessionId" uuid NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "correlationId" varchar(64) NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "resourceType" varchar(64) NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "resourceId" varchar(128) NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "riskScore" smallint NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "retentionUntil" TIMESTAMP WITH TIME ZONE NULL`);
    await queryRunner.query(`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "tags" text[] NULL`);

    // Indexes (IF NOT EXISTS for idempotency when re-running in local dev)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_category" ON "audit_logs" ("category")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_severity" ON "audit_logs" ("severity")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action" ON "audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_sessionId" ON "audit_logs" ("sessionId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_correlationId" ON "audit_logs" ("correlationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_resourceType" ON "audit_logs" ("resourceType")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_resourceId" ON "audit_logs" ("resourceId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_riskScore" ON "audit_logs" ("riskScore")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_retentionUntil" ON "audit_logs" ("retentionUntil")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop columns (will also drop dependent indexes automatically in Postgres)
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "tags"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "retentionUntil"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "riskScore"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "resourceId"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "resourceType"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "correlationId"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "sessionId"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "userAgent"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "ipAddress"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "success"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "action"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "severity"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "category"`);
  }
}
