import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRateLimitAndAudit1756830683394 implements MigrationInterface {
  name = 'AddRateLimitAndAudit1756830683394';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "rateLimitPerMinute" integer NULL`);
    await queryRunner.query(`ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "rateLimitPerDay" integer NULL`);
    await queryRunner.query(
      `ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "rateLimitDisabled" boolean NOT NULL DEFAULT false`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "eventType" text NOT NULL,
        "applicationId" uuid NULL REFERENCES "applications"(id) ON DELETE CASCADE,
        -- Note: user table is named "user" (singular) in initial schema
        "userId" uuid NULL REFERENCES "user"(id) ON DELETE SET NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_eventType" ON "audit_logs" ("eventType")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_applicationId" ON "audit_logs" ("applicationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_userId" ON "audit_logs" ("userId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "application_usage" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "applicationId" uuid NOT NULL REFERENCES "applications"(id) ON DELETE CASCADE,
        "serviceId" uuid NOT NULL REFERENCES "services"(id) ON DELETE CASCADE,
        "date" date NOT NULL,
        "requestCount" integer NOT NULL DEFAULT 0,
        "errorCount" integer NOT NULL DEFAULT 0,
        "rateLimitExceededCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
        CONSTRAINT "uq_app_service_date" UNIQUE ("applicationId", "serviceId", "date")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_application_usage_app" ON "application_usage" ("applicationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_application_usage_service" ON "application_usage" ("serviceId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_application_usage_date" ON "application_usage" ("date")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "application_usage"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN IF EXISTS "rateLimitPerMinute"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN IF EXISTS "rateLimitPerDay"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN IF EXISTS "rateLimitDisabled"`);
  }
}
