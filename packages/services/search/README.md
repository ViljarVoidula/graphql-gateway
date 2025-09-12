# Search Service (Rust)

Implements the Dynamic Search API with Vespa backend. GraphQL server on port 8088.

Features:

- LEXICAL, VECTOR, HYBRID modes (nearestNeighbor + text)
- Dynamic field selection (MVP-mapped)
- External vectors; Vespa stores and searches vectors
- Dynamic Vespa app package generation + deployment

For end‑to‑end steps on deploying new applications (indexes), feeding documents, and querying, see `INDEXING_GUIDE.md`.

Config via env (new/updated):

- VESPA_ENDPOINT (default http://localhost:8100)
- VESPA_DEPLOY_ENDPOINT (default http://localhost:19071)
- APP_ID (default default-app)
- SEARCH_SCHEMA_VERSION (default v1)
- SEARCH_AUTO_DEPLOY=true|false (default true) Automatically deploy a minimal Vespa application package on startup
- SEARCH_DEFAULT_TENSOR_DIM (default 768, overridden to 8 in examples) Used when auto deploying
- SEARCH_DEFAULT_GEO_ENABLED=true|false (default true)

### Index Config Caching & Automatic Embeddings

On document upsert the service queries the embeddings service for an index configuration (GraphQL `indexConfig` query) and caches the result for 10 minutes per application id. The configuration provides `vectorFields` with `name`, `weight`, and `dimensions`. If a document lacks an `embedding` field, text is extracted from each configured field (arrays are joined with spaces) and a weighted embedding build request is sent to the embeddings service (using the active model). The resulting vector is inserted before feeding to Vespa. Failures fall back silently to feeding without an embedding.

Environment variables involved:

| Variable                   | Purpose                                           | Default                 |
| -------------------------- | ------------------------------------------------- | ----------------------- |
| `EMBEDDINGS_SERVICE_URL`   | Base URL for embeddings + index config GraphQL    | `http://localhost:9200` |
| `ENABLE_REMOTE_EMBEDDINGS` | Master switch for any remote embedding generation | `true`                  |

GraphQL example used internally:

```
query GetIndexConfig($applicationId: String!) {
  indexConfig(applicationId: $applicationId) {
    id
    tenantId
    clusterId
    applicationId
    activeModel
    vectorFields { name weight dimensions }
  }
}
```

No action is needed if the embeddings service already exposes this query and returns `vectorFields`.

### Multi-Tenancy in Upserts

Mutations now accept an optional `tenantId` argument:

```
mutation($appId:String!,$tenantId:String,$doc:JSON!){
  upsertProduct(appId:$appId, tenantId:$tenantId, doc:$doc)
}

mutation($appId:String!,$tenantId:String,$docs:[JSON!]!){
  upsertProducts(appId:$appId, tenantId:$tenantId, docs:$docs)
}
```

Resolution order per document:

1. If `tenant_id` field present inside the document and `tenantId` arg provided: they must match (else error).
2. If `tenantId` arg provided and document lacks `tenant_id`, it is injected.
3. If neither present, the service falls back to `DEFAULT_TENANT_ID` (legacy behavior).

This lets clients feed mixed tenants by calling separate mutations with different `tenantId` values while maintaining backward compatibility.

Run: `cargo run` in this directory.

## Quick Start with Docker (Recommended)

Spin up Vespa + the search service together using the root compose file (after this change both services are integrated):

```sh
docker compose up -d vespa search-service
```

The search service will auto-deploy a dynamic app (APP_ID) once Vespa is healthy. You can then run:

```sh
bash demo.sh
```

To rebuild the Rust service image after code changes:

```sh
docker compose build search-service && docker compose restart search-service
```

Alternatively, a standalone compose file is provided here: `docker-compose.search.yaml` for isolated iteration.

## Tests

- Unit tests

  - Fast checks for mappers and utilities.

  ```sh
  cargo test
  ```

- End-to-end Vespa test (via testcontainers)

  - Uses Docker to launch `vespaengine/vespa:8.578.22` and runs deploy → feed → search against the running container.
  - Test file: `tests/vespa_e2e.rs` (marked `#[ignore]` so it won’t run by default).
  - Requirements: Docker installed and running; network access for mapped ports.

  - Compile tests without running:

    ```sh
    cargo test --tests --no-run
    ```

  - Run the ignored E2E test (will pull the Vespa image on first run):

    ```sh
    cargo test e2e_vespa_deploy_feed_search -- --ignored --nocapture
    ```

  Notes:

  - The E2E test starts Vespa with Testcontainers (async runner) and connects via mapped ports (19071 deploy API, 8080 query API).
  - The test builds the GraphQL schema in-process (no external server needed).
  - First run can take several minutes to pull and initialize Vespa.

## Demo

You can also exercise the API over HTTP using the bundled script:

```sh
# In one terminal, start the service
cargo run

# In another terminal, run the demo (deploy app → upsert → search)
bash demo.sh
```

If you changed ports or endpoints, export `VESPA_ENDPOINT` and `VESPA_DEPLOY_ENDPOINT` before running.

Tip: If you see HTML from /search, you're likely hitting the wrong port. Use the mapped host port (commonly 8100) for the Vespa query endpoint.

docker run --detach --name vespa --hostname vespa-container \
 --publish 8100:8080 --publish 19071:19071 \
 vespaengine/vespa

## Test Coverage Improvements

Added tests:

- `tests/query_builder.rs` (vector query + field selection summary)
- `tests/graphql_validation.rs` (input validation: query + weightedQuery conflict)
- `tests/suggestions_mapping.rs` (suggestions extraction)
- Existing: `tests/facets_mapping.rs`, integration and optional E2E Vespa test

These cover core GraphQL paths (validation + mapping) and query construction logic.

## Code Coverage (LLVM)

Two options:

1. Preferred (cargo-llvm-cov):

```sh
cargo install cargo-llvm-cov
bash scripts/coverage.sh              # full (HTML + lcov)
CONSOLE=1 bash scripts/coverage.sh    # console summary only
# Open report
OPEN=1 bash scripts/coverage.sh
```

2. Manual fallback (no plugin):

```sh
COVERAGE_MODE=manual bash scripts/coverage.sh          # full
CONSOLE=1 COVERAGE_MODE=manual bash scripts/coverage.sh
```

Artifacts:

- `coverage/` (HTML when using cargo-llvm-cov or `coverage/html/index.html` manual)
- `lcov.info` (consume in CI or upload to services like Codecov)

In CI you can run (headless):

```sh
cargo install cargo-llvm-cov --locked || true
bash scripts/coverage.sh
```

To upload to Codecov (example):

```sh
curl -s https://codecov.io/bash | bash -s -- -f lcov.info || echo "Codecov upload failed"
```
