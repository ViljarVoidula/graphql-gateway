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
    // Image processing and S3 configuration
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    pub aws_region: String,
    // Optional custom S3 endpoint (e.g., for MinIO: http://localhost:9000)
    pub aws_endpoint: Option<String>,
    // Optional public base URL for serving files (aka "accessPoint")
    pub aws_public_base_url: Option<String>,
    pub default_image_bucket: String,
    pub image_processing_timeout_ms: u64,
    pub max_image_size_mb: u64,
    // Optional: skip S3 HEAD existence check (useful if MinIO/bucket policy denies HEAD)
    pub s3_skip_head_check: bool,
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
    
    // Image processing and S3 configuration
    // Defaults requested by user; env vars override these
    let aws_access_key_id = get("AWS_ACCESS_KEY_ID").or_else(|| Some("username".to_string()));
    let aws_secret_access_key = get("AWS_SECRET_ACCESS_KEY").or_else(|| Some("password".to_string()));
    let aws_region = get("AWS_REGION").unwrap_or_else(|| "eu-central-1".to_string());
    // Support multiple env var names for convenience
    let aws_endpoint = get("AWS_S3_ENDPOINT").or_else(|| get("AWS_ENDPOINT")).or_else(|| Some("http://localhost:9000".to_string()));
    // "accessPoint" naming compat (maps to public base URL used for downloads)
    let aws_public_base_url = get("AWS_S3_PUBLIC_BASE_URL")
        .or_else(|| get("AWS_S3_ACCESS_POINT"))
        .or_else(|| get("AWS_ACCESS_POINT"))
        // Default to MinIO Console download endpoint with query-style base (requires public access or valid session cookies)
        .or_else(|| Some("http://localhost:9001/api/v1/buckets/forgemaster/objects/download?preview=true&prefix=".to_string()));
    let default_image_bucket = get("DEFAULT_IMAGE_BUCKET").unwrap_or_else(|| "forgemaster".to_string());
    let image_processing_timeout_ms: u64 = get("IMAGE_PROCESSING_TIMEOUT_MS").and_then(|s| s.parse().ok()).unwrap_or(30000);
    let max_image_size_mb: u64 = get("MAX_IMAGE_SIZE_MB").and_then(|s| s.parse().ok()).unwrap_or(50);
    let s3_skip_head_check: bool = get("S3_SKIP_HEAD_CHECK").and_then(|s| s.parse().ok()).unwrap_or(true);

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
            aws_access_key_id,
            aws_secret_access_key,
            aws_region,
            aws_endpoint,
            aws_public_base_url,
            default_image_bucket,
            image_processing_timeout_ms,
            max_image_size_mb,
            s3_skip_head_check,
        }
    }
}
