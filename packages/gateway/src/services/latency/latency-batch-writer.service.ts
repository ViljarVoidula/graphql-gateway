import { Service as TypeDIService } from 'typedi';
import { dataSource } from '../../db/datasource';
import { log } from '../../utils/logger';
import { LatencyTrackingData } from './request-latency.service';

interface BufferedLatencyRecord extends Omit<LatencyTrackingData, 'latencyMs'> {
  latencyMs: number;
  date: string;
  hour: number;
  createdAt: Date;
}

/**
 * High-performance batch writer for latency records
 * Optimized for billions of requests per day
 */
@TypeDIService()
export class LatencyBatchWriter {
  private buffer: BufferedLatencyRecord[] = [];
  private bufferSize: number;
  private flushInterval: number;
  private flushTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private flushInProgress = false;
  private droppedRecords = 0;
  private maxMemoryMB: number;
  private circuitBreakerFailures = 0;
  private circuitBreakerThreshold = 5;
  private circuitBreakerOpen = false;
  private lastSuccessfulFlush = Date.now();

  constructor() {
    // Configuration optimized for high volume
    this.bufferSize = parseInt(process.env.LATENCY_BATCH_SIZE || '1000');
    this.flushInterval = parseInt(process.env.LATENCY_FLUSH_INTERVAL_MS || '5000'); // 5 seconds
    this.maxMemoryMB = parseInt(process.env.LATENCY_MAX_MEMORY_MB || '100');

    this.scheduleFlush();
    this.setupGracefulShutdown();
  }

  /**
   * Add record to buffer (non-blocking, optimized for hot path)
   */
  addRecord(data: LatencyTrackingData): void {
    // Circuit breaker - drop records if database is failing
    if (this.circuitBreakerOpen) {
      this.droppedRecords++;
      return;
    }

    // Memory pressure protection
    if (this.getMemoryUsageMB() > this.maxMemoryMB) {
      this.droppedRecords++;
      // Log memory pressure warning (rate limited)
      if (this.droppedRecords % 10000 === 0) {
        log.warn('Latency tracking memory pressure, dropping records', {
          droppedRecords: this.droppedRecords,
          bufferSize: this.buffer.length,
          memoryMB: this.getMemoryUsageMB()
        });
      }
      return;
    }

    const now = new Date();
    const record: BufferedLatencyRecord = {
      ...data,
      date: now.toISOString().split('T')[0], // YYYY-MM-DD
      hour: now.getUTCHours(),
      createdAt: now
    };

    this.buffer.push(record);

    // Trigger immediate flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  /**
   * Flush buffer to database (async, non-blocking)
   */
  private async flush(): Promise<void> {
    if (this.flushInProgress || this.buffer.length === 0) {
      return;
    }

    this.flushInProgress = true;
    const recordsToFlush = this.buffer.splice(0, this.bufferSize);

    try {
      const startTime = process.hrtime.bigint();

      // Use bulk insert for maximum performance
      await this.bulkInsert(recordsToFlush);

      const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000; // Convert to milliseconds

      // Reset circuit breaker on success
      this.circuitBreakerFailures = 0;
      this.circuitBreakerOpen = false;
      this.lastSuccessfulFlush = Date.now();

      log.debug('Latency batch flushed successfully', {
        recordCount: recordsToFlush.length,
        durationMs: Math.round(duration * 100) / 100,
        remainingBuffer: this.buffer.length,
        droppedRecords: this.droppedRecords
      });
    } catch (error) {
      // Circuit breaker logic
      this.circuitBreakerFailures++;
      if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
        this.circuitBreakerOpen = true;
        log.error('Latency tracking circuit breaker opened', {
          failures: this.circuitBreakerFailures,
          error
        });
      }

      log.error('Failed to flush latency batch', {
        error,
        recordCount: recordsToFlush.length,
        bufferSize: this.buffer.length,
        circuitBreakerOpen: this.circuitBreakerOpen
      });

      // Re-add failed records to front of buffer (FIFO) unless circuit breaker is open
      if (!this.circuitBreakerOpen && this.buffer.length < this.bufferSize * 2) {
        this.buffer.unshift(...recordsToFlush);
      } else {
        this.droppedRecords += recordsToFlush.length;
      }
    } finally {
      this.flushInProgress = false;
    }
  }

  /**
   * High-performance bulk insert using raw SQL
   */
  private async bulkInsert(records: BufferedLatencyRecord[]): Promise<void> {
    if (records.length === 0) return;

    // Build optimized bulk insert query
    const values = records
      .map((record, index) => {
        const paramBase = index * 15; // 15 parameters per record
        return `($${paramBase + 1}, $${paramBase + 2}, $${paramBase + 3}, $${paramBase + 4}, $${paramBase + 5}, $${paramBase + 6}, $${paramBase + 7}, $${paramBase + 8}, $${paramBase + 9}, $${paramBase + 10}, $${paramBase + 11}, $${paramBase + 12}, $${paramBase + 13}, $${paramBase + 14}, $${paramBase + 15})`;
      })
      .join(', ');

    const query = `
      INSERT INTO request_latencies (
        "serviceId", "applicationId", "userId", "operationName", "operationType",
        "latencyMs", "hasErrors", "statusCode", "ipAddress", "userAgent",
        "correlationId", "date", "hour", "authType", "createdAt"
      ) VALUES ${values}
      ON CONFLICT DO NOTHING
    `;

    // Flatten parameters for bulk insert
    const parameters = records.flatMap((record) => [
      record.serviceId,
      record.applicationId,
      record.userId || null,
      record.operationName,
      record.operationType,
      record.latencyMs,
      record.hasErrors,
      record.statusCode || (record.hasErrors ? 500 : 200),
      record.ipAddress || null,
      record.userAgent || null,
      record.correlationId || null,
      record.date,
      record.hour,
      record.authType,
      record.createdAt
    ]);

    await dataSource.query(query, parameters);
  }

  /**
   * Schedule periodic flush
   */
  private scheduleFlush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    this.flushTimeout = setTimeout(() => {
      if (!this.isShuttingDown) {
        this.flush().finally(() => this.scheduleFlush());
      }
    }, this.flushInterval);
  }

  /**
   * Graceful shutdown handling
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      log.info('Latency batch writer shutting down', { signal, bufferSize: this.buffer.length });
      this.isShuttingDown = true;

      if (this.flushTimeout) {
        clearTimeout(this.flushTimeout);
      }

      // Final flush with timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Shutdown flush timeout')), 10000);
      });

      try {
        await Promise.race([this.flush(), timeoutPromise]);
        log.info('Latency batch writer shutdown complete');
      } catch (error) {
        log.error('Latency batch writer shutdown error', { error });
      }
    };

    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Get current memory usage estimate
   */
  private getMemoryUsageMB(): number {
    // Rough estimate: each record ~500 bytes
    return (this.buffer.length * 500) / (1024 * 1024);
  }

  /**
   * Health check and metrics
   */
  getMetrics() {
    const timeSinceLastFlush = Date.now() - this.lastSuccessfulFlush;
    return {
      bufferSize: this.buffer.length,
      maxBufferSize: this.bufferSize,
      droppedRecords: this.droppedRecords,
      memoryUsageMB: this.getMemoryUsageMB(),
      maxMemoryMB: this.maxMemoryMB,
      circuitBreakerOpen: this.circuitBreakerOpen,
      circuitBreakerFailures: this.circuitBreakerFailures,
      timeSinceLastFlushMs: timeSinceLastFlush,
      flushInProgress: this.flushInProgress,
      healthy: !this.circuitBreakerOpen && timeSinceLastFlush < this.flushInterval * 3
    };
  }

  /**
   * Manual flush trigger (for testing/debugging)
   */
  async forceFlush(): Promise<void> {
    await this.flush();
  }

  /**
   * Reset circuit breaker (for recovery scenarios)
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerOpen = false;
    this.circuitBreakerFailures = 0;
    log.info('Latency tracking circuit breaker reset');
  }
}
