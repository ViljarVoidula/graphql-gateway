import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionConfigToServices1762300000000 implements MigrationInterface {
  name = 'AddSubscriptionConfigToServices1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('services');
    if (!hasTable) return;

    // Add subscriptionTransport column if missing
    const transportCol: Array<{ column_name: string }> = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'subscriptionTransport'`
    )) as any;
    if (transportCol.length === 0) {
      await queryRunner.query(`ALTER TABLE "services" ADD COLUMN "subscriptionTransport" varchar NOT NULL DEFAULT 'auto'`);
    }

    // Add subscriptionPath column if missing
    const pathCol: Array<{ column_name: string }> = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'subscriptionPath'`
    )) as any;
    if (pathCol.length === 0) {
      await queryRunner.query(`ALTER TABLE "services" ADD COLUMN "subscriptionPath" varchar NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('services');
    if (!hasTable) return;

    const transportCol: Array<{ column_name: string }> = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'subscriptionTransport'`
    )) as any;
    if (transportCol.length > 0) {
      await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "subscriptionTransport"`);
    }

    const pathCol: Array<{ column_name: string }> = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'subscriptionPath'`
    )) as any;
    if (pathCol.length > 0) {
      await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "subscriptionPath"`);
    }
  }
}
