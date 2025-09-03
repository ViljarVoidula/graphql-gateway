import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerificationFieldsToUser1756830683393 implements MigrationInterface {
  name = 'AddEmailVerificationFieldsToUser1756830683393';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns only if they don't already exist (idempotent)
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerificationToken" character varying`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerificationTokenExpiry" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "emailVerificationTokenExpiry"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "emailVerificationToken"`);
  }
}
