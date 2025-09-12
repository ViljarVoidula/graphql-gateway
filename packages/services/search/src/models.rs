use async_graphql::{Enum, InputObject, SimpleObject, Union};
use serde::{Deserialize, Serialize};

// Enums
#[derive(Enum, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum SearchMode { Lexical, Vector, Hybrid }

#[derive(Enum, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum FacetType { Categorical, Range, DateRange, Boolean, Hierarchy }

#[derive(Enum, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum FacetSort { CountDesc, CountAsc, ValueAsc, ValueDesc }

#[derive(Enum, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum SortDirection { Asc, Desc }

#[derive(Enum, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum FieldPreset { Minimal, Basic, Detailed, Complete }

#[derive(Enum, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum Feature { Facets, Suggestions, Highlighting, Analytics }

#[derive(Enum, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum SuggestType { Term, Phrase, Popular, DidYouMean }

#[derive(Enum, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum BoostFunction { Linear, Log, Exp, Sigmoid }

// Inputs
#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct FieldBoost { pub field: String, pub weight: f32 }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct LexicalOptions { pub field_boosts: Option<Vec<FieldBoost>>, pub minimum_should_match: Option<String> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct VectorOptions {
    pub embedding: Option<Vec<f32>>,
    pub image_base64: Option<String>,
    pub model: Option<String>,
    pub top_k: Option<i32>,
    pub embedding_field: Option<String>,
    pub normalize: Option<bool>,
}

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct HybridOptions {
    pub rrf_k: Option<i32>,
    pub lexical_weight: Option<f32>,
    pub vector_weight: Option<f32>,
    pub recency_weight: Option<f32>,
    pub popularity_weight: Option<f32>,
}

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct FieldSelection {
    pub include: Option<Vec<String>>, 
    pub exclude: Option<Vec<String>>, 
    pub preset: Option<FieldPreset>, 
    pub payload_pattern: Option<String>
}

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct CategoricalFacetOptions { pub limit: Option<i32>, pub sort: Option<FacetSort> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct RangeInput { pub min: f32, pub max: f32, pub label: Option<String> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct RangeFacetOptions { pub buckets: Option<i32>, pub ranges: Option<Vec<RangeInput>>, pub min: Option<f32>, pub max: Option<f32> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct DateRangeInput { pub from: String, pub to: String, pub label: Option<String> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct DateRangeFacetOptions { pub interval: Option<String>, pub ranges: Option<Vec<DateRangeInput>> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct BooleanFacetOptions { pub dummy: Option<bool> }

#[derive(InputObject, Serialize, Deserialize, Clone)]
pub struct FacetConfig {
    pub field: String,
    pub r#type: FacetType,
    pub label: Option<String>,
    pub categorical: Option<CategoricalFacetOptions>,
    pub range: Option<RangeFacetOptions>,
    pub date_range: Option<DateRangeFacetOptions>,
    pub boolean: Option<BooleanFacetOptions>,
    pub hierarchy: Option<TaxonomyOptions>,
}

impl Default for FacetConfig {
    fn default() -> Self {
    Self { field: String::new(), r#type: FacetType::Categorical, label: None, categorical: None, range: None, date_range: None, boolean: None, hierarchy: None }
    }
}

#[derive(InputObject, Serialize, Deserialize, Clone)]
pub struct SortInput { pub field: String, pub direction: Option<SortDirection> }

impl Default for SortInput {
    fn default() -> Self { Self { field: String::new(), direction: Some(SortDirection::Asc) } }
}

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct PaginationInput { pub offset: Option<i32>, pub limit: Option<i32>, pub cursor: Option<String>, pub max_limit: Option<i32> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct TypoOptions { pub fuzzy: Option<bool>, pub max_edits: Option<i32>, pub prefix_length: Option<i32>, pub transpositions: Option<bool>, pub auto: Option<bool> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct SuggestOptions { pub enabled: Option<bool>, pub limit: Option<i32>, pub types: Option<Vec<SuggestType>>, pub source_fields: Option<Vec<String>> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct GeoPointInput { pub lat: f32, pub lon: f32 }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct GeoDistanceInput { pub field: Option<String>, pub point: GeoPointInput, pub radius_meters: i32, pub sort_by_distance: Option<bool>, pub distance_field: Option<String> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct BoostRule { pub field: Option<String>, pub when: Option<serde_json::Value>, pub weight: Option<f32>, pub function: Option<BoostFunction> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct TaxonomyOptions { pub path_field: Option<String>, pub separator: Option<String>, pub hierarchical_facets: Option<bool>, pub rollup: Option<bool>, pub max_depth: Option<i32>, pub selected_path: Option<String> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
pub struct VariationsOptions { pub collapse_by: Option<String>, pub top_n: Option<i32>, pub representative_sort: Option<Vec<SortInput>>, pub include_all: Option<bool> }

#[derive(InputObject, Default, Serialize, Deserialize, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct SearchInput {
    /// Deprecated: use tenantId instead (will be removed in a future version)
    #[graphql(deprecation = "Use tenantId instead")]
    pub app_id: Option<String>,
    /// Preferred logical tenant / namespace. If absent falls back to appId then config default.
    pub tenant_id: Option<String>,
    pub query: Option<String>,
    pub weighted_query: Option<serde_json::Value>,
    pub language: Option<String>,
    pub mode: Option<SearchMode>,
    pub lexical: Option<LexicalOptions>,
    pub vector: Option<VectorOptions>,
    pub hybrid: Option<HybridOptions>,
    pub fields: Option<FieldSelection>,
    pub filters: Option<serde_json::Value>,
    pub taxonomy: Option<TaxonomyOptions>,
    pub variations: Option<VariationsOptions>,
    pub facets: Option<Vec<FacetConfig>>,
    pub sort: Option<Vec<SortInput>>,
    pub pagination: Option<PaginationInput>,
    pub typo: Option<TypoOptions>,
    pub suggest: Option<SuggestOptions>,
    pub geo: Option<GeoDistanceInput>,
    pub features: Option<Vec<Feature>>,
    pub boosts: Option<Vec<BoostRule>>,
}

// Outputs (simplified for MVP)
#[derive(SimpleObject, Clone)]
pub struct Suggestion { pub text: String, pub r#type: SuggestType, pub score: Option<f32> }

#[derive(SimpleObject, Default, Clone)]
pub struct FacetValue { pub value: String, pub count: i32, pub selected: bool }

#[derive(SimpleObject, Default, Clone)]
pub struct RangeBucket { pub min: f32, pub max: f32, pub count: i32, pub selected: bool, pub label: Option<String> }

#[derive(SimpleObject, Default, Clone)]
pub struct CategoricalFacetResult { pub field: String, pub label: String, pub values: Vec<FacetValue>, pub has_selection: bool }

#[derive(SimpleObject, Default, Clone)]
pub struct RangeFacetResult { pub field: String, pub label: String, pub min: Option<f32>, pub max: Option<f32>, pub buckets: Option<Vec<RangeBucket>>, pub has_selection: bool }

#[derive(SimpleObject, Default, Clone)]
pub struct BooleanFacetResult { pub field: String, pub label: String, pub values: Vec<FacetValue>, pub has_selection: bool }

#[derive(SimpleObject, Default, Clone)]
pub struct PaginationResponse { pub has_more: bool, pub total: i32, pub offset: i32, pub limit: i32, pub cursor: Option<String>, pub next_cursor: Option<String> }

#[derive(SimpleObject, Default, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct MediaItem { pub id: String, pub url: String, pub r#type: String, pub hash: String }

#[derive(SimpleObject, Default, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct Highlight { pub field: String, pub fragments: Vec<String> }

#[derive(SimpleObject, Default, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct Taxon { pub name: String, pub path: String, pub level: i32 }

#[derive(SimpleObject, Default, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct ScoreBreakdown { pub lexical: Option<f32>, pub vector: Option<f32>, pub recency: Option<f32>, pub popularity: Option<f32>, pub boosts: Option<f32>, pub final_score: Option<f32> }

#[derive(SimpleObject, Default, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct VariationResult {
    pub id: Option<String>,
    pub sku: Option<String>,
    pub name: Option<String>,
    pub price: Option<f32>,
    pub price_discounted: Option<f32>,
    pub image: Option<String>,
    pub payload: Option<serde_json::Value>,
}

#[derive(SimpleObject, Default, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct ProductResult {
    pub id: String,
    pub name: Option<String>,
    pub brand: Option<String>,
    pub description_en: Option<String>,
    pub price: Option<f32>,
    pub price_discounted: Option<f32>,
    pub image: Option<String>,
    pub url: Option<String>,
    pub payload: Option<serde_json::Value>,
    // Engagement / ranking
    pub views: Option<i32>,
    pub popularity: Option<f32>,
    pub priority: Option<i32>,
    // Taxonomy
    pub category_path: Option<String>,
    pub breadcrumbs: Option<Vec<Taxon>>,
    // Variations
    pub parent_id: Option<String>,
    pub is_parent: Option<bool>,
    pub selected_variant_id: Option<String>,
    pub variations: Option<Vec<VariationResult>>,
    // Media (unified)
    pub media: Option<Vec<MediaItem>>,
    // Raw category array still stored for internal use (not exposed directly when camelCase)
    pub categories: Option<Vec<String>>,
    // Signals
    pub distance_meters: Option<f32>,
    pub score: Option<f32>,
    pub score_breakdown: Option<ScoreBreakdown>,
    // Highlighting
    pub highlights: Option<Vec<Highlight>>,
}

#[derive(SimpleObject, Default, Clone)]
pub struct HierarchyNode { pub value: String, pub count: i32, pub level: i32, pub path: String, pub selected: bool, pub children: Option<Vec<HierarchyNode>> }

#[derive(SimpleObject, Default, Clone)]
pub struct HierarchyFacetResult { pub field: String, pub label: String, pub nodes: Vec<HierarchyNode>, pub has_selection: bool }

#[derive(Union, Clone)]
pub enum FacetResultUnion {
    Categorical(CategoricalFacetResult),
    Range(RangeFacetResult),
    Boolean(BooleanFacetResult),
    Hierarchy(HierarchyFacetResult),
}

#[derive(SimpleObject, Default, Clone)]
pub struct SearchMeta { pub query: Option<String>, pub execution_time: i32, pub total_results: i32, pub language: String }

#[derive(SimpleObject, Default, Clone)]
pub struct SearchResponse {
    pub results: Vec<ProductResult>,
    pub pagination: PaginationResponse,
    pub facets: Vec<FacetResultUnion>,
    pub suggestions: Vec<Suggestion>,
    pub meta: SearchMeta,
}

// Operational / internal stats
#[derive(SimpleObject, Default, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct IndexStats {
    /// Logical application / namespace id
    pub app_id: String,
    /// Total number of active documents for primary product type
    pub document_count: i64,
    /// Ratio (0-1) of used memory if available from Vespa metrics
    pub memory_used_ratio: Option<f32>,
    /// Approximate used memory bytes (if exposed by metrics)
    pub memory_used_bytes: Option<i64>,
    /// Approximate total memory bytes (if exposed separately; may be None if only ratio reported)
    pub memory_total_bytes: Option<i64>,
    /// Disk bytes used for index / content (best-effort from metrics)
    pub disk_used_bytes: Option<i64>,
    /// Total disk capacity bytes (best-effort)
    pub disk_total_bytes: Option<i64>,
    /// Used disk ratio (0-1) computed if not provided
    pub disk_used_ratio: Option<f32>,
    /// Document type these stats refer to
    pub doc_type: String,
}

#[derive(SimpleObject, Default, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct VespaStats {
    /// Raw metrics JSON (truncated if large)
    pub raw: String,
}
