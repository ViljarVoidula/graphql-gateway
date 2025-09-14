import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SAFE / NO-OP PARTITION MIGRATION (revised)
 * -------------------------------------------------
 * Original attempt to repartition audit_logs failed because the primary key (id) does not
 * include the proposed partition key (createdAt). Postgres requires all UNIQUE / PK constraints
 * on a partitioned table to include the partition key columns. Changing the PK would break
 * the ORM entity assumptions (TypeORM expects single-column id primary key).
 *
 * This migration now performs only a recovery step (if prior failed attempt renamed the table)
 * and exits. Future partitioning should be done with a planned schema change that adds
 * createdAt to the primary key or introduces a surrogate partitioning scheme.
 */
export class PartitionAuditLogs1759000001000 implements MigrationInterface {
  name = 'PartitionAuditLogs1759000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Recovery: if audit_logs missing but audit_logs_base present (failed previous run), restore.
    const res = await queryRunner.query(`SELECT to_regclass('audit_logs') AS live, to_regclass('audit_logs_base') AS base`);
    const row = res[0];
    if (!row.live && row.base) {
      await queryRunner.query(`ALTER TABLE audit_logs_base RENAME TO audit_logs`);
    }

    // Check if already partitioned (then leave as-is)
    const partitionCheck = await queryRunner.query(
      `SELECT partstrat FROM pg_partitioned_table p JOIN pg_class c ON p.partrelid = c.oid WHERE c.relname='audit_logs'`
    );
    if (partitionCheck.length > 0) return;

    // Inspect primary key columns
    const pkCols = await queryRunner.query(`
      SELECT a.attname
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
      WHERE t.relname='audit_logs' AND i.indisprimary = true
      ORDER BY a.attnum
    `);
    const pkList: string[] = pkCols.map((r: any) => r.attname);
    const includesCreatedAt = pkList.includes('createdAt');

    // Abort (no-op) if PK not compatible
    if (!includesCreatedAt) {
      // Intentionally do nothing—documented in README performance section.
      return;
    }

    // (Optional) If in future PK includes createdAt, implement partitioning logic here.
  }

  public async down(): Promise<void> {
    // No-op: nothing was changed structurally in revised migration.
  }
}
