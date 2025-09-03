import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1756830683391 implements MigrationInterface {
  name = 'InitialSchema1756830683391';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotency guard: if the main table already exists, assume this migration was applied
    // and skip re-running it to avoid "relation already exists" errors.
    // TypeORM will still record the migration as executed.
    const hasServices = await queryRunner.hasTable('services');
    if (hasServices) {
      // Optional log for visibility when running migrations programmatically
      console.log('InitialSchema1756830683391: services table already exists, skipping migration');
      return;
    }

    // Ensure required extensions for UUID generation exist
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    // pgcrypto is not strictly required here, but commonly used; keep for completeness
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."services_status_enum" AS ENUM('active', 'inactive', 'maintenance');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);
    await queryRunner.query(
      `CREATE TABLE "services" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "url" character varying NOT NULL, "description" character varying, "status" "public"."services_status_enum" NOT NULL DEFAULT 'active', "version" character varying, "sdl" text, "enableHMAC" boolean NOT NULL DEFAULT true, "timeout" integer NOT NULL DEFAULT '5000', "enableBatching" boolean NOT NULL DEFAULT true, "externally_accessible" boolean NOT NULL DEFAULT false, "ownerId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_019d74f7abcdcb5a0113010cb03" UNIQUE ("name"), CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE INDEX "IDX_019d74f7abcdcb5a0113010cb0" ON "services" ("name") `);
    await queryRunner.query(`CREATE INDEX "IDX_6b120c70deef4725499831e42b" ON "services" ("externally_accessible") `);
    await queryRunner.query(`CREATE INDEX "IDX_f693969e1a4d7422c864d2b553" ON "services" ("ownerId") `);
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password" character varying NOT NULL, "permissions" text NOT NULL DEFAULT '', "isEmailVerified" boolean NOT NULL DEFAULT false, "lastLoginAt" TIMESTAMP, "failedLoginAttempts" integer NOT NULL DEFAULT '0', "lockedUntil" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "sessionId" character varying(255) NOT NULL, "ipAddress" character varying(45), "userAgent" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "lastActivity" TIMESTAMP NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."service_keys_status_enum" AS ENUM('active', 'revoked', 'expired');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);
    await queryRunner.query(
      `CREATE TABLE "service_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "keyId" character varying NOT NULL, "secretKey" character varying NOT NULL, "status" "public"."service_keys_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP, "serviceId" character varying NOT NULL, "service_id" uuid, CONSTRAINT "UQ_2305bdc85d79a1d524137c9b8ff" UNIQUE ("keyId"), CONSTRAINT "PK_cf33e3d2babbd13fe7d39d4c070" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE INDEX "IDX_2305bdc85d79a1d524137c9b8f" ON "service_keys" ("keyId") `);
    await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."api_keys_status_enum" AS ENUM('active', 'revoked', 'expired');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);
    await queryRunner.query(
      `CREATE TABLE "api_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "keyPrefix" character varying(12) NOT NULL, "hashedKey" character varying NOT NULL, "status" "public"."api_keys_status_enum" NOT NULL DEFAULT 'active', "name" character varying NOT NULL DEFAULT '', "scopes" text NOT NULL DEFAULT '', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP, "lastUsedAt" TIMESTAMP, "applicationId" uuid NOT NULL, CONSTRAINT "UQ_0d632a6c3b16bc708bf0987fed2" UNIQUE ("hashedKey"), CONSTRAINT "PK_5c8a79801b44bd27b79228e1dad" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE INDEX "IDX_3ee8ea3e49f8f437c17219dad6" ON "api_keys" ("keyPrefix") `);
    await queryRunner.query(`CREATE INDEX "IDX_0d632a6c3b16bc708bf0987fed" ON "api_keys" ("hashedKey") `);
    await queryRunner.query(
      `CREATE TABLE "applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "ownerId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_938c0a27255637bde919591888f" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(`CREATE INDEX "IDX_fcdfc51648dfbc8cfa417d6c3f" ON "applications" ("name") `);
    await queryRunner.query(`CREATE INDEX "IDX_d88cfc3ec1f66c6c7b55d79f02" ON "applications" ("ownerId") `);
    await queryRunner.query(
      `CREATE TABLE "application_whitelisted_services" ("applicationId" uuid NOT NULL, "serviceId" uuid NOT NULL, CONSTRAINT "PK_77de94d631f3509fa21b26cb0e3" PRIMARY KEY ("applicationId", "serviceId"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8624a79a028aa46a22eece381" ON "application_whitelisted_services" ("applicationId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2001f38e5d6feae8521800c54a" ON "application_whitelisted_services" ("serviceId") `
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "FK_f693969e1a4d7422c864d2b5537" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "service_keys" ADD CONSTRAINT "FK_40de6e26e8f98e4ef355be532a8" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD CONSTRAINT "FK_101eac1974dc9a72b56848d73ad" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "FK_d88cfc3ec1f66c6c7b55d79f025" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "application_whitelisted_services" ADD CONSTRAINT "FK_f8624a79a028aa46a22eece381a" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "application_whitelisted_services" ADD CONSTRAINT "FK_2001f38e5d6feae8521800c54ab" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    );
    await queryRunner.query(
      `CREATE TABLE "query-result-cache" ("id" SERIAL NOT NULL, "identifier" character varying, "time" bigint NOT NULL, "duration" integer NOT NULL, "query" text NOT NULL, "result" text NOT NULL, CONSTRAINT "PK_6a98f758d8bfd010e7e10ffd3d3" PRIMARY KEY ("id"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "query-result-cache"`);
    await queryRunner.query(`ALTER TABLE "application_whitelisted_services" DROP CONSTRAINT "FK_2001f38e5d6feae8521800c54ab"`);
    await queryRunner.query(`ALTER TABLE "application_whitelisted_services" DROP CONSTRAINT "FK_f8624a79a028aa46a22eece381a"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP CONSTRAINT "FK_d88cfc3ec1f66c6c7b55d79f025"`);
    await queryRunner.query(`ALTER TABLE "api_keys" DROP CONSTRAINT "FK_101eac1974dc9a72b56848d73ad"`);
    await queryRunner.query(`ALTER TABLE "service_keys" DROP CONSTRAINT "FK_40de6e26e8f98e4ef355be532a8"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`);
    await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_f693969e1a4d7422c864d2b5537"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2001f38e5d6feae8521800c54a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f8624a79a028aa46a22eece381"`);
    await queryRunner.query(`DROP TABLE "application_whitelisted_services"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d88cfc3ec1f66c6c7b55d79f02"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fcdfc51648dfbc8cfa417d6c3f"`);
    await queryRunner.query(`DROP TABLE "applications"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0d632a6c3b16bc708bf0987fed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3ee8ea3e49f8f437c17219dad6"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
    await queryRunner.query(`DROP TYPE "public"."api_keys_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2305bdc85d79a1d524137c9b8f"`);
    await queryRunner.query(`DROP TABLE "service_keys"`);
    await queryRunner.query(`DROP TYPE "public"."service_keys_status_enum"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f693969e1a4d7422c864d2b553"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6b120c70deef4725499831e42b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_019d74f7abcdcb5a0113010cb0"`);
    await queryRunner.query(`DROP TABLE "services"`);
    await queryRunner.query(`DROP TYPE "public"."services_status_enum"`);
  }
}
