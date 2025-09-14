# Application Rate Limiting, Usage Metering & Audit Logging

## Overview

The gateway now supports:

- Per-application rate limits (per-minute & per-day) with ability to disable.
- Daily usage aggregation per application + service (`application_usage` table).
- Audit logging of security & lifecycle events (`audit_logs` table).

## Application Fields

New fields on `Application`:

- `rateLimitPerMinute: Int` (nullable – unlimited when null)
- `rateLimitPerDay: Int` (nullable – unlimited when null)
- `rateLimitDisabled: Boolean` (disables enforcement when true)

## Audit Events

Event types captured:

- `api_request`
- `user_login`
- `application_created`
- `rate_limit_exceeded`
- `api_key_created`
- `api_key_revoked`

Each record stores optional `applicationId`, `userId`, and `metadata` JSON.

## Usage Aggregation

Table `application_usage` keeps one row per (application, service, date UTC).
Columns: `requestCount`, `errorCount`, `rateLimitExceededCount`.

## GraphQL Additions

Queries:

```
query ApplicationUsage($app: String!, $from: String, $to: String) {
  applicationUsage(applicationId: $app, from: $from, to: $to) {
    date
    serviceId
    requestCount
    errorCount
    rateLimitExceededCount
  }
}

query AuditLogs($app: String) {
  auditLogs(applicationId: $app) { id eventType createdAt metadata }
}
```

Set or update rate limits (admin only):

```
mutation {
  updateApplicationRateLimits(applicationId:"app-id", perMinute:120, perDay:50000, disabled:false) {
    id
    rateLimitPerMinute
    rateLimitPerDay
    rateLimitDisabled
  }
}
```

## Rate Limit Enforcement

A Redis-backed middleware increments counters. When a limit is exceeded an error is returned with code:

- `RATE_LIMIT_MINUTE_EXCEEDED`
- `RATE_LIMIT_DAY_EXCEEDED`

An audit event `rate_limit_exceeded` is also written.

Response headers expose remaining quota when available:

```
X-RateLimit-Remaining-Minute: <int>
X-RateLimit-Remaining-Day: <int>
```

## Extending

- Add per-service limits by introducing a join table `application_service_limits`.
- Export metrics to Prometheus by emitting counters inside the middleware.
- Add retention policy (e.g. scheduled job to prune `audit_logs` older than N days).

## Operations

Migration file: `1756830683394-AddRateLimitAndAudit.ts`.

## Caveats

- Ensure Redis client provided to rate limit plugin (wire in `gateway.ts`).
- Service ID attribution in `hmacExecutor` currently expects `context.serviceId`; adapt extraction logic as needed.
