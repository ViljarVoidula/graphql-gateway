import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUseMsgPackToServices1761000000000 implements MigrationInterface {
  name = 'AddUseMsgPackToServices1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent: only add column if it does not exist
    const hasTable = await queryRunner.hasTable('services');
    if (!hasTable) return; // services table missing (should not happen after initial migration)
    const columns: Array<{ column_name: string }> = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'useMsgPack'`
    )) as any;
    if (columns.length === 0) {
      await queryRunner.query(`ALTER TABLE "services" ADD COLUMN "useMsgPack" boolean NOT NULL DEFAULT false`);
      // Backfill existing rows to explicit false (DEFAULT already does this for new rows)
      await queryRunner.query(`UPDATE "services" SET "useMsgPack" = false WHERE "useMsgPack" IS NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('services');
    if (!hasTable) return;
    const columns: Array<{ column_name: string }> = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'useMsgPack'`
    )) as any;
    if (columns.length > 0) {
      await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "useMsgPack"`);
    }
  }
}
