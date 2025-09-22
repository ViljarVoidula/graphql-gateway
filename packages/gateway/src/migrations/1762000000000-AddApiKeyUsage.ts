import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyUsage1762000000000 implements MigrationInterface {
  name = 'AddApiKeyUsage1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_key_usage" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "apiKeyId" uuid NOT NULL,
        "applicationId" uuid NOT NULL,
        "serviceId" uuid,
        "date" date NOT NULL,
        "requestCount" integer NOT NULL DEFAULT 0,
        "errorCount" integer NOT NULL DEFAULT 0,
        "rateLimitExceededCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_api_key_usage_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_api_key_usage_per_day" UNIQUE ("apiKeyId","serviceId","date"),
        CONSTRAINT "FK_api_key_usage_apiKey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_api_key_usage_app" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_api_key_usage_service" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_api_key_usage_apiKeyId" ON "api_key_usage" ("apiKeyId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_api_key_usage_date" ON "api_key_usage" ("date")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_api_key_usage_apiKeyId_date" ON "api_key_usage" ("apiKeyId","date")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_key_usage_apiKeyId_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_key_usage_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_key_usage_apiKeyId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_key_usage"`);
  }
}
