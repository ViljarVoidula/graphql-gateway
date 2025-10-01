import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTypePrefixFieldsToServices1762700000000 implements MigrationInterface {
  name = 'AddTypePrefixFieldsToServices1762700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('services');
    if (!hasTable) return;

    const hasEnableColumn: Array<{ column_name: string }> = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'enableTypePrefix'`
    );

    if (hasEnableColumn.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "services" ADD COLUMN "enableTypePrefix" boolean NOT NULL DEFAULT false`
      );
      await queryRunner.query(
        `UPDATE "services" SET "enableTypePrefix" = false WHERE "enableTypePrefix" IS NULL`
      );
    }

    const hasPrefixColumn: Array<{ column_name: string }> = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'typePrefix'`
    );

    if (hasPrefixColumn.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "services" ADD COLUMN "typePrefix" character varying(64)`
      );
      await queryRunner.query(
        `UPDATE "services" SET "typePrefix" = NULL`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('services');
    if (!hasTable) return;

    const hasPrefixColumn: Array<{ column_name: string }> = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'typePrefix'`
    );
    if (hasPrefixColumn.length > 0) {
      await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "typePrefix"`);
    }

    const hasEnableColumn: Array<{ column_name: string }> = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'enableTypePrefix'`
    );
    if (hasEnableColumn.length > 0) {
      await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "enableTypePrefix"`);
    }
  }
}
