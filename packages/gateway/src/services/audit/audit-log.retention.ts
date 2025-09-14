import { Repository } from 'typeorm';
import { dataSource } from '../../db/datasource';
import { AuditLog } from '../../entities/audit-log.entity';
import { log } from '../../utils/logger';

export interface AuditLogRetentionConfig {
  batchSize: number;
  maxBatchesPerRun: number;
}

export const DEFAULT_RETENTION_CONFIG: AuditLogRetentionConfig = {
  batchSize: 500,
  maxBatchesPerRun: 10
};

export async function cleanupExpiredAuditLogs(cfg: Partial<AuditLogRetentionConfig> = {}) {
  const config = { ...DEFAULT_RETENTION_CONFIG, ...cfg };
  const repo: Repository<AuditLog> = dataSource.getRepository(AuditLog);
  const now = new Date();
  let totalDeleted = 0;

  // Detect if audit_logs is partitioned; if so drop whole partitions older than now.
  try {
    const partitioned = await dataSource.query(
      `SELECT partstrat FROM pg_partitioned_table p JOIN pg_class c ON p.partrelid = c.oid WHERE c.relname='audit_logs'`
    );
    if (partitioned.length > 0) {
      // List partitions with their range boundaries (relname like audit_logs_YYYY_MM)
      const parts: { relname: string }[] = await dataSource.query(
        `SELECT c.relname
         FROM pg_inherits
         JOIN pg_class c ON pg_inherits.inhrelid = c.oid
         JOIN pg_class p ON pg_inherits.inhparent = p.oid
         WHERE p.relname = 'audit_logs'`
      );
      for (const part of parts) {
        // Derive month start from name pattern audit_logs_YYYY_MM
        const m = part.relname.match(/^audit_logs_(\d{4})_(\d{2})$/);
        if (!m) continue;
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        const monthEnd = new Date(Date.UTC(year, month, 1));
        // Partition fully expired if its end < now AND all rows should be beyond retention (approx check using min(retentionUntil) not needed if policy ensures retentionUntil within month)
        if (monthEnd < now) {
          // Extra safety: ensure no rows inside that still have retentionUntil > now (rare). We'll run a quick check.
          const countRows = await dataSource.query(
            `SELECT 1 FROM ${part.relname} WHERE "retentionUntil" IS NOT NULL AND "retentionUntil" > now() LIMIT 1`
          );
          if (countRows.length === 0) {
            try {
              await dataSource.query(`DROP TABLE IF EXISTS ${part.relname} CASCADE`);
              totalDeleted += 1; // count partitions dropped (not rows) for logging
              log.debug('Dropped expired audit log partition', {
                operation: 'auditLogRetentionCleanup',
                metadata: { partition: part.relname }
              });
            } catch (dropErr) {
              log.error('Failed to drop audit log partition', {
                operation: 'auditLogRetentionCleanup',
                error: dropErr instanceof Error ? dropErr : new Error(String(dropErr)),
                metadata: { partition: part.relname }
              });
            }
          }
        }
      }
      if (totalDeleted > 0) {
        log.info('Audit log retention partition cleanup completed', {
          operation: 'auditLogRetentionCleanup',
          metadata: { partitionsDropped: totalDeleted }
        });
      }
      return totalDeleted; // For partitions we return count of partitions dropped
    }
  } catch (err) {
    log.error('Partition detection failed, falling back to row-based cleanup', {
      operation: 'auditLogRetentionCleanup',
      error: err instanceof Error ? err : new Error(String(err))
    });
  }

  for (let batch = 0; batch < config.maxBatchesPerRun; batch++) {
    // Select ids first to avoid long-running delete with returning
    const ids: { id: string }[] = await repo
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .where('a.retentionUntil IS NOT NULL AND a.retentionUntil < :now', { now })
      .orderBy('a.retentionUntil', 'ASC')
      .limit(config.batchSize)
      .getRawMany();

    if (ids.length === 0) break;

    const idList = ids.map((r) => r.id);
    const deleteResult = await repo
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      // Using IN (:...ids) for reliable list parameter expansion with TypeORM
      .where('id IN (:...ids)', { ids: idList })
      .execute();

    // Prefer actual affected row count rather than assumed ids length
    const affected = deleteResult.affected ?? ids.length;
    totalDeleted += affected;

    if (ids.length < config.batchSize) break; // no more full batches
  }

  if (totalDeleted > 0) {
    log.info('Audit log retention cleanup removed records', {
      operation: 'auditLogRetentionCleanup',
      metadata: { deleted: totalDeleted }
    });
  }
  return totalDeleted;
}
