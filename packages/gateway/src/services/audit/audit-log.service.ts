import { randomUUID } from 'crypto';
import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { loadSecurityConfig } from '../../config/security.config';
import { dataSource } from '../../db/datasource';
import { AuditCategory, AuditEventType, AuditLog, AuditSeverity } from '../../entities/audit-log.entity';
import { log } from '../../utils/logger';
import { meter } from '../../utils/telemetry/metrics';
import { ConfigurationService } from '../config/configuration.service';

@Service()
export class AuditLogService {
  private repo: Repository<AuditLog>;
  // Buffer now stores an explicit id so we can return it immediately (tests expect id)
  private buffer: Omit<AuditLog, 'createdAt'>[] = [];
  private flushing = false;
  private flushIntervalHandle?: NodeJS.Timeout;
  private lastFlush = Date.now();
  private readonly MAX_BUFFER = parseInt(process.env.AUDIT_BUFFER_MAX || '1000', 10);
  private readonly FLUSH_INTERVAL_MS = parseInt(process.env.AUDIT_FLUSH_INTERVAL_MS || '5000', 10);
  private readonly MAX_ROWS_PER_INSERT = 1000;

  constructor() {
    this.repo = dataSource.getRepository(AuditLog);
    this.initMetrics();
  }

  async log(
    eventType: AuditEventType,
    opts: {
      applicationId?: string;
      userId?: string;
      sessionId?: string; // may be a uuid or opaque session token
      metadata?: Record<string, any>;
      category?: AuditCategory;
      severity?: AuditSeverity;
      action?: string;
      success?: boolean;
      ipAddress?: string;
      userAgent?: string;
      resourceType?: string;
      resourceId?: string;
      riskScore?: number;
      correlationId?: string;
      tags?: string[];
    }
  ) {
    // Prefer runtime value if available
    let retentionDays: number;
    try {
      const cfg = new ConfigurationService();
      retentionDays = await cfg.getAuditLogRetentionDays();
    } catch {
      const security = loadSecurityConfig();
      retentionDays = security.auditLogRetentionDays;
    }
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    const id = randomUUID();
    const correlationId = opts.correlationId || randomUUID();
    // Buffer instead of immediate save
    this.buffer.push({
      id,
      eventType,
      applicationId: opts.applicationId,
      userId: opts.userId,
      sessionId: opts.sessionId,
      metadata: opts.metadata || {},
      category: opts.category,
      severity: opts.severity,
      action: opts.action,
      success: opts.success,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      riskScore: opts.riskScore,
      correlationId,
      retentionUntil,
      tags: opts.tags
    });

    if (this.buffer.length >= this.MAX_BUFFER) {
      this.scheduleImmediateFlush();
    } else if (Date.now() - this.lastFlush > this.FLUSH_INTERVAL_MS) {
      this.scheduleImmediateFlush();
    }
    // Return minimal shape expected by tests (id + correlationId)
    return { id, correlationId } as const;
  }

  /**
   * Convenience helper for standardized API request audit logging.
   * Derives severity & riskScore heuristically from HTTP status, latency and failure context.
   */
  async logApiRequest(params: {
    applicationId?: string;
    userId?: string;
    sessionId?: string;
    correlationId?: string;
    serviceId?: string; // mapped internal service id
    serviceName?: string;
    operationName?: string;
    httpMethod?: string;
    statusCode?: number;
    latencyMs?: number;
    cacheHit?: boolean;
    rateLimitRemaining?: number;
    rateLimitLimit?: number;
    ipAddress?: string;
    userAgent?: string;
    errorClass?: string;
    errorMessage?: string;
    variablesSize?: number; // bytes or length after JSON.stringify
    truncatedVariables?: boolean;
    success?: boolean; // caller may override, defaults to statusCode 2xx/3xx
    tags?: string[];
    extraMetadata?: Record<string, any>;
  }) {
    const {
      applicationId,
      userId,
      sessionId,
      correlationId,
      serviceId,
      serviceName,
      operationName,
      httpMethod,
      statusCode,
      latencyMs,
      cacheHit,
      rateLimitRemaining,
      rateLimitLimit,
      ipAddress,
      userAgent,
      errorClass,
      errorMessage,
      variablesSize,
      truncatedVariables,
      success,
      tags,
      extraMetadata
    } = params;

    // Determine success if not explicitly provided
    const derivedSuccess = typeof success === 'boolean' ? success : !!statusCode && statusCode < 400;

    // Severity heuristics
    let severity: AuditSeverity = AuditSeverity.INFO;
    if (statusCode) {
      if (statusCode >= 500) severity = AuditSeverity.HIGH;
      else if (statusCode === 401 || statusCode === 403) severity = AuditSeverity.MEDIUM;
      else if (statusCode >= 400) severity = AuditSeverity.LOW;
    }

    // Escalate based on latency (simple heuristic: >2s MEDIUM, >5s HIGH if already not HIGH)
    if (latencyMs !== undefined) {
      if (latencyMs > 5000 && severity !== AuditSeverity.HIGH) severity = AuditSeverity.HIGH;
      else if (latencyMs > 2000 && severity === AuditSeverity.INFO) severity = AuditSeverity.MEDIUM;
    }

    // Risk score baseline
    let riskScore = 10;
    if (!derivedSuccess) riskScore += 20;
    if (statusCode) {
      if (statusCode >= 500) riskScore += 30;
      else if (statusCode === 401 || statusCode === 403) riskScore += 25;
      else if (statusCode >= 400) riskScore += 10;
    }
    if (latencyMs && latencyMs > 2000) riskScore += 15;
    if (latencyMs && latencyMs > 5000) riskScore += 15; // cumulative for very slow
    if (rateLimitRemaining !== undefined && rateLimitLimit) {
      const remainingPct = rateLimitRemaining / rateLimitLimit;
      if (remainingPct < 0.05) riskScore += 10;
      else if (remainingPct < 0.1) riskScore += 5;
    }
    if (errorClass) riskScore += 5;
    if (riskScore > 100) riskScore = 100;

    const metadata: Record<string, any> = {
      serviceId,
      serviceName,
      operationName,
      http: { method: httpMethod, status: statusCode, latencyMs },
      cache: cacheHit !== undefined ? { hit: cacheHit } : undefined,
      rateLimit: rateLimitLimit !== undefined ? { remaining: rateLimitRemaining, limit: rateLimitLimit } : undefined,
      error: errorClass ? { class: errorClass, message: errorMessage } : undefined,
      variables: variablesSize !== undefined ? { size: variablesSize, truncated: truncatedVariables } : undefined,
      ...extraMetadata
    };
    // Remove undefined nests to keep row compact
    Object.keys(metadata).forEach((k) => (metadata[k] === undefined ? delete metadata[k] : null));

    await this.log(AuditEventType.API_REQUEST, {
      applicationId,
      userId,
      sessionId,
      correlationId,
      metadata,
      category: AuditCategory.SECURITY,
      severity,
      action: 'proxy_request',
      success: derivedSuccess,
      ipAddress,
      userAgent,
      resourceType: 'service',
      resourceId: serviceId,
      riskScore,
      tags
    });
    // Return heuristics for caller/tests
    return { severity, riskScore };
  }

  /** Start periodic flush loop */
  startBufferFlusher() {
    if (this.flushIntervalHandle) return;
    this.flushIntervalHandle = setInterval(
      () => {
        if (Date.now() - this.lastFlush >= this.FLUSH_INTERVAL_MS) {
          this.flush().catch((err) =>
            log.error('Audit log buffer flush failed', {
              operation: 'auditFlush',
              error: err instanceof Error ? err : new Error(String(err))
            })
          );
        }
      },
      Math.min(this.FLUSH_INTERVAL_MS, 1000)
    );
  }

  async flush(force: boolean = false) {
    if (this.flushing) return;
    if (!force && this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer;
    this.buffer = [];
    const start = Date.now();
    try {
      if (batch.length === 0) return;
      // Chunk & bulk insert
      for (let i = 0; i < batch.length; i += this.MAX_ROWS_PER_INSERT) {
        const slice = batch.slice(i, i + this.MAX_ROWS_PER_INSERT);
        // Build multi-values insert (let Postgres default UUID & createdAt). Use jsonb for metadata.
        const columns = [
          '"id"',
          '"eventType"',
          '"applicationId"',
          '"userId"',
          '"sessionId"',
          '"metadata"',
          '"category"',
          '"severity"',
          '"action"',
          '"success"',
          '"ipAddress"',
          '"userAgent"',
          '"resourceType"',
          '"resourceId"',
          '"riskScore"',
          '"correlationId"',
          '"retentionUntil"',
          '"tags"'
        ];
        const valuesSql: string[] = [];
        const params: any[] = [];
        slice.forEach((row, idx) => {
          const base = idx * columns.length;
          valuesSql.push(`(${columns.map((_, cIdx) => `$${base + cIdx + 1}`).join(',')})`);
          params.push(
            row.id,
            row.eventType,
            row.applicationId ?? null,
            row.userId ?? null,
            row.sessionId ?? null,
            JSON.stringify(row.metadata || {}),
            row.category ?? null,
            row.severity ?? null,
            row.action ?? null,
            row.success ?? null,
            row.ipAddress ?? null,
            row.userAgent ?? null,
            row.resourceType ?? null,
            row.resourceId ?? null,
            row.riskScore ?? null,
            row.correlationId ?? null,
            row.retentionUntil ?? null,
            row.tags ? JSON.stringify(row.tags) : null
          );
        });
        const sql = `INSERT INTO audit_logs (${columns.join(',')}) VALUES ${valuesSql.join(',')}`;
        await this.repo.query(sql, params);
      }
      log.debug('Flushed audit log buffer', {
        operation: 'auditFlush',
        metadata: { rows: batch.length, ms: Date.now() - start }
      });
      this.flushDurationHist.record(Date.now() - start, { service: 'audit' } as any);
      this.flushRowsHist.record(batch.length, { service: 'audit' } as any);
    } catch (err) {
      // Requeue to avoid data loss
      this.buffer.unshift(...batch);
      log.error('Audit log buffer flush error; requeued batch', {
        operation: 'auditFlush',
        error: err instanceof Error ? err : new Error(String(err)),
        metadata: { batchSize: batch.length }
      });
      this.flushFailures.add(1, { service: 'audit' } as any);
    } finally {
      this.lastFlush = Date.now();
      this.flushing = false;
    }
  }

  private scheduleImmediateFlush() {
    setImmediate(() =>
      this.flush().catch(() => {
        /* logged already */
      })
    );
  }

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
      obs.observe(this.buffer.length, { service: 'audit' } as any);
    });
  }
}
