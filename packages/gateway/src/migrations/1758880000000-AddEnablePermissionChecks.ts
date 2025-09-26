import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnablePermissionChecks1758880000000
  implements MigrationInterface
{
  name = 'AddEnablePermissionChecks1758880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new column with default false
    await queryRunner.query(
      `ALTER TABLE "services" ADD COLUMN "enablePermissionChecks" boolean NOT NULL DEFAULT false`
    );
    // Backfill existing rows to false explicitly (defensive even though default applied)
    await queryRunner.query(
      `UPDATE "services" SET "enablePermissionChecks" = false WHERE "enablePermissionChecks" IS NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "services" DROP COLUMN "enablePermissionChecks"`
    );
  }
}
