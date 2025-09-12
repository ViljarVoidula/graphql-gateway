# Search Indexing & Query Guide

Comprehensive instructions for creating (deploying) new Vespa-backed applications ("indexes"), inserting data, and running queries through the GraphQL search service.

## 1. Concepts

| Term             | Meaning                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| app_id           | Logical application identifier (deployment namespace). Auto-used as `tenant_id` if omitted in documents. |
| Deployment       | Creating/activating a Vespa application package (services.xml + schema)                                  |
| Document type    | Currently fixed to `product` in dynamic package generator                                                |
| Embedding tensor | Vector field `embedding` with dimension you configure (default 768)                                      |
| Summary preset   | Field selection presets mapping to Vespa document summaries                                              |

The service dynamically generates a minimal Vespa application. Each distinct `app_id` can have its own deployment (package) and documents.

## 1.1 GraphQL Operation Reference (Copy/Paste)

Use these directly in GraphiQL / Apollo Sandbox / Insomnia / Postman.

### Deploy Application

Operation:

```graphql
mutation DeployApp($app: String!, $schema: JSON!) {
  deployApp(appId: $app, schemaJson: $schema)
}
```

Variables example (minimal auto schema override):

```json
{
  "app": "saas",
  "schema": { "tensor_dim": 128, "geo_enabled": false }
}
```

Variables example (with extra custom fields):

```json
{
  "app": "saas",
  "schema": {
    "tensor_dim": 128,
    "geo_enabled": true,
    "schema_fields": [
      {
        "name": "discount",
        "type": "float",
        "indexing": "attribute | summary"
      },
      {
        "name": "inventory_status",
        "type": "string",
        "indexing": "summary | attribute"
      }
    ]
  }
}
```

### Upsert (Feed) Product Document

Operation:

```graphql
mutation UpsertProduct($app: String!, $doc: JSON!) {
  upsertProduct(appId: $app, doc: $doc)
}
```

Variables (basic) (tenant_id shown explicitly; auto-injected if omitted):

```json
{
  "app": "saas",
  "doc": {
    "tenant_id": "saas",
    "id": "sku-1001",
    "name": "Trail Running Shoe"
  }
}
```

Variables (full) (explicit tenant_id optional) — taxonomy uses `categories` (array of hierarchical path strings like "shoes>running>trail`):

```json
{
  "app": "saas",
  "doc": {
    "tenant_id": "saas", // optional; auto-set if omitted (default tenant)
    "id": "sku-1001",
    "name": "Trail Running Shoe",
    "brand": "FastFeet",
    "categories": ["shoes>running>trail"],
    "price": 129.99,
    "popularity": 87,
    "embedding": [0.12, 0.03, -0.44, 0.9, 0.11, 0.07, -0.22, 0.5],
    "payload": { "color": "red", "sizes": [41, 42, 43] }
  }
}
```

### Health Check

```graphql
{
  health
}
```

### Simple Lexical Search

Operation:

```graphql
query SearchBasic($in: SearchInput!) {
  search(input: $in) {
    results {
      id
      name
    }
    meta {
      totalResults
      executionTime
    }
  }
}
```

Variables:

```json
{
  "in": {
    "tenantId": "saas",
    "query": "running shoe",
    "mode": "LEXICAL",
    "pagination": { "limit": 10 }
  }
}
```

### Vector Search

```graphql
query SearchVector($in: SearchInput!) {
  search(input: $in) {
    results {
      id
      score
    }
    meta {
      executionTime
    }
  }
}
```

Variables:

```json
{
  "in": {
    "tenantId": "saas",
    "mode": "VECTOR",
    "vector": { "embedding": [0.11, 0.02, -0.33, 0.8, 0.05, 0.04, -0.1, 0.61] },
    "pagination": { "limit": 5 }
  }
}
```

### Hybrid Search (Text + ANN)

```graphql
query SearchHybrid($in: SearchInput!) {
  search(input: $in) {
    results {
      id
      name
      score
    }
    meta {
      totalResults
      executionTime
    }
  }
}
```

Variables:

```json
{
  "in": {
    "tenantId": "saas",
    "query": "trail shoe",
    "mode": "HYBRID",
    "vector": { "embedding": [0.11, 0.02, -0.33, 0.8, 0.05, 0.04, -0.1, 0.61] },
    "pagination": { "limit": 10 }
  }
}
```

### Weighted Query (Instead of `query`)

```graphql
query SearchWeighted($in: SearchInput!) {
  search(input: $in) {
    results {
      id
      name
      score
    }
  }
}
```

Variables:

```json
{
  "in": {
    "tenantId": "saas",
    "weightedQuery": { "shoe": 2.0, "trail": 1.5, "lightweight": 1.2 },
    "mode": "LEXICAL"
  }
}
```

### Faceted Search

```graphql
query SearchFacets($in: SearchInput!) {
  search(input: $in) {
    facets {
      ... on CategoricalFacetResult {
        field
        values {
          value
          count
        }
      }
      ... on RangeFacetResult {
        field
        buckets {
          min
          max
          count
        }
      }
      ... on BooleanFacetResult {
        field
        values {
          value
          count
        }
      }
      ... on HierarchyFacetResult {
        field
        nodes {
          value
          count
          level
          path
          children {
            value
            count
            level
            path
          }
        }
      }
    }
    results {
      id
      name
    }
    meta {
      totalResults
    }
  }
}
```

Variables:

```json
{
  "in": {
    "tenantId": "saas",
    "query": "shoe",
    "facets": [
      {
        "field": "categories",
        "type": "CATEGORICAL",
        "categorical": { "limit": 10 }
      },
      {
        "field": "price",
        "type": "RANGE",
        "range": {
          "ranges": [
            { "min": 0, "max": 50, "label": "Budget" },
            { "min": 50, "max": 100, "label": "Mid" },
            { "min": 100, "max": 200, "label": "Premium" }
          ]
        }
      },
      {
        "field": "is_on_sale",
        "type": "BOOLEAN",
        "boolean": {}
      },
      {
        "field": "categories",
        "type": "HIERARCHY",
        "label": "Category",
        "hierarchy": {}
      }
    ],
    "pagination": { "limit": 12 },
    "fields": { "preset": "BASIC" }
  }
}
```

Notes:

- BOOLEAN facets are internally grouped like categorical values, but when the facet `type` is set to `BOOLEAN` the API returns a `BooleanFacetResult` union variant so clients can render a distinct UI (e.g. toggle list). The service does not coerce values; ensure the underlying field is indexed as string/attribute returning values "true"/"false" (or 1/0) consistently.
- HIERARCHY facets currently derive their tree from the first hierarchical category path exposed as `category_path` / provided via the `categories` array (each entry like `"shoes>running>trail"`). Only a single backend grouping level is requested; deeper levels are synthesized service‑side by splitting on `>` and aggregating counts. Future enhancements will honor custom separators and selection state.
- To experiment quickly you can request both a flat categorical facet and the hierarchical facet on the same underlying field (`categories`)—the categorical variant gives top-f values while the hierarchy returns the tree.

### Geo (If Enabled in Schema)

```graphql
query SearchGeo($in: SearchInput!) {
  search(input: $in) {
    results {
      id
      distanceMeters
    }
  }
}
```

Variables (interface may still be partially implemented):

```json
{
  "in": {
    "tenantId": "saas",
    "mode": "HYBRID",
    "query": "store",
    "geo": {
      "point": { "lat": 37.7749, "lon": -122.4194 },
      "radiusMeters": 50000,
      "sortByDistance": true
    }
  }
}
```

### Summary Presets Quick Reference

| Preset   | Fields (Conceptual)            |
| -------- | ------------------------------ |
| MINIMAL  | id, name, price                |
| BASIC    | id, name, brand, price, image  |
| DETAILED | BASIC + payload                |
| COMPLETE | same as DETAILED (placeholder) |

### Common Gotchas

- Never send both `query` and `weightedQuery` together.
- Embedding length must equal `tensor_dim` used at deploy time.
- `payload` object is stringified; retrieve via summary fields/preset.

---

## 2. Deploy / Register a New Application

Two choices:

### 2.1 Auto-Deploy on Startup

Set environment variables before starting the search service. If `SEARCH_AUTO_DEPLOY=true` (default), it deploys automatically.

```bash
export APP_ID=myshop
export SEARCH_AUTO_DEPLOY=true
export SEARCH_DEFAULT_TENSOR_DIM=768   # must match embeddings you feed
export SEARCH_DEFAULT_GEO_ENABLED=true
cargo run
```

### 2.2 Manual Deploy via GraphQL `deployApp`

Use this when you want custom schema fields or to redeploy without restarting the service.

Accepted JSON keys:

- `tensor_dim` (int)
- `geo_enabled` (bool)
- `schema_fields`: array of custom field specs `{ "name", "type", "indexing" }`

Example mutation:

```bash
curl -s -X POST http://localhost:8088/graphql \
 -H 'Content-Type: application/json' \
 -d '{
  "query": "mutation Deploy($app:String!,$schema: JSON!){ deployApp(appId:$app, schemaJson:$schema) }",
  "variables": {
  "app": "saas",
    "schema": {
      "tensor_dim": 128,
      "geo_enabled": false,
      "schema_fields": [
        { "name": "discount", "type": "float", "indexing": "attribute | summary" },
        { "name": "inventory_status", "type": "string", "indexing": "summary | attribute" }
      ]
    }
  }
}'
```

Returns `true` on success.

### Notes

- Redeploying replaces the active package for that `app_id` (single tenant context).
- Ensure embedding vectors you feed have length = `tensor_dim`.
- Only one document type (`product`) is generated; custom fields are appended.

## 3. Feeding Documents

Use GraphQL `upsertProduct` (preferred) or call Vespa Document API directly.

### 3.1 Via GraphQL

Mutation:

```graphql
mutation Upsert($app: String!, $doc: JSON!) {
  upsertProduct(appId: $app, doc: $doc)
}
```

Minimum required field: `id`.
Common optional fields: `name`, `brand`, `price`, `image`, `payload`, `embedding` (vector), `location` (if geo enabled), plus custom fields.

Example:

```bash
curl -s -X POST http://localhost:8088/graphql \
 -H 'Content-Type: application/json' \
 -d '{
  "query":"mutation Upsert($a:String!,$d:JSON!){ upsertProduct(appId:$a, doc:$d) }",
  "variables":{
  "a":"saas",
    "d":{
  "tenant_id":"saas",
  "id":"sku-1001",
      "name":"Trail Running Shoe",
  "brand":"FastFeet",
  "categories":["shoes"],
      "price":129.99,
      "popularity":87,
      "embedding":[0.12,0.03,-0.44,0.9,0.11,0.07,-0.22,0.5],
      "payload":{"color":"red","sizes":[41,42,43]}
    }
  }
}'
```

Behavior:

- Non-string `payload` is converted to a JSON string automatically.
- `type` field (if supplied) is stripped; document type fixed to `product`.
- If `tenant_id` is missing it is automatically injected with the provided `appId` to keep legacy docs minimal.
- Search currently filters by `tenant_id` contains `appId`; keep them identical unless you plan multi-tenant grouping under one deployment.

### 3.2 Direct Vespa Document API

```bash
curl -s -X POST http://localhost:8100/document/v1/saas/product/docid/sku-1001 \
 -H 'Content-Type: application/json' \
 -d '{
  "fields":{
  "tenant_id":"saas",
  "id":"sku-1001",
    "name":"Trail Running Shoe",
  "price":129.99,
  "categories":["shoes"],
    "embedding":[0.12,0.03,-0.44,0.9,0.11,0.07,-0.22,0.5],
    "payload":"{\"color\":\"red\"}"
  }
}'
```

### Bulk Tips

- Parallelize multiple mutation calls or use direct API.
- Validate embedding length upfront.
- Consider batching outside the service (no batch endpoint yet).

### 3.3 Variations & Media Indexing

The schema stores raw variations JSON in the `variations` string field and media URLs in `media_images` / `media_videos` arrays. The GraphQL layer hydrates these into structured `variations` and unified `media` lists.

Example upsert with two variations and media:

```json
{
  "app": "saas",
  "doc": {
    "id": "sku-2001",
    "tenant_id": "saas",
    "name": "All-Terrain Trail Shoe",
    "brand": "TrailMax",
    "categories": ["shoes>running>trail"],
    "price": 149.99,
    "popularity": 42,
    "views": 560,
    "media_images": [
      "https://cdn.example.com/2001/main.jpg",
      "https://cdn.example.com/2001/alt1.jpg"
    ],
    "media_videos": ["https://cdn.example.com/2001/intro.mp4"],
    "variations": "[{\"id\":\"var-2001-red-42\",\"sku\":\"2001-RED-42\",\"name\":\"Red 42\",\"price\":149.99},{\"id\":\"var-2001-red-43\",\"sku\":\"2001-RED-43\",\"name\":\"Red 43\",\"price\":149.99}]",
    "embedding": [0.01, -0.02, 0.3, 0.4, -0.11, 0.27, 0.05, 0.12],
    "payload": { "season": "SS25", "materials": ["mesh", "rubber"] }
  }
}
```

Notes:

- The `variations` field must be a JSON array encoded as a string (service will not transform structured objects automatically yet).
- Each variation object may contain any of: id, sku, name, price, price_discounted, image, payload.
- Media URLs are hashed to create stable IDs for GraphQL `media` entries.
- For hierarchical categories, use `categories` array with full paths; breadcrumbs are derived by splitting on `>`.

### 3.4 Faceting on `payload.color`

`payload` is stored as a stringified JSON blob, so its inner keys (like `color`) are NOT individually indexed or attribute searchable by default. To facet on a value inside `payload` you must expose it as a top‑level field that is indexed as an `attribute` (and optionally `summary`). There is currently no automatic JSON path extraction in the dynamic schema generator.

Two simple approaches:

1. (Recommended) Add a dedicated top‑level field (e.g. `color`) via `schema_fields` at deploy time and duplicate the value when feeding.
2. Pre‑process documents before upsert to copy `payload.color` into `color` (or `payload_color`) yourself.

Deploy with a `color` field:

```json
{
  "app": "saas",
  "schema": {
    "tensor_dim": 128,
    "schema_fields": [
      { "name": "color", "type": "string", "indexing": "attribute | summary" }
    ]
  }
}
```

Feed documents duplicating the color (keep it in `payload` if you still want the raw JSON preserved):

```json
{
  "app": "saas",
  "doc": {
    "tenant_id": "saas",
    "id": "sku-color-1",
    "name": "Lightweight Trail Shoe",
    "categories": ["shoes>running>trail"],
    "price": 129.99,
    "color": "red", // <- top-level indexed field (for faceting)
    "payload": { "color": "red", "sizes": [41, 42, 43] },
    "embedding": [0.12, 0.03, -0.44, 0.9, 0.11, 0.07, -0.22, 0.5]
  }
}
```

Search with a categorical facet on `color` (you can also give it a label override):

```graphql
query FacetColor($in: SearchInput!) {
  search(input: $in) {
    facets {
      ... on CategoricalFacetResult {
        field
        values {
          value
          count
        }
      }
    }
    results {
      id
      name
      color
    }
    meta {
      totalResults
    }
  }
}
```

Variables example (requesting the color facet + another facet):

```json
{
  "in": {
    "tenantId": "saas",
    "query": "shoe",
    "facets": [
      {
        "field": "color",
        "type": "CATEGORICAL",
        "label": "Color",
        "categorical": { "limit": 20 }
      },
      {
        "field": "price",
        "type": "RANGE",
        "range": {
          "ranges": [
            { "min": 0, "max": 50, "label": "Budget" },
            { "min": 50, "max": 100, "label": "Mid" },
            { "min": 100, "max": 200, "label": "Premium" }
          ]
        }
      }
    ],
    "pagination": { "limit": 12 },
    "fields": { "preset": "BASIC" }
  }
}
```

Filtering (select red + budget range) example (range operators now use `__` prefix – legacy `$gte`/`$lte` still accepted but deprecated):

```json
{
  "in": {
    "tenantId": "saas",
    "query": "shoe",
    "facets": [
      {
        "field": "color",
        "type": "CATEGORICAL",
        "categorical": { "limit": 10 }
      }
    ],
    "filters": { "color": "red", "price": { "__gte": 0, "__lte": 50 } },
    "pagination": { "limit": 10 }
  }
}
```

Notes:

- If you forget to add `color` as a top-level schema field, Vespa will not return facet buckets because the nested JSON key is invisible to grouping.
- You can choose a different field name (e.g. `payload_color`)—just keep it consistent in feed + facet config.
- For multi-valued colors (e.g. variants) consider indexing an array field (type `array<string>`) and then facet on it the same way; ensure indexing directive includes `attribute`.

### 3.5 Dynamic Arbitrary Attributes (`attributes_kv`)

The service now automatically flattens the top-level `payload` object into a tag array field `attributes_kv` at upsert time. Each scalar or array element in `payload` becomes one or more `key=value` strings:

Example document fragment:

```json
"payload": {
  "color": "red",
  "season": "SS25",
  "sizes": [41,42],
  "waterproof": true
}
```

Flattened automatically to (stored in `attributes_kv`):

```json
"attributes_kv": [
  "color=red",
  "season=SS25",
  "sizes=41",
  "sizes=42",
  "waterproof=true"
]
```

You can facet over ANY present key immediately without redeploying for every new attribute key.

Facet query (GraphQL operation snippet):

```graphql
query DynamicAttrFacet($in: SearchInput!) {
  search(input: $in) {
    facets {
      ... on CategoricalFacetResult {
        field
        values {
          value
          count
        }
      }
    }
    results {
      id
      name
    }
  }
}
```

Variables example requesting dynamic attributes + price range facet:

```json
{
  "in": {
    "tenantId": "saas",
    "query": "shoe",
    "facets": [
      {
        "field": "attributes_kv",
        "type": "CATEGORICAL",
        "label": "Attributes",
        "categorical": { "limit": 50 }
      },
      {
        "field": "price",
        "type": "RANGE",
        "range": {
          "ranges": [
            { "min": 0, "max": 50, "label": "Budget" },
            { "min": 50, "max": 100, "label": "Mid" },
            { "min": 100, "max": 200, "label": "Premium" }
          ]
        }
      }
    ],
    "pagination": { "limit": 12 }
  }
}
```

Filtering by a single dynamic attribute:

```json
"filters": { "attributes_kv": "color=red" }
```

Filtering by multiple attributes (logical AND):

```json
"filters": { "attributes_kv": ["color=red", "season=SS25"] }
```

Combining with other filters (numeric range example uses `__gte` / `__lte`):

```json
"filters": { "attributes_kv": ["color=red"], "price": { "__gte": 50, "__lte": 150 } }
```

Client UI tips:

- Split each facet value on the first `=` to separate key and value for display (`key=value` -> key: `color`, value: `red`).
- Aggregate counts per key client-side if you want a grouped presentation (e.g. show all colors together).
- To implement OR semantics for a single key (e.g. color=red OR color=blue) pass both values: `"attributes_kv": ["color=red","color=blue"]` (current mapping treats array as OR within the field; AND across different fields—confirm in service logic if changed later).

Limitations / Notes:

- Deeply nested objects inside `payload` are ignored (only top-level scalars & arrays are flattened).
- Numeric and boolean values are stringified verbatim (no localization). Floats keep Rust default formatting.
- This approach does not support numeric range faceting per key (use dedicated top-level fields for that).
- Existing deployments prior to this feature need a redeploy to include the `attributes_kv` field in the schema.

Example combined facet + filter request including dynamic attributes:

```json
{
  "in": {
    "tenantId": "saas",
    "query": "trail shoe",
    "facets": [
      {
        "field": "attributes_kv",
        "type": "CATEGORICAL",
        "categorical": { "limit": 30 }
      },
      {
        "field": "price",
        "type": "RANGE",
        "range": {
          "ranges": [
            { "min": 0, "max": 100 },
            { "min": 100, "max": 200 }
          ]
        }
      }
    ],
    "filters": {
      "attributes_kv": ["season=SS25", "waterproof=true"],
      "price": { "__gte": 0, "__lte": 200 }
    },
    "pagination": { "limit": 20 }
  }
}
```

UI example interpretation of facet values:

| Raw tag           | Key        | Value |
| ----------------- | ---------- | ----- |
| `color=red`       | color      | red   |
| `sizes=41`        | sizes      | 41    |
| `waterproof=true` | waterproof | true  |

When a user picks a value, add the corresponding tag to the `attributes_kv` filter collection.

## 4. Searching

GraphQL query:

```graphql
query Search($in: SearchInput!) {
  search(input: $in) {
    meta {
      totalResults
      executionTime
    }
    results {
      id
      name
      score
    }
    facets {
      ... on CategoricalFacetResult {
        field
        values {
          value
          count
        }
      }
    }
  }
}
```

Key input fields:

- `appId` (required)
- `query` OR `weightedQuery` (mutually exclusive)
- `mode`: LEXICAL | VECTOR | HYBRID (default HYBRID)
- `vector.embedding`: vector for VECTOR / HYBRID
- `pagination { limit offset }`
- `fields { preset: BASIC|MINIMAL|DETAILED|COMPLETE }`
- `facets`: facet configs
- `filters`: JSON passed through

### 4.1 Lexical Example

```bash
curl -s -X POST http://localhost:8088/graphql -H 'Content-Type: application/json' -d '{
  "query":"query($i:SearchInput!){ search(input:$i){ results{ id name } meta{ totalResults } } }",
  "variables":{ "i":{ "tenantId":"saas", "query":"running shoe", "mode":"LEXICAL", "pagination":{"limit":10} } }
}'
```

### 4.2 Vector Example

```bash
curl -s -X POST http://localhost:8088/graphql -H 'Content-Type: application/json' -d '{
  "query":"query($i:SearchInput!){ search(input:$i){ results{ id score } } }",
  "variables":{ "i":{ "tenantId":"saas", "mode":"VECTOR", "vector":{ "embedding":[0.11,0.02,-0.33,0.8,0.05,0.04,-0.10,0.61] }, "pagination":{"limit":5} } }
}'
```

### 4.3 Hybrid Example

```bash
curl -s -X POST http://localhost:8088/graphql -H 'Content-Type: application/json' -d '{
  "query":"query($i:SearchInput!){ search(input:$i){ results{ id name score } meta{ executionTime } } }",
  "variables":{ "i":{ "tenantId":"saas", "query":"trail shoe", "mode":"HYBRID", "vector":{"embedding":[0.11,0.02,-0.33,0.8,0.05,0.04,-0.10,0.61]}, "pagination":{"limit":10} } }
}'
```

### 4.4 Weighted Query

```bash
curl -s -X POST http://localhost:8088/graphql -H 'Content-Type: application/json' -d '{
  "query":"query($i:SearchInput!){ search(input:$i){ results{ id name score } } }",
  "variables":{ "i":{ "tenantId":"saas", "weightedQuery":{ "shoe":2.0, "trail":1.5 }, "mode":"LEXICAL" } }
}'
```

### 4.5 Facets Example

```json
"facets":[
  {"field":"categories","type":"CATEGORICAL","categorical":{"limit":10}},
  {"field":"price","type":"RANGE","range":{"ranges":[{"min":0,"max":50,"label":"Budget"},{"min":50,"max":100,"label":"Mid"},{"min":100,"max":200,"label":"Premium"}]}}
]
```

Include inside `variables.i`.

### 4.6 Field Presets

```json
"fields": { "preset": "BASIC" }
```

Controls which summary class (minimal/basic/detailed/complete) is requested.

## 5. Health Check

```bash
curl -s -X POST http://localhost:8088/graphql -H 'Content-Type: application/json' -d '{"query":"{ health }"}'
```

Expect: `{ "data": { "health": "ok" } }`.

## 6. Error Reference

| Error                                 | Reason                            | Fix                                          |
| ------------------------------------- | --------------------------------- | -------------------------------------------- |
| document.id required                  | Missing `id`                      | Provide `id` field                           |
| Provide either query or weightedQuery | Both supplied                     | Remove one                                   |
| feed failed ...                       | Schema mismatch / Vespa not ready | Check field names & types / container health |
| invalid JSON from Vespa               | Wrong port or Vespa not ready     | Ensure query port (8100) & health            |
| No vector results                     | Missing embedding or dim mismatch | Feed vectors with correct length             |

## 7. End-to-End Quick Script

```bash
# Start (assuming docker compose service names: vespa, search-service)
docker compose up -d vespa search-service

# Deploy
curl -s -X POST http://localhost:8088/graphql -H 'Content-Type: application/json' -d '{"query":"mutation($a:String!,$s:JSON!){ deployApp(appId:$a, schemaJson:$s) }","variables":{"a":"saas","s":{"tensor_dim":128,"schema_fields":[{"name":"discount","type":"float","indexing":"attribute | summary"}]}}}'

# Feed
a_embedding='[0.1,0.2,0.3,0.05,0.0,0.11,0.2,0.4]' # truncated example (length must = tensor_dim if used fully)
curl -s -X POST http://localhost:8088/graphql -H 'Content-Type: application/json' -d '{"query":"mutation($a:String!,$d:JSON!){ upsertProduct(appId:$a, doc:$d) }","variables":{"a":"saas","d":{"tenant_id":"saas","id":"sku-1","name":"Trail Shoe","categories":["shoes"],"price":99.0,"embedding":[0.1,0.2,0.3,0.05,0.0,0.11,0.2,0.4]}}}'

# Search
curl -s -X POST http://localhost:8088/graphql -H 'Content-Type: application/json' -d '{"query":"query($i:SearchInput!){ search(input:$i){ results{ id name score } meta{ totalResults } } }","variables":{"i":{"tenantId":"saas","query":"trail shoe","mode":"HYBRID","vector":{"embedding":[0.1,0.2,0.3,0.05,0.0,0.11,0.2,0.4]}}}}'
```

## 8. Future Enhancements (Ideas)

- Batch feed endpoint
- Multiple document types per app
- Rich geo filtering & ranking
- Advanced ranking feature controls
- Facet caching & selection state handling

## 9. Checklist When Adding a New App

1. Decide tensor dimension & geo requirement.
2. List custom fields (type + indexing directives).
3. Deploy (auto or `deployApp`).
4. Validate deployment success.
5. Feed sample docs (ensure embedding length).
6. Run lexical, vector, hybrid queries.
7. Add facets & presets if needed.
8. Monitor performance (executionTime in response).

---

## 10. Schema Migrations & Validation Overrides

Certain schema changes are considered destructive by Vespa and are blocked unless you explicitly acknowledge them using `validation-overrides.xml`. The dynamic deploy supports passing boolean flags in `schemaJson` to generate this file automatically:

Supported flags (set to `true` to include):

```json
{
  "allow_cluster_removal": true, // enables <allow>content-cluster-removal</allow>
  "allow_field_type_change": true, // enables <allow>field-type-change</allow>
  "validation_overrides_until": "2025-12-31" // optional date override
}
```

Example deploy (changing tensor dimension — requires field-type-change):

```graphql
mutation DeployApp($app: String!, $schema: JSON!) {
  deployApp(appId: $app, schemaJson: $schema)
}
```

Variables:

```json
{
  "app": "saas",
  "schema": {
    "tensor_dim": 128,
    "allow_field_type_change": true,
    "validation_overrides_until": "2025-12-31"
  }
}
```

Best practices instead of destructive changes:

1. Avoid shrinking or changing tensor dimensions in-place. Deploy a new logical app (namespace) or introduce a new field (e.g. `embedding_v2`) while keeping the old one until reindex completes.
2. For evolving vector dimensions, plan a dual-feed period: write both `embedding` and `embedding_v2`, query on the new one once populated, then remove the old field in a later deploy with `allow_field_type_change` if required.
3. Only use overrides once you have taken backups / can re-feed all source data.
4. Keep a stable physical content cluster id (configure `SEARCH_CONTENT_CLUSTER_ID`) to avoid repeated cluster removal overrides.

If you see an error like:

```
field-type-change: Document type 'product': Field 'embedding' changed ...
```

Either:

- Revert and migrate via an additive approach (recommended), or
- Re-run deploy including `"allow_field_type_change": true` (will invalidate existing field data).

---

### Operator Prefix Migration

All filter operators should now use a double underscore `__` prefix (e.g. `__gte`, `__lte`, `__in`, `__eq`). The legacy `$gte` / `$lte` / `$in` / `$eq` forms are still parsed for backward compatibility but are deprecated and will be removed in a future version.

Summary:

| New     | Legacy | Meaning               |
| ------- | ------ | --------------------- |
| \_\_gte | $gte   | Greater than or equal |
| \_\_lte | $lte   | Less than or equal    |
| \_\_eq  | $eq    | Equality              |
| \_\_in  | $in    | Value in list         |

Update clients to emit the `__` form only.

**Done.** Update this guide when schema generator or GraphQL API evolves.
