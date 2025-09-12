use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub vespa_endpoint: String,
    pub vespa_deploy_endpoint: String,
    pub app_id: String,
    // Physical Vespa content cluster id we will keep stable across logical app deployments
    pub content_cluster_id: String,
    pub schema_version: String,
    pub auto_deploy: bool,
    pub default_tensor_dim: i32,
    pub default_geo_enabled: bool,
    pub default_tenant_id: String,
    // Max number of documents to send per batch POST /document/v1/ (newline separated operations)
    pub feed_batch_size: usize,
    // Max number of concurrent batch requests when using bulk upsert
    pub feed_max_concurrency: usize,
    // Embeddings service integration
    pub embeddings_service_url: Option<String>,
    pub enable_remote_embeddings: bool,
    pub embeddings_use_msgpack: bool,
    pub embeddings_text_model: Option<String>,
    pub embeddings_image_model: Option<String>,
    pub embeddings_timeout_ms: u64,
    // Bulk ingestion behavior
    pub bulk_allow_partial: bool,
    pub bulk_fallback_single: bool,
    // Partial / fuzzy query tuning
    pub partial_min_token_len: usize,
    pub partial_fields: Vec<String>,
    // Experimental ngram/prefix indexing toggle
    pub enable_ngram_fields: bool,
    pub ngram_min_len: usize,
    // Hybrid ranking weights defaults
    pub hybrid_lexical_weight: f32,
    pub hybrid_vector_weight: f32,
}

impl Config {
    pub fn from_env() -> Self {
    let vespa_endpoint = env::var("VESPA_ENDPOINT").unwrap_or_else(|_| "http://localhost:8100".to_string());
    let vespa_deploy_endpoint = env::var("VESPA_DEPLOY_ENDPOINT").unwrap_or_else(|_| "http://localhost:19071".to_string());
    let app_id = env::var("APP_ID").unwrap_or_else(|_| "default-app".to_string());
    // Allow overriding a stable cluster id. Default to APP_ID for backward compatibility so we don't trigger removal.
    // Recommended to set SEARCH_CONTENT_CLUSTER_ID explicitly (e.g. default-app) early in lifecycle and keep it constant.
    let content_cluster_id = env::var("SEARCH_CONTENT_CLUSTER_ID").unwrap_or_else(|_| app_id.clone());
    let schema_version = env::var("SEARCH_SCHEMA_VERSION").unwrap_or_else(|_| "v1".to_string());
    let auto_deploy = env::var("SEARCH_AUTO_DEPLOY").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(true);
    let default_tensor_dim = env::var("SEARCH_DEFAULT_TENSOR_DIM").ok().and_then(|v| v.parse::<i32>().ok()).unwrap_or(768);
    let default_geo_enabled = env::var("SEARCH_DEFAULT_GEO_ENABLED").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(true);
    let default_tenant_id = env::var("DEFAULT_TENANT_ID").unwrap_or_else(|_| "saas".to_string());
    let feed_batch_size = env::var("SEARCH_FEED_BATCH_SIZE").ok().and_then(|v| v.parse::<usize>().ok()).unwrap_or(50);
    let feed_max_concurrency = env::var("SEARCH_FEED_MAX_CONCURRENCY").ok().and_then(|v| v.parse::<usize>().ok()).unwrap_or(4);
    let embeddings_service_url = env::var("EMBEDDINGS_SERVICE_URL").ok().or_else(|| Some("http://localhost:9200".to_string()));
    let enable_remote_embeddings = env::var("ENABLE_REMOTE_EMBEDDINGS").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(true);
    let embeddings_use_msgpack = env::var("EMBEDDINGS_USE_MSGPACK").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(true);
    let embeddings_text_model = env::var("EMBEDDINGS_TEXT_MODEL").ok().or_else(|| Some("Marqo/marqo-ecommerce-embeddings-B".to_string()));
    let embeddings_image_model = env::var("EMBEDDINGS_IMAGE_MODEL").ok().or_else(|| Some("Marqo/marqo-ecommerce-embeddings-B".to_string()));
    let embeddings_timeout_ms = env::var("EMBEDDINGS_TIMEOUT_MS").ok().and_then(|v| v.parse::<u64>().ok()).unwrap_or(1500);
    let bulk_allow_partial = env::var("SEARCH_BULK_ALLOW_PARTIAL").map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(true);
    let bulk_fallback_single = env::var("SEARCH_BULK_FALLBACK_SINGLE").map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
    let partial_min_token_len = env::var("SEARCH_PARTIAL_MIN_LEN").ok().and_then(|v| v.parse().ok()).unwrap_or(2);
    let partial_fields = env::var("SEARCH_PARTIAL_FIELDS").ok().map(|v| v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()).unwrap_or_else(|| vec!["name".into(), "brand".into(), "description_en".into(), "categories".into()]);
    let enable_ngram_fields = env::var("SEARCH_ENABLE_NGRAM").map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
    let ngram_min_len = env::var("SEARCH_NGRAM_MIN_LEN").ok().and_then(|v| v.parse().ok()).unwrap_or(3);
    let hybrid_lexical_weight = env::var("HYBRID_LEXICAL_WEIGHT").ok().and_then(|v| v.parse().ok()).unwrap_or(0.5);
    let hybrid_vector_weight = env::var("HYBRID_VECTOR_WEIGHT").ok().and_then(|v| v.parse().ok()).unwrap_or(0.5);
    Self { vespa_endpoint, vespa_deploy_endpoint, app_id, content_cluster_id, schema_version, auto_deploy, default_tensor_dim, default_geo_enabled, default_tenant_id, feed_batch_size, feed_max_concurrency, embeddings_service_url, enable_remote_embeddings, embeddings_use_msgpack, embeddings_text_model, embeddings_image_model, embeddings_timeout_ms, bulk_allow_partial, bulk_fallback_single, partial_min_token_len, partial_fields, enable_ngram_fields, ngram_min_len, hybrid_lexical_weight, hybrid_vector_weight }
    }
}
