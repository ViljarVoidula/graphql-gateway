# Request Latency Tracking

The GraphQL Gateway now includes comprehensive request latency tracking to help identify slow-performing services and overloaded applications/users. This system provides both database storage for detailed analysis and real-time metrics for monitoring.

## Features

- **Request Duration Tracking**: Captures precise timing for every GraphQL operation
- **Service Attribution**: Tracks which service/resolver is responsible for latency
- **Application & User Granularity**: Enables analysis by application and user
- **Error Correlation**: Links latency data with error occurrences
- **OpenTelemetry Integration**: Exports metrics to observability platforms
- **Performance Analytics**: Pre-built queries for common performance analysis patterns

## Database Schema

The `request_latencies` table stores detailed timing information:

```sql
-- Key fields
serviceId          -- Which service processed the request
applicationId      -- Which application made the request
userId             -- Which user (if session auth)
operationName      -- GraphQL operation name
operationType      -- query, mutation, subscription
latencyMs          -- Duration in milliseconds
hasErrors          -- Whether request had errors
date/hour          -- Time buckets for analysis

-- Additional context
ipAddress          -- Client IP for geographic analysis
userAgent          -- Client type analysis
correlationId      -- Request tracing
requestSizeBytes   -- Request payload size
responseSizeBytes  -- Response payload size
authType          -- Authentication method used
```

## Configuration

Environment variables to control latency tracking:

```bash
# Enable/disable latency tracking (default: true)
LATENCY_TRACKING_ENABLED=true

# Sample rate (0.0-1.0, default: 1.0 for 100%)
LATENCY_TRACKING_SAMPLE_RATE=0.1

# Maximum latency to record in ms (default: 300000 = 5 minutes)
LATENCY_TRACKING_MAX_MS=60000
```

## GraphQL Queries

### Get Overall Latency Metrics

```graphql
query LatencyOverview {
  latencyMetrics {
    averageLatency
    p50Latency
    p90Latency
    p95Latency
    p99Latency
    totalRequests
    errorRate
  }
}
```

### Find Slowest Services

```graphql
query SlowestServices {
  slowestServices(limit: 10) {
    serviceId
    serviceName
    averageLatency
    p95Latency
    totalRequests
    errorRate
  }
}
```

### Find Most Active Applications

```graphql
query MostActiveApps {
  mostActiveApplications(limit: 10) {
    applicationId
    applicationName
    totalRequests
    averageLatency
    p95Latency
    errorRate
  }
}
```

### Find Slowest Operations

```graphql
query SlowestOperations {
  slowestOperations(limit: 20) {
    operationName
    operationType
    serviceId
    serviceName
    averageLatency
    p95Latency
    totalRequests
    errorRate
  }
}
```

### Get Latency Trends

```graphql
query LatencyTrends {
  latencyTrends {
    date
    hour
    averageLatency
    p95Latency
    totalRequests
    errorRate
  }
}
```

### Filtered Analysis

All queries support filters for targeted analysis:

```graphql
query FilteredLatencyAnalysis {
  latencyMetrics(
    filters: {
      startDate: "2025-09-16"
      endDate: "2025-09-23"
      serviceIds: ["service-uuid-1", "service-uuid-2"]
      applicationIds: ["app-uuid-1"]
      hasErrors: false
      minLatency: 1000 # Only requests > 1 second
      operationTypes: ["query", "mutation"]
      authTypes: ["api-key"]
    }
  ) {
    averageLatency
    p95Latency
    totalRequests
  }
}
```

## OpenTelemetry Metrics

The system exports these metrics to your observability platform:

- `graphql_request_duration_ms` - Histogram of request latencies
- `graphql_requests_total` - Counter of total requests by service/app/operation
- `graphql_request_errors_total` - Counter of error requests
- `graphql_active_requests` - Gauge of currently active requests
- `graphql_request_size_bytes` - Histogram of request payload sizes
- `graphql_response_size_bytes` - Histogram of response payload sizes

Metrics include labels for:

- `service_id`, `service_name`
- `application_id`, `application_name`
- `operation_name`, `operation_type`
- `auth_type`, `status_code`

## Performance Analysis Queries

### Find Applications with High Error Rates

```sql
SELECT
  a.name as application_name,
  COUNT(*) as total_requests,
  ROUND(AVG(CASE WHEN rl.hasErrors THEN 1.0 ELSE 0.0 END) * 100, 2) as error_rate,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.latencyMs) as p95_latency
FROM request_latencies rl
JOIN applications a ON a.id = rl.applicationId
WHERE rl.date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY a.id, a.name
HAVING AVG(CASE WHEN rl.hasErrors THEN 1.0 ELSE 0.0 END) > 0.05
ORDER BY error_rate DESC;
```

### Find Peak Traffic Hours

```sql
SELECT
  date,
  hour,
  COUNT(*) as request_count,
  AVG(latencyMs) as avg_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latencyMs) as p95_latency
FROM request_latencies
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY date, hour
ORDER BY request_count DESC
LIMIT 24;
```

### Find Users Causing High Load

```sql
SELECT
  u.email,
  COUNT(*) as request_count,
  AVG(rl.latencyMs) as avg_latency,
  SUM(CASE WHEN rl.hasErrors THEN 1 ELSE 0 END) as error_count
FROM request_latencies rl
JOIN "user" u ON u.id = rl.userId
WHERE rl.date >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY u.id, u.email
HAVING COUNT(*) > 1000
ORDER BY request_count DESC;
```

## Monitoring & Alerting

### Recommended Alerts

1. **High Latency Alert**: P95 latency > 2 seconds for 5 minutes
2. **Error Rate Alert**: Error rate > 5% for any service over 10 minutes
3. **High Volume Alert**: Request rate > 1000 req/min for any application
4. **Service Degradation**: P95 latency increased by 50% compared to previous hour

### Dashboard Panels

1. **Latency Overview**: P50, P95, P99 trends over time
2. **Service Performance**: Average latency by service with error rates
3. **Application Activity**: Request volume and performance by application
4. **Operations Breakdown**: Slowest operations across all services
5. **Error Analysis**: Error rates by service, application, and operation type

## Database Maintenance

The `request_latencies` table will grow quickly in high-traffic environments. Consider:

1. **Partitioning**: Partition by date for better query performance
2. **Retention**: Automatically delete data older than needed (e.g., 90 days)
3. **Archival**: Move old data to cold storage for compliance
4. **Indexing**: Monitor query patterns and add indexes as needed

Example retention query:

```sql
DELETE FROM request_latencies
WHERE date < CURRENT_DATE - INTERVAL '90 days';
```

## Integration with Existing Systems

The latency tracking integrates seamlessly with existing gateway features:

- **Audit Logs**: Request latencies are correlated with audit log entries via `correlationId`
- **Usage Tracking**: Complements existing `application_usage` metrics
- **Rate Limiting**: Latency spikes can indicate rate limit effectiveness
- **API Key Management**: Per-API-key performance analysis available

## Troubleshooting

### Common Issues

1. **High Memory Usage**: Reduce sample rate or increase `maxLatencyMs` threshold
2. **Database Performance**: Ensure proper indexing on frequently queried columns
3. **Missing Data**: Check that middleware is properly configured and services are registered
4. **Inaccurate Timings**: Verify system clock synchronization across services

### Debug Queries

Check if tracking is working:

```sql
SELECT COUNT(*), MIN(createdAt), MAX(createdAt)
FROM request_latencies;
```

Check service distribution:

```sql
SELECT s.name, COUNT(*) as request_count
FROM request_latencies rl
JOIN services s ON s.id = rl.serviceId
GROUP BY s.id, s.name
ORDER BY request_count DESC;
```

The latency tracking system provides comprehensive visibility into your GraphQL Gateway's performance, enabling you to quickly identify and resolve performance bottlenecks.
