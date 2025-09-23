import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLatencyTypeColumn1762200000000 implements MigrationInterface {
  name = 'AddLatencyTypeColumn1762200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add latencyType column to request_latencies table
    await queryRunner.query(`
      ALTER TABLE "request_latencies" 
      ADD COLUMN "latencyType" character varying NOT NULL DEFAULT 'gateway_operation'
    `);

    // Create index for the new column
    await queryRunner.query(`CREATE INDEX "IDX_request_latencies_latency_type" ON "request_latencies" ("latencyType")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the index first
    await queryRunner.query(`DROP INDEX "IDX_request_latencies_latency_type"`);

    // Drop the column
    await queryRunner.query(`ALTER TABLE "request_latencies" DROP COLUMN "latencyType"`);
  }
}
