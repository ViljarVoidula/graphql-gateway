import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { dataSource } from '../../db/datasource';
import { ApplicationUsage } from '../../entities/application-usage.entity';
import { log } from '../../utils/logger';
import { meter } from '../../utils/telemetry/metrics';

@Service()
export class ApplicationUsageService {
  private repo: Repository<ApplicationUsage>;
  // In‑memory aggregated counters keyed by `${applicationId}:${serviceId}:${date}`
  private buffer: Map<
    string,
    {
      applicationId: string;
      serviceId: string;
      date: string;
      requestCount: number;
      errorCount: number;
      rateLimitExceededCount: number;
    }
  > = new Map();
  private flushIntervalHandle?: NodeJS.Timeout;
  private lastFlush = Date.now();
  private flushing = false;

  // Config (can be tuned via env)
  private readonly FLUSH_INTERVAL_MS = parseInt(process.env.USAGE_FLUSH_INTERVAL_MS || '5000', 10); // 5s
  private readonly MAX_BUFFER_KEYS = parseInt(process.env.USAGE_BUFFER_MAX_KEYS || '500', 10); // flush when this many unique keys accumulated
  private readonly MAX_ROWS_PER_INSERT = 1000; // safety cap

  constructor() {
    this.repo = dataSource.getRepository(ApplicationUsage);
    // Metrics
    this.initMetrics();
  }

  private today(): string {
    return new Date().toISOString().substring(0, 10); // YYYY-MM-DD UTC
  }

  /**
   * Buffer increments in memory; a background flusher will aggregate and persist
   * them using a single batched UPSERT per flush cycle. This reduces write
   * amplification under high QPS (hundreds of millions/day).
   */
  async increment(applicationId: string, serviceId: string, opts?: { error?: boolean; rateLimited?: boolean }) {
    const date = this.today();
    const key = `${applicationId}:${serviceId}:${date}`;
    const existing = this.buffer.get(key);
    if (existing) {
      existing.requestCount += 1;
      if (opts?.error) existing.errorCount += 1;
      if (opts?.rateLimited) existing.rateLimitExceededCount += 1;
    } else {
      this.buffer.set(key, {
        applicationId,
        serviceId,
        date,
        requestCount: 1,
        errorCount: opts?.error ? 1 : 0,
        rateLimitExceededCount: opts?.rateLimited ? 1 : 0
      });
    }

    // Heuristic flush triggers
    if (this.buffer.size >= this.MAX_BUFFER_KEYS) {
      // Fire and forget; caller path MUST NOT await heavy IO
      this.scheduleImmediateFlush();
    } else if (Date.now() - this.lastFlush > this.FLUSH_INTERVAL_MS) {
      this.scheduleImmediateFlush();
    }
  }

  /** Start periodic background flushing. Idempotent. */
  startBufferFlusher() {
    if (this.flushIntervalHandle) return;
    this.flushIntervalHandle = setInterval(
      () => {
        if (Date.now() - this.lastFlush >= this.FLUSH_INTERVAL_MS) {
          this.flush().catch((err) =>
            log.error('Usage buffer flush failed', {
              operation: 'usageFlush',
              error: err instanceof Error ? err : new Error(String(err))
            })
          );
        }
      },
      Math.min(this.FLUSH_INTERVAL_MS, 1000)
    ); // check every second (or less if custom interval <1s)
  }

  /** Force a flush (awaitable) */
  async flush(force: boolean = false) {
    if (this.flushing) return; // simple reentrancy guard
    if (!force && this.buffer.size === 0) return;
    this.flushing = true;
    const start = Date.now();
    let batch: typeof this.buffer;
    // Swap buffer quickly to minimize contention
    batch = this.buffer;
    this.buffer = new Map();
    try {
      if (batch.size === 0) return;
      const rows = Array.from(batch.values());
      // Chunk if excessively large
      for (let i = 0; i < rows.length; i += this.MAX_ROWS_PER_INSERT) {
        const slice = rows.slice(i, i + this.MAX_ROWS_PER_INSERT);
        // Build parameterized bulk upsert
        const valuesSql: string[] = [];
        const params: any[] = [];
        slice.forEach((r, idx) => {
          const base = idx * 6;
          // order: applicationId, serviceId, date, requestCount, errorCount, rateLimitExceededCount
          valuesSql.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
          params.push(r.applicationId, r.serviceId, r.date, r.requestCount, r.errorCount, r.rateLimitExceededCount);
        });
        const sql = `INSERT INTO application_usage ("applicationId","serviceId","date","requestCount","errorCount","rateLimitExceededCount") VALUES ${valuesSql.join(',')} ON CONFLICT ("applicationId","serviceId","date") DO UPDATE SET "requestCount" = application_usage."requestCount" + EXCLUDED."requestCount", "errorCount" = application_usage."errorCount" + EXCLUDED."errorCount", "rateLimitExceededCount" = application_usage."rateLimitExceededCount" + EXCLUDED."rateLimitExceededCount"`;
        await this.repo.query(sql, params);
      }
      const duration = Date.now() - start;
      log.debug('Flushed usage stats buffer', {
        operation: 'usageFlush',
        metadata: { rows: rows.length, ms: duration }
      });
      this.flushDurationHist.record(duration, { service: 'usage' } as any);
      this.flushRowsHist.record(rows.length, { service: 'usage' } as any);
    } catch (err) {
      // Requeue on failure to avoid data loss (best effort)
      const entries = Array.from(batch.entries());
      for (const [k, v] of entries) {
        const existing = this.buffer.get(k);
        if (existing) {
          existing.requestCount += v.requestCount;
          existing.errorCount += v.errorCount;
          existing.rateLimitExceededCount += v.rateLimitExceededCount;
        } else {
          this.buffer.set(k, v);
        }
      }
      log.error('Usage buffer flush error; requeued batch', {
        operation: 'usageFlush',
        error: err instanceof Error ? err : new Error(String(err)),
        metadata: { batchSize: batch.size }
      });
      this.flushFailures.add(1, { service: 'usage' } as any);
    } finally {
      this.lastFlush = Date.now();
      this.flushing = false;
    }
  }

  /** Schedule a microtask flush without blocking caller */
  private scheduleImmediateFlush() {
    setImmediate(() =>
      this.flush().catch(() => {
        /* already logged */
      })
    );
  }

  /** Stop interval & force final flush */
  async shutdown() {
    if (this.flushIntervalHandle) clearInterval(this.flushIntervalHandle);
    await this.flush(true);
  }

  // --- Metrics instrumentation ---
  private flushDurationHist = meter.createHistogram('buffer.flush.duration.ms', {
    unit: 'ms',
    description: 'Duration of buffer flush operations'
  });
  private flushRowsHist = meter.createHistogram('buffer.flush.rows', {
    description: 'Number of rows processed in a buffer flush'
  });
  private flushFailures = meter.createCounter('buffer.flush.failures', {
    description: 'Number of failed buffer flush attempts'
  });
  private bufferGauge = meter.createObservableGauge('buffer.size', {
    description: 'Current number of buffered items'
  });

  private initMetrics() {
    this.bufferGauge.addCallback((obs) => {
      obs.observe(this.buffer.size, { service: 'usage' } as any);
    });
  }
}
