# Redis Autocomplete Technical Specification

This document reimagines the MongoDB-based autocomplete design to use Redis as the primary store for fast, scalable typeahead suggestions. It preserves the original capabilities (aliasing, merchandising rules, multi-tenancy, scoring, and observability) while delivering sub-10ms p95 latency at high QPS with straightforward horizontal scaling.

The design uses Redis Stack (RediSearch + RedisJSON) for the best developer ergonomics and performance. A core-Redis-only fallback is also provided for environments without Redis Stack. At runtime, autocomplete is enabled automatically when REDIS_URL is configured; no separate feature flag is required.

## System Overview

- Primary search (Vespa): unchanged
- Autocomplete: Redis Stack
- Ingestion: dual-write via Redis Streams consumer group
- Query: RediSearch FT.AGGREGATE/FT.SEARCH with alias expansion and app-side scoring
- Multi-tenancy: tenant_id partitioning with TAG fields and hash-tags for clustering

## Key Requirements Mapping

- Prefix search over multiple fields → RediSearch TEXT fields with wildcard/prefix queries
- Scoring by text relevance + popularity + canonical boost → combine RediSearch score with numeric fields via FT.AGGREGATE or app-side computation
- Alias system with canonical term, dedup by alias_group_id → RediSearch synonyms sets + grouping/dedup post-search
- Merchandising rules (brand/category/popularity boosts) → apply in aggregation or app-side, with support for runtime rule changes
- Isolation by tenant → TAG filters and key-prefixing, cluster hash-tags for co-location
- Observability and resilience → Redis INFO, slowlog, keyspace + service-level metrics, graceful degradation

## Data Model (Redis Stack)

We model suggestions and related entities as RedisJSON documents indexed by RediSearch. Key naming uses stable prefixes and cluster hash-tags to co-locate tenant shards.

- Suggestion JSON

  - Key: `ac:s:{tenant}:{field}:{normalized}`
  - JSON (subset):
    - tenant_id (string, TAG)
    - field_name (string, TAG)
    - text (string, TEXT) – original display text
    - normalized (string, TEXT) – lowercase, filtered
    - frequency (number, NUMERIC, SORTABLE)
    - popularity_score (number, NUMERIC, SORTABLE)
    - brands (array[string], TAG)
    - categories (array[string], TAG)
    - alias_group_id (string, TAG, nullable)
    - is_canonical (boolean → numeric 0/1, NUMERIC)
    - alias_variants (array[string])
    - metadata (object)
    - created_at, updated_at (numbers or ISO string)

- Alias Group JSON

  - Key: `ac:a:{tenant}:{alias_group_id}`
  - JSON: canonical_term, aliases[], field_types[], category_context?, confidence_score, status, created_by, timestamps
  - Synonyms set ID: `syn:{tenant}:{alias_group_id}` → managed via `FT.SYNUPDATE`

- Merchandising Rules JSON

  - Key: `ac:r:{tenant}:{rule_id}`
  - JSON: rule_type, conditions, boost_factor, active, priority, timestamps

- Ingestion Stream

  - Key: `ac:ingest:{tenant}` – stream of per-document events
  - Consumer group: `autocomplete:workers`

- Counters and Decay
  - Key: `ac:freq:{tenant}:{field}:{normalized}` – numeric counters for occurrences
  - Optional: store `ac:freq:decay:version` to track reset cycles

### RediSearch Index

- Index name: `ac-idx`
- Prefixes: `ac:s:`
- STOPWORDS 0 (disable stopwords handling to retain terms)
- Schema:
  - `$.tenant_id` AS `tenant_id` TAG
  - `$.field_name` AS `field_name` TAG
  - `$.text` AS `text` TEXT WEIGHT 10
  - `$.normalized` AS `normalized` TEXT WEIGHT 5
  - `$.frequency` AS `frequency` NUMERIC SORTABLE
  - `$.popularity_score` AS `popularity_score` NUMERIC SORTABLE
  - `$.brands[*]` AS `brand` TAG
  - `$.categories[*]` AS `category` TAG
  - `$.alias_group_id` AS `alias_group_id` TAG
  - `$.is_canonical` AS `is_canonical` NUMERIC

Note: When RedisJSON isn’t desired, the same fields can be stored in HASHes and indexed with identical field aliases.

## Query Processing

1. Input validation and normalization (lowercase, trim, length limits)
2. Alias expansion
   - RediSearch synonyms sets expand tokens automatically; additionally, cache alias group lookups in the service with 10-minute TTL for business-logic checks (status, confidence, category_context)
3. RediSearch query

- Filter by tenant/field via TAGs
- Prefix query on `text` OR `normalized`: e.g., `(text|normalized):(\"prefix*\")`
- OPTIONAL: add brand/category TAG filters when needed

4. Scoring
   - Base text score from RediSearch `score()`
   - Compute merchandising_score = log10(frequency) × rules_multiplier
   - Alias boost = 1.2 if is_canonical == 1
   - combined_score = (text_score × 0.6 + merchandising_score × 0.4) × alias_boost
   - Implementation:
     - Preferred: `FT.AGGREGATE` with `APPLY` expressions to compute combined_score and `GROUPBY @alias_group_id` with `REDUCE FIRST_VALUE_BY` on `@combined_score`
     - Portable: fetch top K with `FT.SEARCH WITHSCORES`, then compute combined score and deduplicate in the service (keep highest per alias_group_id)
5. Deduplication
   - Group results by alias_group_id; if null, group by the suggestion key
   - Keep highest combined_score per group; prefer canonical on ties
6. Limit and transform to GraphQL types

## Aliasing

- Each alias group is kept as JSON and a RediSearch synonyms set. Synonyms provide server-side query expansion without extra round-trips.
- Canonical boosting is enforced via `is_canonical` in the document and the scoring formula.
- Status, confidence, and category-context are enforced in the service (or via TAG filters if materialized to suggestion docs during ingestion).

## Merchandising Rules

- Stored as JSON; hot rules are cached in-memory for 10 minutes
- During query, for each candidate suggestion, apply matching rules:
  - Brand Boosting: if suggestion.brands ∋ rule.conditions.brands, multiply by factor
  - Category Boosting: if categories ∩ rule.conditions.categories ≠ ∅, multiply
  - Popularity: if frequency ≥ min_frequency, multiply
  - Custom: evaluate JSON conditions in service
- Optionally precompute a `merchandising_multiplier` and store per suggestion for very high QPS endpoints; refresh periodically when rules change

## Ingestion & Updates

- Dual write from upsert flow:

  - Push document to `ac:ingest:{tenant}` stream with extracted fields
  - Worker consumes events, extracts suggestions per configured fields, applies stopword filtering and normalization
  - For each suggestion:
  - Deterministic key: `ac:s:{tenant}:{field}:{normalized}`
    - JSON.SET with all attributes; use upserts (idempotent)
    - Update counters: INCR frequency counter and maintain rolling frequency (e.g., exponential decay)
    - Update popularity_score (e.g., EWMA of frequency)
    - If alias group is involved, set alias_group_id and maintain `is_canonical` consistency
  - Bulk operations use pipelining and batching to minimize RTT

- Decay

  - Periodic (e.g., hourly/daily) job applies decay to frequency to favor recent activity (e.g., `frequency = floor(frequency × 0.98)`) and recomputes popularity_score

- Failure handling
  - Stream processing is idempotent; last-seen IDs are tracked per consumer
  - On Redis outage: queue documents and retry; do not block main ingestion

## Multi-Tenancy & Clustering

- Key prefixes include tenant IDs: `ac:{s|a|r}:<tenant>:`
- Use Redis Cluster hash-tags to co-locate a tenant’s keys: `ac:s:{<tenant>}:{field}:{normalized}`
- Query uses TAG filters; cluster will route to relevant shards; for top-N accuracy, ensure index shards cover the prefix set
- Per-tenant limits and quotas enforced in service (max suggestions returned, max per-field entries)

## Performance & Sizing

- Latency targets:
  - Simple autocomplete: 5–15ms p95 with RediSearch on modest hardware
  - Alias expansion: negligible (synonyms) or 10–20ms including service-side dedup
- Memory:
  - RedisJSON document for suggestion ~ 200–300 bytes + index overhead (50–100%)
  - 1M suggestions ~ 300–600MB total (similar to MongoDB estimate, typically lower)
- Throughput:
  - Streams and pipelining comfortably handle 10k+ ingestions/sec
  - RediSearch tuned for >5k QPS queries per node; scale shards linearly

## Observability

- Redis: INFO, slowlog, keyspace stats; Redis Exporter for Prometheus
- Service: structured logs (query latency, hits, misses, errors), metrics (p50/p95/p99, cache hit rate, stream lag, rules applications)
- Health checks: ping, FT.INFO health, stream lag, index size

## Security

- Role-based Redis ACLs; restrict keys by prefix
- TLS on client/server links
- Per-tenant quotas and hard limits
- Input validation and length limits remain in service

## Ultra-fast Typeahead with FT.SUG\* (Recommended for simple prefix)

If you only need super fast typeahead without server-side attribute filtering or complex query-time scoring, use RediSearch’s autocomplete trie APIs:

- FT.SUGADD – add/update suggestions with a popularity score
- FT.SUGGET – fetch top-k suggestions by prefix (optional FUZZY) with WITHSCORES and WITHPAYLOADS
- FT.SUGDEL – remove suggestions

### Keying and Payloads

- Dictionary per tenant/field for isolation and shardability:
  - Key: `ac:dict:{tenant}:{field}`
- Store suggestions by their normalized string; use PAYLOAD to carry display text and light metadata.
  - Payload JSON (example):
  - `id`: pointer to `ac:s:{tenant}:{field}:{normalized}` (optional)
  - `text`: original display text (cased)
  - `alias_group_id`: for dedup
  - `is_canonical`: bool
  - `brands`, `categories`: small arrays if you need in-app filtering

### Ingestion (SUGADD)

- Normalize term, enforce min length.
- Compute popularity score (e.g., EWMA of frequency); higher is better.
- Add or update:
  - `FT.SUGADD ac:dict:... <normalized> <score> PAYLOAD <payload-json>`
  - To accumulate counts over time, use `INCR`; to replace with an absolute score, omit `INCR`.

### Query (SUGGET)

1. Normalize input; require `min_length`.
2. Select dictionary: `ac:dict:{tenant}:{field}`.
3. `FT.SUGGET ... <prefix> WITHSCORES WITHPAYLOADS [FUZZY] [MAX K']` (use K' > K if you’ll filter/dedup in-app).
4. For each hit:
   - Parse payload; deduplicate by `alias_group_id` (keep highest score; on ties prefer `is_canonical`).
   - Optionally apply tiny in-app filters (brands/categories) and a canonical multiplier (e.g., ×1.2) to the returned score.
5. Sort by final score and return top N suggestions using payload.text as display.

Notes:

- SUGGET doesn’t perform server-side attribute filtering or field-weighted relevance. If you need those, use the RediSearch FT.SEARCH/AGGREGATE path described earlier. For pure prefix typeahead, SUG\* is faster and simpler.
- Synonyms/aliases aren’t expanded by SUG\*. Insert both canonical and alias terms pointing to the same `alias_group_id`. Give canonical a slightly higher score or apply a multiplier during query.

### Maintenance

- Delete an entry: `FT.SUGDEL ac:dict:... <normalized>`
- Popularity decay: periodically recompute absolute scores and overwrite via SUGADD without INCR.
- Rebuilds: regenerate dictionaries from source if schema changes.

### Minimal Rust helpers (SUG\*)

```rust
use redis::{AsyncCommands, FromRedisValue, Value};

#[derive(serde::Serialize, serde::Deserialize)]
struct SugPayload<'a> {
  id: Option<&'a str>,
  text: &'a str,
  alias_group_id: Option<&'a str>,
  is_canonical: bool,
}

pub async fn sugadd(
  conn: &mut redis::aio::Connection,
  dict_key: &str,
  normalized: &str,
  score: f64,
  payload_json: &str,
  incr: bool,
) -> redis::RedisResult<()> {
  let mut cmd = redis::cmd("FT.SUGADD");
  cmd.arg(dict_key)
    .arg(normalized)
    .arg(score)
    .arg("PAYLOAD")
    .arg(payload_json);
  if incr { cmd.arg("INCR"); }
  cmd.query_async(conn).await
}

pub struct SugHit {
  pub term: String,
  pub score: f64,
  pub payload: Option<String>,
}

pub async fn sugget(
  conn: &mut redis::aio::Connection,
  dict_key: &str,
  prefix: &str,
  max: usize,
  fuzzy: bool,
) -> redis::RedisResult<Vec<SugHit>> {
  let mut cmd = redis::cmd("FT.SUGGET");
  cmd.arg(dict_key)
    .arg(prefix)
    .arg("WITHSCORES")
    .arg("WITHPAYLOADS")
    .arg("MAX")
    .arg(max);
  if fuzzy { cmd.arg("FUZZY"); }
  let val: Value = cmd.query_async(conn).await?;
  // Response is a flat array: [term, score, payload, term, score, payload, ...]
  let mut out = Vec::new();
  if let Value::Bulk(items) = val {
    let mut i = 0;
    while i + 2 < items.len() {
      let term: String = FromRedisValue::from_redis_value(&items[i])?;
      let score: f64 = FromRedisValue::from_redis_value(&items[i+1])?;
      let payload: Option<String> = match &items[i+2] { Value::Nil => None, v => Some(FromRedisValue::from_redis_value(v)?), };
      out.push(SugHit { term, score, payload });
      i += 3;
    }
  }
  Ok(out)
}
```

## Core Redis Fallback (No Redis Stack)

If RediSearch is unavailable, use a simplified path:

- Data Structures
  - ZSET per tenant/field: `ac:z:{tenant}:{field}`
    - Member: original `text`, Score: popularity (e.g., frequency-based)
    - Secondary lookup HASH: `ac:h:{tenant}:{field}:{normalized}` for metadata (alias_group_id, brands, categories, is_canonical, etc.)
- Query
  - Use `ZRANGEBYLEX` for prefix match on a lexicographically sorted structure
  - Note: To support lex range, store members as `normalized|text` to order by normalized
  - Fetch top N×K, then deduplicate and score in the service using metadata from HASH
- Aliasing
  - Maintain `alias:{tenant}:{alias_group_id}` as SET of terms and canonical
  - Perform expansion and dedup in the service
- Tradeoffs
  - No stemming, fuzzy, or field weighting; ranking is simpler
  - Good for strict prefix typeahead and medium scale; can upgrade to Redis Stack later

## Minimal Rust Skeleton

Below are minimal interfaces and sketches for the Redis-backed AutocompleteService within the search service.

```rust
// Cargo.toml
// redis = { version = "0.24", features = ["connection-manager", "tokio-comp" ] }
// serde = { version = "1", features = ["derive"] }
// serde_json = "1"

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SuggestionDoc {
    pub tenant_id: String,
    pub application_id: String,
    pub field_name: String,
    pub text: String,
    pub normalized: String,
    pub frequency: i64,
    pub popularity_score: f64,
    pub brands: Vec<String>,
    pub categories: Vec<String>,
    pub alias_group_id: Option<String>,
    pub is_canonical: bool,
    pub alias_variants: Vec<String>,
    pub metadata: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct RedisAutocompleteService {
    conn: redis::aio::ConnectionManager,
    // local caches for rules and alias groups
}

impl RedisAutocompleteService {
    pub async fn ensure_indexes(&self) -> redis::RedisResult<()> {
        // Issue FT.CREATE if not exists, define schema (JSON or HASH)
        // Issue FT.SYNUPDATE for initial alias sets
        Ok(())
    }

    pub async fn upsert_suggestion(&self, s: &SuggestionDoc) -> redis::RedisResult<()> {
        let key = format!(
            "ac:s:{}:{}:{}:{}",
            s.tenant_id, s.application_id, s.field_name, s.normalized
        );
        let json = serde_json::to_string(s).unwrap();
        // JSON.SET key $ json NX|XX -> use XX for update, NX for new
        redis::cmd("JSON.SET")
            .arg(&key)
            .arg("$")
            .arg(json)
            .query_async(&mut self.conn.clone())
            .await?;
        Ok(())
    }

    pub async fn query(
        &self,
        tenant_id: &str,
        application_id: &str,
        field_name: &str,
        prefix: &str,
        limit: usize,
    ) -> redis::RedisResult<Vec<SuggestionDoc>> {
        // Preferred: FT.SEARCH with TAG filters and prefix query
        // Fallback: fetch candidates and score in app, dedup by alias_group_id
        // Return top-N by combined score
        Ok(vec![])
    }
}
```

## Edge Cases

- Empty/null input → return empty array
- Very short prefixes (≤1 char) → require min_length per field
- High-cardinality fields → cap per-field suggestions and decay aggressively
- Rule misconfiguration → clamp final score to max (e.g., 100.0)
- Cache staleness → respect 10-minute TTL; on stale/miss, refresh on-demand

## Next Steps

1. Add Redis client and config to search service
2. Implement `ensure_indexes` and a basic search path with app-side dedup
3. Wire ingestion worker from upsert pipeline to populate Redis via streams
4. Add metrics and dashboards for latency and stream lag
5. Validate against a sample of existing MongoDB data before full switch

This design delivers the same capabilities as the MongoDB plan with lower latency, simpler scaling, and an easy path to incrementally adopt Redis Stack features.
