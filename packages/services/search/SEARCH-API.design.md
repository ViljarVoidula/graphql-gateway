# Dynamic Search API Design Document (Updated Implementation Alignment)

## Executive Summary

This document outlines the design for a new, developer-friendly search API that replaces the current complex GraphQL query structure with an intuitive, flexible, and powerful search system. The new API emphasizes dynamic field selection, configurable faceting, and JavaScript developer experience while maintaining high performance and scalability.

### Key Improvements

- **Simplified API Surface**: Reduced from 10+ required parameters to 1-2 essential ones
- **Dynamic Field Selection**: Intelligent field selection system supporting nested payload access
- **Flexible Faceting**: Customer-configurable facets for any field including nested payload properties
- **JavaScript-First Design**: Intuitive parameter naming and structure
- **Performance Optimized**: Only fetch and compute what's requested
- **Hybrid Search (Lexical + Vector)**: Combine BM25/text and neural vectors using Reciprocal Rank Fusion (RRF)
- **Taxonomy-Aware**: Hierarchical category facets, breadcrumbs, and rollups
  categorical: { limit: 20 },
- **Relevance Controls**: Typo tolerance, field boosting, dynamic weighting, and priority boosting

## Proposed API Design

### Core Query Structure

    categorical: { sort: 'VALUE_ASC' },

```graphql
query ProductSearch($input: SearchInput!) {
    range: {
      buckets: 5,
      ranges: [
        { min: 0, max: 1000, label: 'Under $1,000' },
        { min: 1000, max: 5000, label: '$1,000 - $5,000' },
        { min: 5000, max: 10000, label: '$5,000 - $10,000' },
        { min: 10000, max: 999999, label: 'Over $10,000' },
      ]
    range: {
      buckets: 5,
      ranges: [
        { min: 0, max: 1000, label: 'Under $1,000' },
        { min: 1000, max: 5000, label: '$1,000 - $5,000' },
        { min: 5000, max: 10000, label: '$5,000 - $10,000' },
        { min: 10000, max: 999999, label: 'Over $10,000' },
      ],
    },
        value
        count
        selected
      }
      ranges {
        min
        max
        buckets {
          min
    categorical: { sort: 'VALUE_ASC' }, // S, M, L, XL order
          count
        }
      }
  }
  suggestions
    categorical: { limit: 15 },
      query
      executionTime
      totalResults
    }
  }
}
```

## Complete GraphQL Schema (Current Implemented Subset)

    range: {
      ranges: [
        { min: 4.5, max: 5.0, label: '4.5+ Stars' },
        { min: 4.0, max: 4.5, label: '4.0+ Stars' },
        { min: 3.0, max: 4.0, label: '3.0+ Stars' },
      ],
    },

appId: String!

# Search query (optional - if empty, returns all results)

# Provide either a plain string OR a weighted term map for fine-grained control

query: String

# Weighted query: map of term -> weight (e.g., { "winter": 0.5, "jacket": 1, "red": 1 })

weightedQuery: JSONObject

# Language for text search (defaults to "en")

language: String = "en"

# Search mode (lexical, vector, or hybrid)

mode: SearchMode = HYBRID

# Lexical search options (boosts, weights)

lexical: LexicalOptions

# Vector search options (embedding source, topK, filters)

vector: VectorOptions

# Hybrid search config (RRF and weighting)

hybrid: HybridOptions

# Dynamic field selection

fields: FieldSelection

# Filtering

filters: JSONObject

# Taxonomy options (hierarchical faceting, rollups)

taxonomy: TaxonomyOptions

# Variation handling (collapse, representative variants)

variations: VariationsOptions

# Dynamic faceting configuration

facets: [FacetConfig!]

# Sorting

sort: [SortInput!]

# Pagination

pagination: PaginationInput

# Typo tolerance and suggestions

typo: TypoOptions
suggest: SuggestOptions

# Geo distance search (filter by radius around a point; optionally sort by distance)

geo: GeoDistanceInput

# Search features to enable/disable (enum flags)

features: [Feature!] = []

# Custom boosts

boosts: [BoostRule!]
}

enum SearchMode {
LEXICAL
VECTOR
HYBRID
}

input LexicalOptions {

# Field boosts (applied at retrieval or scoring)

fieldBoosts: [FieldBoost!]

# Minimum should match behavior where supported

minimumShouldMatch: String
}

input FieldBoost {
field: String!
weight: Float! # e.g., name: 5.0, brand: 2.0
}

input VectorOptions {

# Provide the embedding directly, send an image (base64),

# or request server-side embedding from the query text

embedding: [Float!]
imageBase64: String
model: String # server-side embedding model id (if embedding/image not provided)
topK: Int = 100
embeddingField: String = "payload.embedding"
normalize: Boolean = true
}

"""
SearchInput validation rules (server-side):

- Accept at most one of `query` or `weightedQuery`.
- When both are provided, either prefer `weightedQuery` or return a validation error.
- Weights should be non-negative floats; normalize if desired.
  """

"""
VectorOptions validation rules (server-side):

- Accept exactly one of:
  - embedding (client-provided vector), or
  - imageBase64 (server computes embedding from image), or
  - model (server computes embedding from query text)
- If more than one source is provided, prefer `embedding` and ignore others, or return a validation error.
- Enforce image size/type limits when `imageBase64` is used (e.g., max 5MB; JPEG/PNG/WebP).
  """

input HybridOptions {

# Reciprocal Rank Fusion parameter k

rrfK: Int = 60

# Optional blending weights (post-merge rescoring)

lexicalWeight: Float = 0.5
vectorWeight: Float = 0.5

# Optional recency or popularity blending

recencyWeight: Float = 0.0
popularityWeight: Float = 0.0
}

# Dynamic field selection system

input FieldSelection {

# Include these specific fields (supports dot notation)

include: [String!]

# Exclude these fields

exclude: [String!]

# Preset field groups

preset: FieldPreset

# Include all payload fields matching pattern

payloadPattern: String
}

enum FieldPreset {
MINIMAL # id, name, price only
BASIC # id, name, brand, price, image
DETAILED # all main fields + selected payload
COMPLETE # everything including full payload
}

# Dynamic facet configuration (discriminated with per-type options)

"""
Only one of the options objects should be provided based on `type`.
Validated server-side with oneOf semantics.
"""
input FacetConfig {

# Field to facet on (supports dot notation for payload)

field: String!

# Facet type discriminator

type: FacetType!

# Human-readable label

label: String

# Options per facet type (provide the one matching `type`)

categorical: CategoricalFacetOptions
range: RangeFacetOptions
dateRange: DateRangeFacetOptions
boolean: BooleanFacetOptions
hierarchy: HierarchyOptions
}

enum FacetType {
CATEGORICAL # For discrete values (brand, color, etc.)
RANGE # For numeric ranges (price, rating)
DATE_RANGE # For date ranges
BOOLEAN # For true/false values
HIERARCHY # For hierarchical taxonomy (e.g., category path)
}

enum FacetSort {
COUNT_DESC # Most common first
COUNT_ASC # Least common first
VALUE_ASC # Alphabetical
VALUE_DESC # Reverse alphabetical
}

input CategoricalFacetOptions {
limit: Int = 10
sort: FacetSort = COUNT_DESC
}

input RangeFacetOptions {
buckets: Int
ranges: [RangeInput!]
min: Float
max: Float
}

input DateRangeFacetOptions {

# ISO-8601 duration or server-supported keyword (e.g., DAY, WEEK, MONTH)

interval: String
ranges: [DateRangeInput!]
}

input BooleanFacetOptions {

# Reserved for future use

dummy: Boolean
}

input RangeInput {
min: Float!
max: Float!
label: String
}

input DateRangeInput {
from: String!
to: String!
label: String
}

input SortInput {
field: String!
direction: SortDirection = ASC
}

enum SortDirection {
ASC
DESC
}

input PaginationInput {

# Offset-based pagination

offset: Int = 0
limit: Int = 20

# OR cursor-based pagination

cursor: String

# Maximum limit (for safety)

maxLimit: Int = 100
}

enum Feature {
FACETS
SUGGESTIONS
HIGHLIGHTING
ANALYTICS
}

input TaxonomyOptions {

# Field containing hierarchical taxonomy path

pathField: String = "taxonomy.path" # e.g., "Jewelry>Watches>Luxury"

# Separator for path segments

separator: String = ">"

# Whether to compute hierarchical facets

hierarchicalFacets: Boolean = true

# Roll up counts to ancestors

rollup: Boolean = true

# Optionally limit max depth

maxDepth: Int

# Optional filtering by a selected path

selectedPath: String
}

input VariationsOptions {

# Collapse variants by a field (e.g., parent_id, product_group_id)

collapseBy: String = "parent_id"

# Return top-N representative variants per collapsed group

topN: Int = 1

# How to choose representative variants

representativeSort: [SortInput!]

# Return all variants in a separate array on the product result

includeAll: Boolean = false
}

input TypoOptions {

# Enable fuzzy matching where supported

fuzzy: Boolean = true

# 1 or 2 edits (Levenshtein)

maxEdits: Int = 2

# Prefix not considered for fuzziness

prefixLength: Int = 1

# Treat transpositions as a single edit

transpositions: Boolean = true

# Enable automatic fuzziness based on query length

auto: Boolean = true
}

input SuggestOptions {
enabled: Boolean = true
limit: Int = 5
types: [SuggestType!] = [TERM, PHRASE, POPULAR]
sourceFields: [String!] = ["name", "brand"]
}

enum SuggestType {
TERM
PHRASE
POPULAR
DID_YOU_MEAN
}

# Geo distance types

input GeoPointInput {
lat: Float!
lon: Float!
}

input GeoDistanceInput {

# Path to a geo position field in your document store (e.g., Vespa position field)

field: String = "location"

# Center point

point: GeoPointInput!

# Search radius in meters

radiusMeters: Int!

# When true, sort ascending by computed distance

sortByDistance: Boolean = true

# Name of the distance field to project back

distanceField: String = "distanceMeters"
}

input BoostRule {

# Field or expression to boost

field: String

# When condition as a filter (applies boost if matches)

when: JSONObject

# Boost factor or function

weight: Float = 1.0
function: BoostFunction = LINEAR
}

enum BoostFunction {
LINEAR
LOG
EXP
SIGMOID
}

````

### Response Types

```graphql
type SearchResponse {
  # Dynamic result structure based on field selection
  results: [ProductResult!]!

  # Pagination information
  pagination: PaginationResponse!

  # Dynamic facets based on configuration (consider @defer for faster TTFB)
  facets: [FacetResult!]!

  # Search suggestions (consider @defer)
  suggestions: [Suggestion!]!

  # Search metadata
  meta: SearchMeta!
}

type Suggestion {
  text: String!
  type: SuggestType!
  score: Float
}

# Dynamic product result - fields included based on selection
type ProductResult {
  id: ID!
  name: String
  brand: String
  price: Float
  priceDiscounted: Float
  image: String
  url: String
  payload: JSONObject
  # Engagement & ranking signals
  views: Int
  popularity: Float
  priority: Int
  # Taxonomy (current implementation derives breadcrumbs from first categories entry; future: dedicated path field)
  categoryPath: String
  breadcrumbs: [Taxon!]
  # Variations (parsed from JSON string field); parent/selection metadata pending
  variations: [VariationResult!]
  # Media (derived from mediaImages/mediaVideos arrays in index)
  media: [MediaItem!]
  # Internal categories array retained (not exposed directly here)
  # Distance & relevance
  distanceMeters: Float
  score: Float
  scoreBreakdown: ScoreBreakdown
  # Highlighting (planned)
  highlights: [Highlight!]
}

type VariationResult { id: ID!, sku: String, name: String, price: Float, priceDiscounted: Float, image: String, payload: JSONObject }

type Taxon {
  name: String!
  path: String!
  level: Int!
}

type ScoreBreakdown { lexical: Float, vector: Float, recency: Float, popularity: Float, boosts: Float, finalScore: Float }

type MediaItem { id: String!, url: String!, type: String!, hash: String! }

type Highlight {
  field: String!
  fragments: [String!]!
}

type PaginationResponse {
  hasMore: Boolean!
  total: Int!
  offset: Int!
  limit: Int!
  cursor: String
  nextCursor: String
}

union FacetResult =
    CategoricalFacetResult
  | RangeFacetResult
  | BooleanFacetResult
  | HierarchyFacetResult

type CategoricalFacetResult {
  field: String!
  label: String!
  values: [FacetValue!]!
  hasSelection: Boolean!
}

type RangeFacetResult {
  field: String!
  label: String!
  min: Float
  max: Float
  buckets: [RangeBucket!]
  hasSelection: Boolean!
}

type BooleanFacetResult {
  field: String!
  label: String!
  values: [FacetValue!]!
  hasSelection: Boolean!
}

type HierarchyFacetResult {
  field: String!
  label: String!
  nodes: [HierarchyNode!]!
  hasSelection: Boolean!
}

type HierarchyNode {
  value: String!
  count: Int!
  level: Int!
  path: String!
  selected: Boolean!
  children: [HierarchyNode!]
}

type FacetValue {
  value: String!
  count: Int!
  selected: Boolean!
}

type RangeBucket {
  min: Float!
  max: Float!
  count: Int!
  selected: Boolean!
}

type SearchMeta {
  query: String
  executionTime: Int! # milliseconds
  totalResults: Int!
  language: String!
  appliedFilters: JSONObject
  suggestions: [String!]!
  schemaVersion: String!
  capabilitiesHash: String!
}

"""
Client discovery for dynamic UIs and safe configurations
"""
type SearchCapabilities {
  appId: String!
  schemaVersion: String!
  searchableFields: [String!]!
  payloadPrefixes: [String!]!
  facetableFields: [FacetableField!]!
  sortableFields: [String!]!
  defaultSort: [SortInput!]
  limits: CapabilitiesLimits!
}

type FacetableField {
  field: String!
  type: FacetType!
  suggested: FacetConfig
}

type CapabilitiesLimits {
  maxFacets: Int!
  maxBuckets: Int!
  maxIncludePaths: Int!
}
````

## Field Selection System Design

The field selection system allows JavaScript developers to specify exactly which fields they need, optimizing both query performance and payload size.

### Field Selection Examples

````javascript
// Minimal fields for product listing
const searchInput = {
  appId: 'shop-123',
  query: 'rolex',
  fields: {
    preset: 'MINIMAL', // Returns: id, name, price
  },
};
// Specific fields with payload access
const searchInput = {
  appId: 'shop-123',
  query: 'rolex',
  fields: {
    include: [
      'id',
      'name',
      'brand',
      'price',
      'image',
      'payload.material', // Nested payload access
      'payload.is_preowned', // Boolean flags
      'payload.certification', // Complex nested data
    ],
  },

// Pattern-based payload inclusion
const searchInput = {
  appId: 'shop-123',
  query: 'rolex',
  fields: {
    preset: 'BASIC',
    payloadPattern: 'metadata.*', // Include all metadata fields
  },
};
// Exclude sensitive data
const searchInput = {
  appId: 'shop-123',
  query: 'rolex',
  fields: {
    preset: 'DETAILED',
    exclude: ['payload.cost', 'payload.supplier_info'],
  },
};

### Field Selection Logic

1. **Start with preset** (if specified)
2. **Add include fields** (with dot notation support)
3. **Apply payload patterns** (regex-like matching)
4. **Remove exclude fields**
5. **Optimize query** based on final field list

## Dynamic Faceting Architecture

### Facet Configuration Examples

```javascript
// Jewelry store faceting
const jewelryFacets = [
  {
    field: 'brand',
    type: 'CATEGORICAL',
    label: 'Brand',
    limit: 20,
  },
  {
    field: 'payload.material',
    type: 'CATEGORICAL',
    label: 'Material',
    sort: 'VALUE_ASC',
  },
  {
    field: 'payload.is_preowned',
    type: 'BOOLEAN',
    label: 'Condition',
  },
  {
    field: 'price',
    type: 'RANGE',
    label: 'Price Range',
    buckets: 5,
    ranges: [
      { min: 0, max: 1000, label: 'Under $1,000' },
      { min: 1000, max: 5000, label: '$1,000 - $5,000' },
      { min: 5000, max: 10000, label: '$5,000 - $10,000' },
      { min: 10000, max: 999999, label: 'Over $10,000' },
    ],
  },
];

// Clothing store faceting
const clothingFacets = [
  {
    field: 'payload.size',
    type: 'CATEGORICAL',
    label: 'Size',
  categorical: { sort: 'VALUE_ASC' }, // S, M, L, XL order
  },
  {
    field: 'payload.color',
    type: 'CATEGORICAL',
    label: 'Color',
  categorical: { limit: 15 },
  },
  {
    field: 'payload.season',
    type: 'CATEGORICAL',
    label: 'Season',
  },
  {
    field: 'payload.rating',
    type: 'RANGE',
    label: 'Customer Rating',
    ranges: [
      { min: 4.5, max: 5.0, label: '4.5+ Stars' },
      { min: 4.0, max: 4.5, label: '4.0+ Stars' },
      { min: 3.0, max: 4.0, label: '3.0+ Stars' },
    ],
  },
];
````

### Facet Processing Logic

1. **Parse field paths** - Support dot notation for nested payload access
2. **Determine field types** - Auto-detect or use explicit configuration
3. **Build aggregations** - Vespa grouping/aggregations or service-side post-aggregation
4. **Apply filters** - Respect existing filter state for drill-down
5. **Format responses** - Consistent structure regardless of source field
6. **Hierarchy support** - When `FacetType = HIERARCHY`, split taxonomy path by separator, compute level and roll-up counts

## Usage Examples

### Complete Search Examples

#### Basic Product Search

```javascript
const basicSearch = {
  appId: 'jewelry-store-123',
  query: 'rolex submariner',
  language: 'en',
  fields: {
    preset: 'BASIC',
  },
  pagination: {
    limit: 12,
  },
};
```

#### Advanced E-commerce Search

```javascript
const advancedSearch = {
  appId: 'jewelry-store-123',
  query: 'rolex',
  fields: {
    include: [
      'id',
      'name',
      'brand',
      'price',
      'priceDiscounted',
      'image',
      'payload.material',
      'payload.is_preowned',
      'payload.certification',
      'payload.year',
      'payload.model',
      'media',
    ],
  },
  filters: {
    price: { __gte: 1000, __lte: 10000 },
    'payload.is_preowned': false,
    brand: { __in: ['Rolex', 'Omega', 'Cartier'] },
  },
  facets: [
    { field: 'brand', type: 'CATEGORICAL', label: 'Brand' },
    { field: 'payload.material', type: 'CATEGORICAL', label: 'Material' },
    { field: 'price', type: 'RANGE', label: 'Price', range: { buckets: 6 } },
    {
      field: 'payload.year',
      type: 'RANGE',
      label: 'Year',
      range: { buckets: 10 },
    },
  ],
  sort: [{ field: 'price', direction: 'ASC' }],
  pagination: {
    offset: 0,
    limit: 24,
  },
  features: ['SUGGESTIONS', 'HIGHLIGHTING'],
};
```

#### Visual/Image Search

```javascript
// Search using an image (base64-encoded) – the server will compute an embedding
const imageSearch = {
  appId: 'jewelry-store-123',
  query: null, // optional with image
  vector: {
    imageBase64: inputImageBase64,
    model: 'open-clip-ViT-B-32', // example model id
    topK: 100,
  },
  fields: { preset: 'BASIC' },
  pagination: { limit: 12 },
};
```

#### Weighted Query Search

```javascript
// Weighted query lets you boost specific terms directly
const weightedSearch = {
  appId: 'fashion-store-456',
  // query omitted in favor of weightedQuery
  weightedQuery: {
    winter: 0.5,
    jacket: 1,
    red: 1,
  },
  fields: { preset: 'BASIC' },
  pagination: { limit: 20 },
};
```

#### Fashion Store Search

```javascript
const fashionSearch = {
  appId: 'fashion-store-456',
  query: 'winter jacket',
  fields: {
    preset: 'DETAILED',
    exclude: ['payload.supplier_cost', 'payload.internal_notes'],
  },
  filters: {
    'payload.season': 'winter',
    'payload.gender': 'unisex',
    inStock: true,
  },
  facets: [
    {
      field: 'payload.size',
      type: 'CATEGORICAL',
      label: 'Size',
      categorical: { sort: 'VALUE_ASC' },
    },
    {
      field: 'payload.color',
      type: 'CATEGORICAL',
      label: 'Color',
      categorical: { limit: 20 },
    },
    { field: 'payload.material', type: 'CATEGORICAL', label: 'Material' },
    { field: 'price', type: 'RANGE', label: 'Price', range: { buckets: 4 } },
    { field: 'payload.rating', type: 'RANGE', label: 'Rating' },
  ],
  sort: [
    { field: 'payload.popularity_score', direction: 'DESC' },
    { field: 'price', direction: 'ASC' },
  ],
  pagination: {
    limit: 20,
  },
};
```

## Implementation Strategy

### Status Summary vs Original Plan

Implemented now:

- Core search query with hybrid default mode
- Basic facets (categorical with simple grouping; range/date/hierarchy placeholders)
- Vector + lexical combination scaffolding (no explicit RRF scoring breakdown exposed yet)
- New commerce fields (views, popularity, priority)
- Media arrays unified into GraphQL MediaItem list
- Variations parsed from stored JSON string
- Breadcrumb derivation (simple split of first category path)

Not yet implemented (Roadmap):

- Field include/exclude/payloadPattern enforcement beyond summary presets
- Hierarchical facets with rollup counts & multi-level grouping
- Range/date facet specialized bucket mapping
- ScoreBreakdown population & highlighting extraction
- Parent/variant collapsing logic (VariationsOptions currently accepted but unused)
- SearchCapabilities discovery endpoint & meta.schemaVersion / capabilitiesHash
- Applied filters echo in meta
- Cursor-based pagination
- Media hashing strategy optimization (currently md5 of URL)
- Distinct categoryPath field in index (currently first categories element)

These gaps are annotated inline above; future work will close parity.

- Maintain two retrievers:
  - Lexical retriever (Vespa text matching with ranking profiles)
  - Vector retriever (Vespa nearestNeighbor using remote-generated embeddings)
- Retrieve topK from each retriever and merge with Reciprocal Rank Fusion (RRF):
  score_rrf(doc) = Σ 1 / (k + rank_in_list) where k = rrfK
- Optional re-scoring with blending weights (lexical/vector/recency/popularity) and BoostRule application.
- Apply variation collapsing and representative selection.
- Build taxonomy facets (hierarchical) and other facets on the filtered set.

### 1. Vespa Backend Integration

#### Schema and Ranking Overview

- Define Vespa document schema for products with fields matching our GraphQL model (id, name, brand, price, payload.\*, location, embedding, etc.).
- Create ranking profiles for lexical-only, vector-only (nearestNeighbor), and hybrid (combine using RRF-like formulation or Vespa rank-phase).
- Configure a position field for geo queries (for distance filters/sort) and a tensor field for embeddings.

#### Query Mapping

- String `query`: map to Vespa yql with match operators across selected fields and ranking profile.
- `weightedQuery`: build a weighted query by composing multiple match clauses each with a per-term boost.
- `vector.imageBase64` or `vector.model`: call remote embedding service; pass resulting vector to Vespa nearestNeighbor on the embedding field.
- `geo`: add geo distance filters and optional order by distance in ranking or sort.
- `facets`: compute via Vespa grouping/aggregations or post-filter aggregation depending on needs and performance.

### 2. Service Layer Implementation

#### Request Flow (Vespa)

- Validate GraphQL input (mutual exclusivity: query vs. weightedQuery; vector source selection; image limits).
- If `vector.imageBase64` or `vector.model` is present, call the remote embedding service; cache embeddings where appropriate.
- Construct Vespa query (YQL or JSON HTTP params):
  - Map text queries and weighted terms to clauses with boosts.
  - Add nearestNeighbor clause with embedding vector when in vector/hybrid mode.
  - Add geo distance constraints and sorting.
  - Request facets via grouping and use @defer to deliver later if desired.
- Execute against Vespa HTTP endpoint; map hits to `ProductResult` including optional `distanceMeters`.

### 3. GraphQL Schema Updates

```rust

```

## Performance Considerations

### 1. Vespa Schema & Ranking Strategy

#### Core Setup

- Define fields with proper indexing/search annotations (e.g., index/search/attribute/summary).
- Set up a tensor field for embeddings with appropriate dimensions and distance metric.
- Configure a position field for geo (lat, lon) and enable distance functions in ranking.
- Create ranking profiles for lexical, vector (nearestNeighbor), and hybrid (combine signals; emulate RRF or use rank-phase).

### 2. Caching Strategy

#### Query Result Caching

```rust
use sha2::{Digest, Sha256};

fn cache_key(input: &SearchInput, schema_version: &str, capabilities_hash: &str) -> String {
  // Include only fields that affect the result set
  let payload = serde_json::json!({
    "appId": input.app_id,
    "query": input.query,
  "weightedQuery": input.weighted_query,
    "filters": input.filters,
    "facets": input.facets,
    "sort": input.sort,
    "pagination": input.pagination,
    "geo": input.geo,
    "features": input.features,
  });
  let mut hasher = Sha256::new();
  hasher.update(serde_json::to_vec(&payload).unwrap());
  hasher.update(schema_version.as_bytes());
  hasher.update(capabilities_hash.as_bytes());
  format!("search:v1:{}", hex::encode(hasher.finalize()))
}
```

#### Facet Result Caching

```rust
use sha2::{Digest, Sha256};

fn facet_cache_key(input: &SearchInput, schema_version: &str, capabilities_hash: &str) -> String {
  // Facets depend on filters, facet configs, and geo partitioning
  let payload = serde_json::json!({
    "appId": input.app_id,
    "filters": input.filters,
    "facets": input.facets,
    "geo": input.geo,
  "weightedQuery": input.weighted_query,
  });
  let mut hasher = Sha256::new();
  hasher.update(serde_json::to_vec(&payload).unwrap());
  hasher.update(schema_version.as_bytes());
  hasher.update(capabilities_hash.as_bytes());
  format!("facets:v1:{}", hex::encode(hasher.finalize()))
}
```

### 3. Query Optimization

#### Aggregation Pipeline Optimization

```rust

```

## Migration Strategy

### Phase 1: Parallel Implementation (Weeks 1-2)

#### 1. Create New Models and Schema

```rust

```

#### 2. Implement Core Search Method

- Create `build_search_pipeline()` method
- Implement basic text search
- Add field selection logic
- Keep existing methods working

#### 3. Add Basic Faceting Support

- Implement categorical facets
- Add range facets
- Test with existing data

### Phase 2: Feature Completion

#### 1. Advanced Features

- Add search suggestions
- Implement typo correction
- Add field boosting and dynamic weighting
- Add priority boosting

#### 2. Performance Optimizations

- Add caching layer
- Implement dynamic indexing
- Query optimization
- Connection pooling

#### 3. Testing and Validation

- Unit tests for all new functionality
- Integration tests with real data
- Performance benchmarking
- Load testing

## Testing Strategy

### 1. Unit Tests

### 2. Integration Tests

### 3. Performance Tests

## Benefits of the New Design

### 1. Developer Experience

- **Single input parameter** instead of 10+ separate parameters
- **Intuitive naming** following JavaScript conventions
- **TypeScript-friendly** structure with clear types
- **Incremental complexity** - start simple, add features as needed

### 2. Performance

- **Dynamic field selection** - only fetch what's needed via Vespa summary classes
- **Efficient ranking** - use ranking profiles and precomputed features
- **Intelligent caching** - cache query responses and remote embeddings
- **Schema tuning** - choose attribute/index settings for fields used in filters/facets/sorts

### 3. Flexibility

- **Customer-specific faceting** - any field can become a facet
- **Nested payload access** - deep access to product metadata
- **Multiple field selection strategies** - presets, explicit includes/excludes, patterns
- **Configurable features** - enable/disable features per app

### 4. Scalability

- **Pagination strategies** - both offset and cursor-based
- **Caching layers** - Redis for query results and facet data
- **Index optimization** - automatic index creation for commonly used facets
- **Query optimization** - pipeline optimization based on query patterns

## Conclusion

This new search API design provides a significant improvement over the current implementation by:

1. **Simplifying the developer experience** with intuitive parameters and flexible configuration
2. **Providing dynamic faceting capabilities** that can adapt to any customer's product schema
3. **Optimizing performance** through intelligent field selection and caching strategies
4. **Supporting scalability** with efficient database operations and indexing strategies

The migration strategy ensures a smooth transition from the existing API while maintaining backward compatibility during the rollout phase.

### Next Steps

1. **Implementation Phase 1**: Create parallel implementation with basic search functionality
2. **Testing and Validation**: Comprehensive testing with real customer data
3. **Performance Optimization**: Implement caching and indexing strategies
4. **Client Migration**: Gradual rollout with feature flags and monitoring
5. **Documentation**: Complete API documentation and migration guides

The new API will provide customers with a powerful, flexible, and performant search experience that can adapt to their specific product catalogs and business requirements.
