# Compliance Materialized View Proposal: Session/Application Daily Usage

## Objective

Accelerate compliance and forensic queries that ask:

- Distinct operations executed per (sessionId, applicationId, date)
- Total request count, error count per (sessionId, applicationId, date)
- Quickly filter by a specific sessionId within a time window

## Source Tables

- `audit_logs` (sessionId, applicationId, createdAt, metadata->operationName, success)
- (Optionally) `application_usage` for aggregated counts without session granularity

## Proposed Materialized View

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_session_application_daily_usage AS
SELECT
  COALESCE("sessionId", '∅') AS session_id,
  COALESCE("applicationId", '∅') AS application_id,
  date_trunc('day', "createdAt")::date AS usage_date,
  COUNT(*) AS request_count,
  COUNT(*) FILTER (WHERE success = false) AS error_count,
  COUNT(DISTINCT (metadata->>'operationName')) AS distinct_operations,
  MIN("createdAt") AS first_seen_at,
  MAX("createdAt") AS last_seen_at
FROM audit_logs
WHERE eventType = 'api_request'
GROUP BY 1,2,3;
```

### Indexes on MV

```sql
CREATE INDEX IF NOT EXISTS mv_session_app_daily_usage_session_date_idx
  ON mv_session_application_daily_usage (session_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS mv_session_app_daily_usage_app_date_idx
  ON mv_session_application_daily_usage (application_id, usage_date DESC);
```

## Refresh Strategy

Options:

1. **Periodic Full Refresh** (simple):

   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_session_application_daily_usage;
   ```

   Run every 5–15 minutes via cron / job scheduler.

2. **Rolling Incremental** (advanced, future): Maintain a delta table of recent audit_logs (e.g. last 2 days) and rebuild only that slice.

## Integration Points

- GraphQL resolver for compliance dashboard can query MV first; fall back to live aggregation if MV row missing.
- Add a health metric: mv staleness = now - max(last_seen_at).

## Benefits

- Reduces heavy COUNT DISTINCT + FILTER scans over large `audit_logs` for frequent queries.
- Deterministic daily partition key (usage_date) simplifies pruning.

## Future Enhancements

- Add BRIN index on `audit_logs.createdAt` for faster time range pruning.
- Partition `audit_logs` by month to bound index bloat.
- Add column for normalized `operationType` (query/mutation/subscription) in MV.
- Track top-N operations per session using an aggregated JSON array (beware of size growth).

## Caveats

- Slight staleness between refresh cycles; document acceptable SLA (e.g. < 10m).
- `∅` placeholder allows grouping NULLs but must be handled in API layer.

## Rollout Steps

1. Add migration creating MV + indexes (optional; skipped until adopted).
2. Add background refresh task (node cron or external orchestration).
3. Implement resolver that prefers MV.
4. Instrument metrics (refresh duration, staleness).

---

Prepared as a design aid; not yet applied as a migration.
