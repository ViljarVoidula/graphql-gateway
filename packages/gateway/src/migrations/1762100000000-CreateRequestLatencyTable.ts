import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRequestLatencyTable1762100000000 implements MigrationInterface {
  name = 'CreateRequestLatencyTable1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create request_latencies table
    await queryRunner.query(`
      CREATE TABLE "request_latencies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "serviceId" uuid NOT NULL,
        "applicationId" uuid NOT NULL,
        "userId" uuid,
        "operationName" character varying NOT NULL,
        "operationType" character varying NOT NULL,
        "latencyMs" double precision NOT NULL,
        "hasErrors" boolean NOT NULL DEFAULT false,
        "statusCode" smallint NOT NULL DEFAULT 200,
        "ipAddress" character varying(45),
        "userAgent" text,
        "correlationId" character varying(128),
        "date" date NOT NULL,
        "hour" smallint NOT NULL,
        "requestSizeBytes" integer,
        "responseSizeBytes" integer,
        "authType" character varying NOT NULL DEFAULT 'unknown',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_request_latencies" PRIMARY KEY ("id")
      )
    `);

    // Create indexes for optimal query performance
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_service_id" ON "request_latencies" ("serviceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_application_id" ON "request_latencies" ("applicationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_user_id" ON "request_latencies" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_operation_name" ON "request_latencies" ("operationName")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_operation_type" ON "request_latencies" ("operationType")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_latency_ms" ON "request_latencies" ("latencyMs")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_has_errors" ON "request_latencies" ("hasErrors")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_status_code" ON "request_latencies" ("statusCode")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_correlation_id" ON "request_latencies" ("correlationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_date" ON "request_latencies" ("date")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_hour" ON "request_latencies" ("hour")`);
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_auth_type" ON "request_latencies" ("authType")`);

    // Composite indexes for common query patterns
    await queryRunner.query(
      `CREATE INDEX "IDX_request_latencies_service_app_date" ON "request_latencies" ("serviceId", "applicationId", "date")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_request_latencies_app_user_date" ON "request_latencies" ("applicationId", "userId", "date")`
    );
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_service_date" ON "request_latencies" ("serviceId", "date")`);

    // Foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "request_latencies" 
      ADD CONSTRAINT "FK_request_latencies_service" 
      FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "request_latencies" 
      ADD CONSTRAINT "FK_request_latencies_application" 
      FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "request_latencies" 
      ADD CONSTRAINT "FK_request_latencies_user" 
      FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL
    `);

    // Create a partial index for high latency requests (useful for alerting)
    await queryRunner.query(`
      CREATE INDEX "IDX_request_latencies_high_latency" 
      ON "request_latencies" ("latencyMs", "date", "serviceId") 
      WHERE "latencyMs" > 1000
    `);

    // Create a partial index for error requests
    await queryRunner.query(`
      CREATE INDEX "IDX_request_latencies_errors" 
      ON "request_latencies" ("date", "serviceId", "applicationId") 
      WHERE "hasErrors" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints first
    await queryRunner.query(`ALTER TABLE "request_latencies" DROP CONSTRAINT "FK_request_latencies_user"`);
    await queryRunner.query(`ALTER TABLE "request_latencies" DROP CONSTRAINT "FK_request_latencies_application"`);
    await queryRunner.query(`ALTER TABLE "request_latencies" DROP CONSTRAINT "FK_request_latencies_service"`);

    // Drop the table (this will also drop all indexes)
    await queryRunner.query(`DROP TABLE "request_latencies"`);
  }
}
