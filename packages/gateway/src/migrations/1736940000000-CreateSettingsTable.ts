import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSettingsTable1736940000000 implements MigrationInterface {
  name = 'CreateSettingsTable1736940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" varchar(128) NOT NULL UNIQUE,
        "stringValue" text NULL,
        "numberValue" bigint NULL,
        "boolValue" boolean NULL,
        "jsonValue" jsonb NULL,
        "valueType" varchar(32) NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_settings_key" ON "settings" ("key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "settings"');
  }
}
