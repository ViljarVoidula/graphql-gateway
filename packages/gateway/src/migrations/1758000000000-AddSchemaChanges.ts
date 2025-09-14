import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddSchemaChanges1758000000000 implements MigrationInterface {
  name = 'AddSchemaChanges1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasTable('schema_changes');
    if (has) return; // Already created (likely via synchronize in non-prod)
    await queryRunner.createTable(
      new Table({
        name: 'schema_changes',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'serviceId', type: 'uuid', isNullable: false },
          { name: 'previousHash', type: 'varchar', length: '64', isNullable: true },
          { name: 'newHash', type: 'varchar', length: '64', isNullable: false },
          { name: 'diff', type: 'text', isNullable: false },
          { name: 'schemaSDL', type: 'text', isNullable: false },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' }
        ],
        foreignKeys: [
          {
            columnNames: ['serviceId'],
            referencedTableName: 'services',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE'
          }
        ],
        indices: [
          { name: 'IDX_schema_changes_serviceId_createdAt', columnNames: ['serviceId', 'createdAt'] },
          { name: 'IDX_schema_changes_newHash', columnNames: ['newHash'] }
        ]
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('schema_changes');
  }
}
