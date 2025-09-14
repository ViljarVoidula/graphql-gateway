# Gateway Benchmarks (k6)

This directory contains load / stress / soak test scripts for the GraphQL Gateway using [k6](https://k6.io).

## Scripts

| Script            | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `query-smoke.js`  | Lightweight smoke & baseline latency check for a simple query |
| `query-ramp.js`   | Progressive ramp-up for read-heavy workloads                  |
| `mutation-mix.js` | Mixed read/write (queries + mutations) pattern                |
| `stress-spike.js` | Sudden spike test for burst traffic resilience                |
| `soak-long.js`    | Long-running steady load to reveal leaks / degradation        |
| `utils.js`        | Shared helpers (GraphQL request, headers, randomizers)        |

## Environment Variables

| Variable      | Default                         | Description                                        |
| ------------- | ------------------------------- | -------------------------------------------------- |
| `GATEWAY_URL` | `http://localhost:4000/graphql` | GraphQL endpoint under test                        |
| `API_KEY`     | (none)                          | API key header value if required for auth          |
| `DURATION`    | test-specific                   | Override with e.g. `30s` or `10m` for some scripts |
| `VU`          | test-specific                   | Override default VUs for a script                  |
| `RAMP_MAX_VU` | 500                             | Max VUs for ramp script                            |

## Running Examples

```bash
# Smoke baseline
k6 run src/benchmarks/query-smoke.js

# Ramp test to 1k VUs
RAMP_MAX_VU=1000 k6 run src/benchmarks/query-ramp.js

# Mixed workload with API key
API_KEY=abc123 k6 run src/benchmarks/mutation-mix.js

# Spike test
k6 run src/benchmarks/stress-spike.js

# Soak test for 1 hour
DURATION=1h k6 run src/benchmarks/soak-long.js
```

## Thresholds

Each script defines thresholds for:

- `http_req_duration` (latency percentiles)
- Error rate / request count criteria
  Adjust thresholds to match SLOs as performance tuning evolves.

## Interpreting Results

- p90/p95/p99 latency: ensure under target budget (e.g., <200ms p95 for baseline read queries)
- Errors > 0.1% under moderate load may indicate rate limit misconfiguration or resource contention
- Spike resilience: ensure gateway recovers latency within a few intervals post-spike
- Soak: watch memory (external tooling) + error creep

## Extending

Add new scripts for specialized query patterns (large responses, federated joins, etc.). Use `utils.js` helpers for consistency.
