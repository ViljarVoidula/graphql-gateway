use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub port: u16,
    pub mongodb_uri: String,
    pub mongodb_retry_writes: bool,
    pub database_name: String,
    pub redis_url: String,
    pub search_service_url: String,
    pub embeddings_service_url: String,
    pub http_timeout_ms: u64,
    pub http_user_agent: String,
    pub http_max_retries: u32,
    pub http_retry_backoff_ms: u64,
    pub enable_scheduler: bool,
    pub default_batch_size: usize,
    pub max_concurrent_syncs: usize,
}

impl Config {
    pub fn from_env() -> Self {
    let get = |k: &str| std::env::var(k).ok();

    let mongodb_uri = get("MONGODB_URI").unwrap_or_else(|| "mongodb://localhost:27017".to_string());
    let database_name = get("DATABASE_NAME").unwrap_or_else(|| "ingestion".to_string());
    let mongodb_retry_writes: bool = get("MONGODB_RETRY_WRITES").and_then(|s| s.parse().ok()).unwrap_or(false);
    let redis_url = get("REDIS_URL").unwrap_or_else(|| "redis://localhost:6379".to_string());
    let search_service_url = get("SEARCH_SERVICE_URL").unwrap_or_else(|| "http://localhost:8088".to_string());
    let embeddings_service_url = get("EMBEDDINGS_SERVICE_URL").unwrap_or_else(|| "http://localhost:8090".to_string());
    let port: u16 = get("PORT").and_then(|s| s.parse().ok()).unwrap_or(8089);
    let http_timeout_ms: u64 = get("HTTP_TIMEOUT_MS").and_then(|s| s.parse().ok()).unwrap_or(60000);
    let http_user_agent = get("HTTP_USER_AGENT").unwrap_or_else(|| "ingestion-service/1.0".to_string());
    let http_max_retries: u32 = get("HTTP_MAX_RETRIES").and_then(|s| s.parse().ok()).unwrap_or(3);
    let http_retry_backoff_ms: u64 = get("HTTP_RETRY_BACKOFF_MS").and_then(|s| s.parse().ok()).unwrap_or(500);
    let enable_scheduler: bool = get("ENABLE_SCHEDULER").and_then(|s| s.parse().ok()).unwrap_or(true);
    let default_batch_size: usize = get("DEFAULT_BATCH_SIZE").and_then(|s| s.parse().ok()).unwrap_or(10);
    let max_concurrent_syncs: usize = get("MAX_CONCURRENT_SYNCS").and_then(|s| s.parse().ok()).unwrap_or(1);

        Self {
            port,
            mongodb_uri,
            mongodb_retry_writes,
            database_name,
            redis_url,
            search_service_url,
            embeddings_service_url,
            http_timeout_ms,
            http_user_agent,
            http_max_retries,
            http_retry_backoff_ms,
            enable_scheduler,
            default_batch_size,
            max_concurrent_syncs,
        }
    }
}
