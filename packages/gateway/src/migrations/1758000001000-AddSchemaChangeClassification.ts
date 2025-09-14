import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSchemaChangeClassification1758000001000 implements MigrationInterface {
  name = 'AddSchemaChangeClassification1758000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('schema_changes');
    if (!hasTable) return; // earlier migration not run yet

    // Add enum type if not existing (Postgres specific)
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schema_change_classification_enum') THEN
          CREATE TYPE "schema_change_classification_enum" AS ENUM ('breaking','non_breaking','unknown');
        END IF;
      END $$;`
    );
    // Skip if column already exists
    const table = await queryRunner.getTable('schema_changes');
    const already = table?.columns.find((c) => c.name === 'classification');
    if (already) return;
    await queryRunner.addColumn(
      'schema_changes',
      new TableColumn({
        name: 'classification',
        type: 'enum',
        enumName: 'schema_change_classification_enum',
        enum: ['breaking', 'non_breaking', 'unknown'],
        default: `'unknown'`,
        isNullable: false
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('schema_changes');
    if (!hasTable) return;
    await queryRunner.query('ALTER TABLE "schema_changes" DROP COLUMN IF EXISTS "classification"');
    // Optionally drop type (guard if still used)
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schema_change_classification_enum') THEN
          DROP TYPE "schema_change_classification_enum";
        END IF;
      END $$;`
    );
  }
}
