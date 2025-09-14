export interface SecurityConfig {
  auditLogRetentionDays: number;
  auditLogCleanupIntervalMs: number;
  auditLogCleanupBatchSize: number;
  auditLogCleanupMaxBatches: number;
}

const DEFAULTS: SecurityConfig = {
  auditLogRetentionDays: 90,
  auditLogCleanupIntervalMs: 6 * 60 * 60 * 1000, // every 6h
  auditLogCleanupBatchSize: 500,
  auditLogCleanupMaxBatches: 10
};

export function loadSecurityConfig(env = process.env): SecurityConfig {
  const days = parseInt(env.AUDIT_LOG_RETENTION_DAYS || '', 10);
  const interval = parseInt(env.AUDIT_LOG_RETENTION_CLEANUP_INTERVAL_MS || '', 10);
  const batchSize = parseInt(env.AUDIT_LOG_RETENTION_CLEANUP_BATCH_SIZE || '', 10);
  const maxBatches = parseInt(env.AUDIT_LOG_RETENTION_CLEANUP_MAX_BATCHES || '', 10);

  return {
    auditLogRetentionDays: !isNaN(days) && days > 0 ? Math.min(days, 365 * 5) : DEFAULTS.auditLogRetentionDays,
    auditLogCleanupIntervalMs: !isNaN(interval) && interval > 60_000 ? interval : DEFAULTS.auditLogCleanupIntervalMs,
    auditLogCleanupBatchSize:
      !isNaN(batchSize) && batchSize > 0 ? Math.min(batchSize, 5000) : DEFAULTS.auditLogCleanupBatchSize,
    auditLogCleanupMaxBatches:
      !isNaN(maxBatches) && maxBatches > 0 ? Math.min(maxBatches, 100) : DEFAULTS.auditLogCleanupMaxBatches
  };
}
