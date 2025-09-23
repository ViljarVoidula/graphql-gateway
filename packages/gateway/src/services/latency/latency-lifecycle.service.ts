import { Container, Service as TypeDIService } from 'typedi';
import { dataSource } from '../../db/datasource';
import { log } from '../../utils/logger';
import { ConfigurationService } from '../config/configuration.service';

interface RetentionPolicy {
  retentionDays: number; // Managed by ConfigurationService (shared with audit log retention)
  archivalEnabled: boolean;
  compressionEnabled: boolean;
  partitioningEnabled: boolean;
}

interface CleanupStats {
  recordsDeleted: number;
  recordsArchived: number;
  partitionsCreated: number;
  durationMs: number;
  nextCleanupAt: Date;
}

/**
 * High-performance data lifecycle management for billion-request scale
 * Handles retention, archival, partitioning, and cleanup of latency data
 *
 * Retention period is synchronized with the global audit log retention setting
 * from ConfigurationService to maintain consistent data lifecycle policies.
 */
@TypeDIService()
export class LatencyDataLifecycleService {
  private policy: RetentionPolicy;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastCleanup: Date | null = null;
  private stats: CleanupStats | null = null;

  constructor() {
    this.policy = {
      retentionDays: 90, // Will be updated from configuration service
      archivalEnabled: process.env.LATENCY_ARCHIVAL_ENABLED === 'true',
      compressionEnabled: process.env.LATENCY_COMPRESSION_ENABLED === 'true',
      partitioningEnabled: process.env.LATENCY_PARTITIONING_ENABLED === 'true'
    };

    this.initializePolicy();
    this.scheduleCleanup();
    log.info('Latency data lifecycle service initialized', { policy: this.policy });
  }

  /**
   * Initialize retention policy from configuration service
   */
  private async initializePolicy(): Promise<void> {
    try {
      const configService = Container.get(ConfigurationService);
      this.policy.retentionDays = await configService.getAuditLogRetentionDays();
      log.info('Updated latency retention policy from gateway settings', {
        retentionDays: this.policy.retentionDays
      });
    } catch (error) {
      log.warn('Failed to load retention policy from configuration service, using default', {
        error,
        defaultRetentionDays: this.policy.retentionDays
      });
    }
  }

  /**
   * Initialize database optimizations for high-volume operation
   */
  async initializeOptimizations(): Promise<void> {
    try {
      if (this.policy.partitioningEnabled) {
        await this.createPartitions();
      }

      if (this.policy.compressionEnabled) {
        await this.enableCompression();
      }

      await this.optimizeIndexes();

      log.info('Database optimizations applied for latency tracking');
    } catch (error) {
      log.error('Failed to apply database optimizations', { error });
    }
  }

  /**
   * Create time-based partitions for efficient querying and maintenance
   */
  private async createPartitions(): Promise<void> {
    const today = new Date();
    const partitionsToCreate = 30; // Create 30 days of future partitions

    for (let i = 0; i < partitionsToCreate; i++) {
      const partitionDate = new Date(today);
      partitionDate.setDate(today.getDate() + i);
      const dateStr = partitionDate.toISOString().split('T')[0];
      const partitionName = `request_latencies_${dateStr.replace(/-/g, '_')}`;

      try {
        // Check if partition already exists
        const existsResult = await dataSource.query(
          `
          SELECT 1 FROM pg_class WHERE relname = $1
        `,
          [partitionName]
        );

        if (existsResult.length === 0) {
          // Create partition
          await dataSource.query(`
            CREATE TABLE IF NOT EXISTS ${partitionName} PARTITION OF request_latencies
            FOR VALUES FROM ('${dateStr}') TO ('${this.getNextDay(dateStr)}');
          `);

          // Create indexes on partition
          await dataSource.query(`
            CREATE INDEX IF NOT EXISTS ${partitionName}_service_id_idx 
            ON ${partitionName} ("serviceId");
          `);

          await dataSource.query(`
            CREATE INDEX IF NOT EXISTS ${partitionName}_application_id_idx 
            ON ${partitionName} ("applicationId");
          `);

          await dataSource.query(`
            CREATE INDEX IF NOT EXISTS ${partitionName}_latency_ms_idx 
            ON ${partitionName} ("latencyMs") WHERE "latencyMs" > 1000;
          `);

          log.debug('Created partition', { partitionName, date: dateStr });
        }
      } catch (error) {
        log.warn('Failed to create partition', { partitionName, error });
      }
    }
  }

  /**
   * Enable compression on older partitions to save storage
   */
  private async enableCompression(): Promise<void> {
    try {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 7); // Compress partitions older than 7 days

      const partitionQuery = `
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'request_latencies_%'
        AND tablename < 'request_latencies_${oldDate.toISOString().split('T')[0].replace(/-/g, '_')}'
      `;

      const partitions = await dataSource.query(partitionQuery);

      for (const partition of partitions) {
        try {
          // Enable compression using pg_stat_statements if available
          await dataSource.query(`
            ALTER TABLE ${partition.tablename} SET (toast_tuple_target = 128);
          `);
        } catch (error) {
          log.debug('Compression not available or already enabled', {
            partition: partition.tablename,
            error
          });
        }
      }
    } catch (error) {
      log.warn('Failed to enable compression', { error });
    }
  }

  /**
   * Optimize indexes for query performance
   */
  private async optimizeIndexes(): Promise<void> {
    try {
      // Create composite indexes for common query patterns
      await dataSource.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS request_latencies_perf_analysis 
        ON request_latencies ("serviceId", "date", "latencyMs") 
        WHERE "latencyMs" > 500;
      `);

      await dataSource.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS request_latencies_error_analysis 
        ON request_latencies ("applicationId", "date", "hasErrors") 
        WHERE "hasErrors" = true;
      `);

      await dataSource.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS request_latencies_operation_analysis 
        ON request_latencies ("operationName", "date", "latencyMs");
      `);

      // Update table statistics
      await dataSource.query(`ANALYZE request_latencies;`);
    } catch (error) {
      log.warn('Failed to optimize indexes', { error });
    }
  }

  /**
   * Perform data cleanup based on retention policy
   */
  async performCleanup(): Promise<CleanupStats> {
    if (this.isRunning) {
      throw new Error('Cleanup already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();
    let recordsDeleted = 0;
    let recordsArchived = 0;
    let partitionsCreated = 0;

    try {
      // Refresh retention policy from configuration service
      await this.initializePolicy();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.policy.retentionDays);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      log.info('Starting latency data cleanup', {
        cutoffDate: cutoffDateStr,
        policy: this.policy
      });

      // Archive data if enabled
      if (this.policy.archivalEnabled) {
        recordsArchived = await this.archiveOldData(cutoffDateStr);
      }

      // Delete old data
      recordsDeleted = await this.deleteOldData(cutoffDateStr);

      // Create new partitions
      if (this.policy.partitioningEnabled) {
        await this.createPartitions();
        partitionsCreated = 1; // Simplified for now
      }

      // Update statistics
      await dataSource.query(`ANALYZE request_latencies;`);

      const duration = Date.now() - startTime;
      const nextCleanup = new Date();
      nextCleanup.setHours(nextCleanup.getHours() + 24); // Next cleanup in 24 hours

      this.stats = {
        recordsDeleted,
        recordsArchived,
        partitionsCreated,
        durationMs: duration,
        nextCleanupAt: nextCleanup
      };

      this.lastCleanup = new Date();

      log.info('Latency data cleanup completed', this.stats);
      return this.stats;
    } catch (error) {
      log.error('Latency data cleanup failed', { error });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Archive old data to separate table or external storage
   */
  private async archiveOldData(cutoffDate: string): Promise<number> {
    try {
      // Create archive table if not exists
      await dataSource.query(`
        CREATE TABLE IF NOT EXISTS request_latencies_archive (
          LIKE request_latencies INCLUDING ALL
        );
      `);

      // Move old data to archive
      const result = await dataSource.query(
        `
        WITH moved AS (
          DELETE FROM request_latencies 
          WHERE date < $1 
          RETURNING *
        )
        INSERT INTO request_latencies_archive 
        SELECT * FROM moved;
      `,
        [cutoffDate]
      );

      const archivedCount = result[1]?.length || 0; // Second element contains INSERT result

      log.info('Data archived', { archivedCount, cutoffDate });
      return archivedCount;
    } catch (error) {
      log.error('Failed to archive data', { error, cutoffDate });
      return 0;
    }
  }

  /**
   * Delete old data beyond retention period
   */
  private async deleteOldData(cutoffDate: string): Promise<number> {
    try {
      // Batch delete to avoid long-running transactions
      const batchSize = 100000;
      let totalDeleted = 0;

      while (true) {
        const result = await dataSource.query(
          `
          DELETE FROM request_latencies 
          WHERE date < $1 
          AND id IN (
            SELECT id FROM request_latencies 
            WHERE date < $1 
            LIMIT $2
          );
        `,
          [cutoffDate, batchSize]
        );

        const deletedCount = result[1] || 0;
        totalDeleted += deletedCount;

        if (deletedCount < batchSize) {
          break; // No more records to delete
        }

        // Small delay to avoid overwhelming the database
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      log.info('Old data deleted', { deletedCount: totalDeleted, cutoffDate });
      return totalDeleted;
    } catch (error) {
      log.error('Failed to delete old data', { error, cutoffDate });
      return 0;
    }
  }

  /**
   * Schedule automatic cleanup
   */
  private scheduleCleanup(): void {
    const interval = 24 * 60 * 60 * 1000; // 24 hours

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        log.error('Scheduled cleanup failed', { error });
      }
    }, interval);

    // Run initial cleanup after 1 hour
    setTimeout(
      async () => {
        try {
          await this.performCleanup();
        } catch (error) {
          log.error('Initial cleanup failed', { error });
        }
      },
      60 * 60 * 1000
    );
  }

  /**
   * Get cleanup statistics and health metrics
   */
  getStats(): CleanupStats | null {
    return this.stats;
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const now = new Date();
    const lastCleanupAge = this.lastCleanup ? now.getTime() - this.lastCleanup.getTime() : null;

    return {
      isRunning: this.isRunning,
      lastCleanup: this.lastCleanup,
      lastCleanupAgeHours: lastCleanupAge ? lastCleanupAge / (1000 * 60 * 60) : null,
      policy: this.policy,
      stats: this.stats,
      healthy: !this.isRunning && (lastCleanupAge === null || lastCleanupAge < 2 * 24 * 60 * 60 * 1000) // Within 2 days
    };
  }

  /**
   * Manually trigger cleanup (for maintenance)
   */
  async triggerCleanup(): Promise<CleanupStats> {
    return this.performCleanup();
  }

  /**
   * Update retention policy
   */
  updatePolicy(newPolicy: Partial<RetentionPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
    log.info('Retention policy updated', { policy: this.policy });
  }

  /**
   * Refresh retention policy from configuration service
   */
  async refreshPolicy(): Promise<void> {
    await this.initializePolicy();
  }

  /**
   * Shutdown cleanup scheduler
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    log.info('Latency data lifecycle service shutdown');
  }

  /**
   * Helper function to get next day string
   */
  private getNextDay(dateStr: string): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }
}
