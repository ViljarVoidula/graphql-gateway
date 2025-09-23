# Gateway Benchmarks (k6)

This directory contains load / stress / soak test scripts for the GraphQL Gateway using [k6](https://k6.io).

## Scripts

| Script                | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `query-smoke.js`      | Lightweight smoke & baseline latency check for a simple query             |
| `query-ramp.js`       | Progressive ramp-up for read-heavy workloads                              |
| `mutation-mix.js`     | Mixed read/write (queries + mutations) pattern                            |
| `stress-spike.js`     | Sudden spike test for burst traffic resilience                            |
| `soak-long.js`        | Long-running steady load to reveal leaks / degradation                    |
| `search-faceted.js`   | Adaptive faceted product search (modes, facets, filters, schema fallback) |
| `embeddings-batch.js` | Text embedding + query embedding mixture benchmark                        |
| `utils.js`            | Shared helpers (GraphQL request, headers, randomizers)                    |

## Environment Variables

| Variable      | Default                                                                | Description                                           |
| ------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `GATEWAY_URL` | `http://localhost:4000/graphql`                                        | GraphQL endpoint under test                           |
| `API_KEY`     | `app_d77aa741018569d1e3bd61f61b388dab21ab4973f534770d932631e150fa5ea0` | API key header value for authentication (`X-API-Key`) |
| `DURATION`    | test-specific                                                          | Override with e.g. `30s` or `10m` for some scripts    |
| `VU`          | test-specific                                                          | Override default VUs for a script                     |
| `RAMP_MAX_VU` | 500                                                                    | Max VUs for ramp script                               |

## Running Examples

```bash
# Smoke baseline (authentication included automatically)
k6 run src/benchmarks/query-smoke.js

# Ramp test to 1k VUs
RAMP_MAX_VU=1000 k6 run src/benchmarks/query-ramp.js

# Mixed workload with custom API key
API_KEY=your_custom_api_key k6 run src/benchmarks/mutation-mix.js

# Spike test
k6 run src/benchmarks/stress-spike.js

# Soak test for 1 hour
DURATION=1h k6 run src/benchmarks/soak-long.js

# Faceted search (30 VUs, 2m)
APP_IDS=fashion-store-456 SEARCH_COLORS=red,blue,green MODE_DISTRIBUTION="HYBRID:0.6,LEXICAL:0.3,VECTOR:0.1" \
k6 run src/benchmarks/search-faceted.js

# Embeddings batch (20 VUs, 1m)
EMBED_TEXTS="winter jacket,red boots,green shirt" BUILD_RATIO=0.4 \
k6 run src/benchmarks/embeddings-batch.js
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

### Search Script (Adaptive Faceted Search)

The `search-faceted.js` script generates realistic product-style search traffic with:

Core behaviors:

- Multi-mode traffic (lexical / vector / hybrid) via weighted distribution
- Dynamic query synthesis (brand, adjective, group, season, material patterns)
- Optional color, season, material, price band and rating filters
- Facet requests (categorical + range) with toggleable set
- Optional weightedQuery boosting map
- Automatic warmup phase exclusion from final pacing if `WARMUP_REQUESTS` set

Adaptive resilience features:

- Fallback from `SearchProductsInput`/`searchProducts`/`hits` to `SearchInput`/`search`/`results`
- Introspection mode (`INTROSPECT=1`) auto-discovers search field, input type and hits key
- Selection simplification when union/JSON validation errors appear (minimal safe projection)
- Automatic stripping of unsupported `appId` field if validation errors reference it (tracks via `search_appid_removed`)
- Environment toggles ensure you can pin behavior if desired

Important environment variables:

- `MODE_DISTRIBUTION` (e.g. `HYBRID:0.6,LEXICAL:0.3,VECTOR:0.1`)
- `FACETS` (comma list; default `color,size,price`)
- `INCLUDE_APP_ID=1` (attempt to send an appId; will auto-disable if schema rejects it)
- `APP_IDS` (list of app IDs to sample when included)
- `INTROSPECT=1` (enable schema discovery pre-run)
- `SEARCH_FIELD`, `SEARCH_INPUT_TYPE`, `SEARCH_HITS_KEY` (manual overrides, bypassing discovery)
- `ADVANCED_FACETS=1` (attempt richer facet union fragments; auto-disabled on validation errors)
- `ENABLE_WEIGHTED_QUERY=1` (enable boosting map for subset of queries)
- Filter toggles: `ENABLE_SEASON_FILTER`, `ENABLE_MATERIAL_FILTER`, `ENABLE_PRICE_BANDS`, `ENABLE_RATING_FILTER`
- `STRICT_NO_ERRORS=1` (log sampled GraphQL errors aggressively)
- Pagination bounds: `PAGE_MIN`, `PAGE_MAX`
- Warmup: `WARMUP_REQUESTS` (number of initial iterations excluded from pacing metrics)
- Debug sampling: `DEBUG_SAMPLE=0.01` (log ~1% sample events)

Exported custom metrics:

- Trends: `search_latency`, `search_backend_ms`, `search_hits_count`, `search_facet_buckets_total`
- Counters: `search_color_filtered`, `search_facet_color_present`, `search_empty_results`, `search_parse_failed`, `search_graphql_errors*`, `search_mode_samples`, `search_appid_removed`
- Rate: `search_success_rate`

Example adaptive run (attempts appId, introspects, weighted modes):

```bash
INCLUDE_APP_ID=1 INTROSPECT=1 MODE_DISTRIBUTION="HYBRID:0.5,LEXICAL:0.3,VECTOR:0.2" \
FACETS=color,price,price,rating ENABLE_PRICE_BANDS=1 ENABLE_RATING_FILTER=1 \
k6 run src/benchmarks/search-faceted.js
```

If the schema changes (field rename or input rename), the script either adapts (introspection/fallback) or you can pin explicit env overrides to lock behavior.

### Embeddings Script

The embeddings benchmark assumes the gateway exposes:

- `textEmbedding(text: String!, modelName: String)` query
- `buildQueryEmbedding(input: QueryEmbeddingInput!)` mutation

Tune mix via:

- `EMBED_TEXTS` comma list of base texts
- `BUILD_RATIO` fraction of iterations performing the build mutation (default 0.5)
- `MODEL_NAME` override model selector

Adjust GraphQL document names if your schema differs.
