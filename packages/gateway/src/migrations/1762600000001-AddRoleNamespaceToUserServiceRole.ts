import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleNamespaceToUserServiceRole1762600000001
  implements MigrationInterface
{
  name = 'AddRoleNamespaceToUserServiceRole1762600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_service_roles"
      ADD COLUMN IF NOT EXISTS "roleNamespace" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_service_roles"
      DROP COLUMN IF EXISTS "roleNamespace"
    `);
  }
}
