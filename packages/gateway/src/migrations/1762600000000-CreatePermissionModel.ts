import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePermissionModel1762600000000 implements MigrationInterface {
  name = 'CreatePermissionModel1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permission_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "roleKey" varchar NOT NULL,
        "scope" varchar NOT NULL,
        "serviceId" uuid NULL,
        "description" text NULL,
  "permissions" text[] NOT NULL DEFAULT '{}'::text[],
  "tags" text[] DEFAULT '{}'::text[],
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_permission_templates_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_permission_templates_scope_service_role"
      ON "permission_templates" ("scope", "serviceId", "roleKey")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "serviceId" uuid NOT NULL,
        "operationType" varchar NOT NULL,
        "operationName" varchar NOT NULL,
        "fieldPath" varchar NULL,
        "permissionKey" varchar NOT NULL,
        "accessLevel" varchar NOT NULL,
        "metadata" jsonb NULL,
        "active" boolean NOT NULL DEFAULT true,
        "archivedAt" timestamptz NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_service_permissions_permissionKey" UNIQUE ("permissionKey")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_service_permissions_composite"
      ON "service_permissions" ("serviceId", "operationType", "operationName", COALESCE("fieldPath", '*'))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_service_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "serviceId" uuid NULL,
        "roleKey" varchar NOT NULL,
        "displayName" varchar NULL,
  "permissions" text[] NOT NULL DEFAULT '{}'::text[],
        "templateId" uuid NULL,
        "expiresAt" timestamptz NULL,
        "archivedAt" timestamptz NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_service_roles_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_service_roles_unique"
      ON "user_service_roles" ("userId", COALESCE("serviceId", '00000000-0000-0000-0000-000000000000'), "roleKey")
    `);

    await queryRunner.query(`
      ALTER TABLE "service_permissions"
      ADD CONSTRAINT "FK_service_permissions_service"
      FOREIGN KEY ("serviceId")
      REFERENCES "services"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "user_service_roles"
      ADD CONSTRAINT "FK_user_service_roles_user"
      FOREIGN KEY ("userId")
      REFERENCES "user"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "user_service_roles"
      ADD CONSTRAINT "FK_user_service_roles_service"
      FOREIGN KEY ("serviceId")
      REFERENCES "services"("id")
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "user_service_roles"
      ADD CONSTRAINT "FK_user_service_roles_template"
      FOREIGN KEY ("templateId")
      REFERENCES "permission_templates"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_service_roles" DROP CONSTRAINT IF EXISTS "FK_user_service_roles_template"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_service_roles" DROP CONSTRAINT IF EXISTS "FK_user_service_roles_service"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_service_roles" DROP CONSTRAINT IF EXISTS "FK_user_service_roles_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "service_permissions" DROP CONSTRAINT IF EXISTS "FK_service_permissions_service"
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_service_roles_unique"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_service_roles"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_service_permissions_composite"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "service_permissions"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_permission_templates_scope_service_name"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "permission_templates"`);
  }
}
