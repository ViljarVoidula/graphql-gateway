import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGatewayMessages1762500000000 implements MigrationInterface {
  name = 'CreateGatewayMessages1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gateway_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "topic" varchar(200) NOT NULL,
        "type" varchar NULL,
        "tenantId" varchar NULL,
        "userId" varchar NULL,
        "appId" varchar NULL,
        "senderApplicationId" varchar NULL,
        "apiKeyId" uuid NULL,
        "severity" varchar NULL,
        "payload" jsonb NOT NULL,
        "timestamp" timestamptz NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "expiresAt" timestamptz NULL,
        CONSTRAINT "PK_gateway_messages_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gateway_messages_topic" ON "gateway_messages" ("topic")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gateway_messages_userId" ON "gateway_messages" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gateway_messages_appId" ON "gateway_messages" ("appId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gateway_messages_senderApplicationId" ON "gateway_messages" ("senderApplicationId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gateway_messages_apiKeyId" ON "gateway_messages" ("apiKeyId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gateway_messages_createdAt" ON "gateway_messages" ("createdAt")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gateway_messages_createdAt"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gateway_messages_apiKeyId"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gateway_messages_senderApplicationId"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gateway_messages_appId"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gateway_messages_userId"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_gateway_messages_topic"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "gateway_messages"`);
  }
}
