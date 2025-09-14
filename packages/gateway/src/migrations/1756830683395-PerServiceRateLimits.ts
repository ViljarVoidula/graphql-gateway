import { MigrationInterface, QueryRunner } from 'typeorm';

export class PerServiceRateLimits1756830683395 implements MigrationInterface {
  name = 'PerServiceRateLimits1756830683395';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "application_service_rate_limits" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "applicationId" uuid NOT NULL REFERENCES "applications"(id) ON DELETE CASCADE,
        "serviceId" uuid NOT NULL REFERENCES "services"(id) ON DELETE CASCADE,
        "perMinute" integer NULL,
        "perDay" integer NULL,
        "disabled" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ DEFAULT now(),
        "updatedAt" TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT "uq_app_service_limit" UNIQUE ("applicationId", "serviceId")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_asrl_app" ON "application_service_rate_limits" ("applicationId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_asrl_service" ON "application_service_rate_limits" ("serviceId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "application_service_rate_limits"');
  }
}
