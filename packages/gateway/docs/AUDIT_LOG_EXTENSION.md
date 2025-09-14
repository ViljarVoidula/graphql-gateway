# Extended Audit Log Fields

The `audit_logs` table and `AuditLog` entity were extended to support SOC2/ISO style security and compliance auditing.

## New Columns

| Column         | Type                   | Purpose                                                                       |
| -------------- | ---------------------- | ----------------------------------------------------------------------------- |
| category       | text (enum in GraphQL) | Logical category (authentication, authorization, security, etc.)              |
| severity       | text (enum in GraphQL) | Risk/impact level (info, low, medium, high, critical)                         |
| action         | varchar(64)            | Normalized verb (login, create, delete, rotate, revoke) for simpler analytics |
| success        | boolean                | Whether the action succeeded                                                  |
| ipAddress      | varchar(45)            | Request origin IP (IPv4/IPv6)                                                 |
| userAgent      | text                   | Raw user agent string                                                         |
| sessionId      | uuid                   | Associated session identifier (if applicable)                                 |
| correlationId  | varchar(64)            | Correlates multi-step operations / spans                                      |
| resourceType   | varchar(64)            | Domain resource type (user, application, api_key, service)                    |
| resourceId     | varchar(128)           | Identifier of the affected resource                                           |
| riskScore      | smallint               | 0–100 heuristic score for alerting and anomaly detection                      |
| retentionUntil | timestamptz            | Pre-computed timestamp when record becomes eligible for purge                 |
| tags           | text[]                 | Flexible labels for ad-hoc classification/filtering                           |

All new columns are nullable for backward compatibility.

## GraphQL

`AuditCategory` and `AuditSeverity` enums exposed. Queries now accept optional `category` and `severity` filters:

```
query AppAudit($id: ID!, $cat: AuditCategory, $sev: AuditSeverity) {
  applicationAuditLogs(applicationId: $id, category: $cat, severity: $sev) { id eventType category severity action success }
}
```

User-focused query:

```
query UserAudit($userId: ID!, $cat: AuditCategory, $sev: AuditSeverity){
  userAuditLogs(userId: $userId, category: $cat, severity: $sev){
    id eventType category severity action success correlationId createdAt
  }
}
```

## Retention

Audit log retention is now a **runtime setting** configurable from the Admin UI (Settings → Audit Log Retention). Default is **90 days** and can be set between **1 and 1825 days (5 years)**. Each log gets `retentionUntil = now() + retentionDays`. The cleanup task periodically deletes expired rows. If no setting has been stored yet, the system will fallback to the legacy `AUDIT_LOG_RETENTION_DAYS` environment variable (one-time bootstrap) or default to 90.

Manual SQL illustration (the automated job handles this):

```
DELETE FROM audit_logs WHERE retentionUntil < now();
```

### Automated Cleanup

The gateway now runs an automatic retention cleanup job.

Environment variables (still env-based for operational cadence, may be moved to runtime config later):

- `AUDIT_LOG_RETENTION_CLEANUP_INTERVAL_MS` (default 21600000 / 6h)
- `AUDIT_LOG_RETENTION_CLEANUP_BATCH_SIZE` (default 500, max 5000)
- `AUDIT_LOG_RETENTION_CLEANUP_MAX_BATCHES` (default 10, max 100 per run)

Behavior: every interval it deletes up to `batchSize * maxBatches` expired rows in chunks to avoid table locks.

## Service Helper

`AuditLogService.log` now accepts extended parameters and auto-generates a `correlationId` if missing and calculates `retentionUntil`.

## Indexes Added

Indexes on: category, severity, action, sessionId, correlationId, resourceType, resourceId, riskScore, retentionUntil.

## Next Steps

- Add scheduled retention cleanup job
- Optionally push high `riskScore` events to alerting/metrics
- Extend UI to surface filters for category & severity and show correlationId
  - (DONE) Category & severity filters added, correlationId abbreviated in UI.
