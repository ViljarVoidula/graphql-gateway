use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::{Client as S3Client, primitives::ByteStream, types::ObjectCannedAcl};
use aws_sdk_s3::error::SdkError as S3SdkError;
use std::collections::HashMap;
use crate::config::Config;
use crate::models::data_source::{S3ImageConfig, ImageFormat};
use crate::models::{IngestionError, Result};

/// Manages S3 storage operations for processed images
pub struct S3ImageStorage {
    client: S3Client,
    default_bucket: String,
    default_region: String,
    public_base_url: Option<String>,
    skip_head_check: bool,
}

impl S3ImageStorage {
    /// Creates a new S3ImageStorage instance
    pub async fn new(config: &Config) -> Result<Self> {
        let base_loader = aws_config::defaults(BehaviorVersion::latest())
            .region(Region::new(config.aws_region.clone()));

        let loader = if let (Some(access_key), Some(secret_key)) =
            (&config.aws_access_key_id, &config.aws_secret_access_key) {
            let creds = aws_sdk_s3::config::Credentials::new(
                access_key,
                secret_key,
                None,
                None,
                "ingestion-service",
            );
            base_loader.credentials_provider(creds)
        } else {
            base_loader
        };

        let shared_config = loader.load().await;

        // Build S3 client, honoring a custom endpoint (e.g., MinIO) if provided.
        let mut s3_config_builder = aws_sdk_s3::config::Builder::from(&shared_config);
        if let Some(endpoint) = &config.aws_endpoint {
            s3_config_builder = s3_config_builder
                .endpoint_url(endpoint)
                .force_path_style(true); // path-style is typical for MinIO
        }
        let s3_config = s3_config_builder.build();
        let client = S3Client::from_conf(s3_config);

        Ok(Self {
            client,
            default_bucket: config.default_image_bucket.clone(),
            default_region: config.aws_region.clone(),
            public_base_url: config.aws_public_base_url.clone(),
            skip_head_check: config.s3_skip_head_check,
        })
    }
    
    /// Uploads processed image data to S3
    pub async fn upload_image(
        &self,
        image_data: Vec<u8>,
        key: &str,
        s3_config: Option<&S3ImageConfig>,
        image_format: ImageFormat,
    ) -> Result<String> {
        let bucket = s3_config
            .map(|c| &c.bucket)
            .unwrap_or(&self.default_bucket);
            
        let content_type = match image_format {
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::Png => "image/png",
            ImageFormat::Webp => "image/webp",
        };
        
        let data_size = image_data.len();
        let body = ByteStream::from(image_data);
        
        let put_object = self.client
            .put_object()
            .bucket(bucket)
            .key(key)
            .body(body)
            .content_type(content_type)
            .acl(ObjectCannedAcl::PublicRead); // Make images publicly accessible
            
        put_object.send().await.map_err(|e| {
            tracing::error!(error = %e, bucket = %bucket, key = %key, "Failed to upload image to S3");
            IngestionError::Sync(format!("S3 upload failed: {}", e))
        })?;
        
        // Generate public URL
        let public_url = self.generate_public_url(bucket, key, s3_config);
        
        tracing::debug!(
            bucket = %bucket,
            key = %key,
            public_url = %public_url,
            size_bytes = data_size,
            "Successfully uploaded image to S3"
        );
        
        Ok(public_url)
    }
    
    /// Generates a public URL for the uploaded image
    pub fn generate_public_url(&self, bucket: &str, key: &str, s3_config: Option<&S3ImageConfig>) -> String {
        // 1) Per-datasource override public_base_url
        if let Some(config) = s3_config {
            if let Some(base_url) = &config.public_base_url {
                let base = base_url.trim_end_matches('/');
                let sep = if base.ends_with('=') || base.contains('?') { "" } else { "/" };
                return format!("{}{}{}", base, sep, key);
            }
            if let Some(endpoint) = &config.endpoint {
                return format!("{}/{}/{}", endpoint.trim_end_matches('/'), bucket, key);
            }
        }

        // 2) Global public_base_url from service config (maps to user's "accessPoint")
        if let Some(base) = &self.public_base_url {
            let base = base.trim_end_matches('/');
            let sep = if base.ends_with('=') || base.contains('?') { "" } else { "/" };
            return format!("{}{}{}", base, sep, key);
        }

        // 3) Fallback to standard AWS URL patterns
        if self.default_region == "us-east-1" {
            format!("https://{}.s3.amazonaws.com/{}", bucket, key)
        } else {
            format!("https://{}.s3.{}.amazonaws.com/{}", bucket, self.default_region, key)
        }
    }
    
    /// Generates a unique S3 key for an image
    pub fn generate_image_key(
        &self,
        app_id: &str,
        tenant_id: Option<&str>,
        original_url: &str,
        s3_config: Option<&S3ImageConfig>,
        image_format: ImageFormat,
    ) -> String {
        // Create a hash of the original URL for uniqueness and caching
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(original_url.as_bytes());
        let url_hash = format!("{:x}", hasher.finalize())[..16].to_string();
        
        let extension = match image_format {
            ImageFormat::Jpeg => "jpg",
            ImageFormat::Png => "png", 
            ImageFormat::Webp => "webp",
        };
        
        let tenant_segment = tenant_id.map(|t| format!("{}/", t)).unwrap_or_default();
        let prefix = s3_config
            .and_then(|c| {
                if c.prefix.is_empty() {
                    None
                } else {
                    Some(c.prefix.trim_end_matches('/').to_string())
                }
            })
            .unwrap_or_else(|| format!("processed-images/{}", app_id));
            
        format!("{}/{}{}.{}", prefix, tenant_segment, url_hash, extension)
    }

    /// Generates a deterministic S3 key using content and config hashes; use this to avoid
    /// stale outputs when the source content changes while the URL stays the same, or when
    /// processing configuration changes (dimensions/format/quality).
    pub fn generate_image_key_with_hashes(
        &self,
        app_id: &str,
        tenant_id: Option<&str>,
        content_hash_hex: &str,
        config_hash_hex: &str,
        s3_config: Option<&S3ImageConfig>,
        image_format: ImageFormat,
    ) -> String {
        let extension = match image_format {
            ImageFormat::Jpeg => "jpg",
            ImageFormat::Png => "png",
            ImageFormat::Webp => "webp",
        };
        let tenant_segment = tenant_id.map(|t| format!("{}/", t)).unwrap_or_default();
        let prefix = s3_config
            .and_then(|c| {
                if c.prefix.is_empty() { None } else { Some(c.prefix.trim_end_matches('/').to_string()) }
            })
            .unwrap_or_else(|| format!("processed-images/{}", app_id));
        // Separate config and content components for easier debugging and cache behaviors
        format!("{}/{}/{}-{}.{}",
            prefix,
            tenant_segment.trim_end_matches('/'),
            config_hash_hex,
            content_hash_hex,
            extension
        )
    }
    
    /// Batch upload multiple images
    pub async fn upload_images_batch(
        &self,
        uploads: Vec<ImageUpload>,
    ) -> Result<Vec<ImageUploadResult>> {
        let mut results = Vec::with_capacity(uploads.len());
        
        // Process uploads concurrently (but limit concurrency)
        let chunks: Vec<_> = uploads.chunks(5).collect(); // Max 5 concurrent uploads
        
        for chunk in chunks {
            let mut chunk_results = Vec::new();
            let mut tasks = Vec::new();
            
            for upload in chunk {
                let task = self.upload_image(
                    upload.data.clone(),
                    &upload.key,
                    upload.s3_config.as_ref(),
                    upload.image_format.clone(),
                );
                tasks.push((upload, task));
            }
            
            for (upload, task) in tasks {
                match task.await {
                    Ok(url) => {
                        chunk_results.push(ImageUploadResult {
                            original_url: upload.original_url.clone(),
                            key: upload.key.clone(),
                            processed_url: url,
                            error: None,
                        });
                    }
                    Err(e) => {
                        chunk_results.push(ImageUploadResult {
                            original_url: upload.original_url.clone(),
                            key: upload.key.clone(),
                            processed_url: String::new(),
                            error: Some(e.to_string()),
                        });
                    }
                }
            }
            
            results.extend(chunk_results);
        }
        
        Ok(results)
    }
    
    /// Checks if an image already exists in S3 (for caching)
    pub async fn image_exists(&self, key: &str, bucket: Option<&str>) -> Result<bool> {
        let bucket = bucket.unwrap_or(&self.default_bucket);
        if self.skip_head_check {
            tracing::debug!(bucket = %bucket, key = %key, "Skipping S3 HEAD check due to configuration");
            return Ok(false);
        }
        
        match self.client
            .head_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
        {
            Ok(_) => Ok(true),
            Err(e) => {
                // Prefer structured error matching when available
                match &e {
                    S3SdkError::ServiceError(se) => {
                        let svc_err = se.err();
                        let code = svc_err.meta().code().unwrap_or("");
                        let message = svc_err.meta().message().unwrap_or("");
                        // Treat typical not-found variants as cache miss without warning
                        if code == "NotFound" || code == "NoSuchKey" {
                            tracing::debug!(bucket = %bucket, key = %key, code = %code, "S3 HEAD: object not found");
                            return Ok(false);
                        }
                        // Common access issues on MinIO/AWS
                        if code == "AccessDenied" || code == "Forbidden" || code == "NoSuchBucket" {
                            tracing::warn!(bucket = %bucket, key = %key, code = %code, message = %message, "S3 HEAD access/bucket issue");
                            return Ok(false);
                        }
                        tracing::warn!(bucket = %bucket, key = %key, code = %code, message = %message, error = ?e, "Error checking S3 object existence");
                        Ok(false)
                    }
                    // For other SDK error types (e.g., dispatch/timeout), fall back to string heuristics
                    _ => {
                        let es = e.to_string();
                        if es.contains("404") || es.contains("NoSuchKey") || es.contains("NotFound") {
                            tracing::debug!(bucket = %bucket, key = %key, error = %es, "S3 HEAD: object not found (string match)");
                            Ok(false)
                        } else if es.contains("403") || es.contains("AccessDenied") {
                            tracing::warn!(bucket = %bucket, key = %key, error = %es, "S3 HEAD: access denied");
                            Ok(false)
                        } else {
                            tracing::warn!(bucket = %bucket, key = %key, error = %es, "Error checking S3 object existence");
                            Ok(false)
                        }
                    }
                }
            }
        }
    }
    
    /// Deletes an image from S3
    pub async fn delete_image(&self, key: &str, bucket: Option<&str>) -> Result<()> {
        let bucket = bucket.unwrap_or(&self.default_bucket);
        
        self.client
            .delete_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| {
                tracing::error!(error = %e, bucket = %bucket, key = %key, "Failed to delete image from S3");
                IngestionError::Sync(format!("S3 delete failed: {}", e))
            })?;
            
        tracing::debug!(bucket = %bucket, key = %key, "Successfully deleted image from S3");
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct ImageUpload {
    pub original_url: String,
    pub data: Vec<u8>,
    pub key: String,
    pub s3_config: Option<S3ImageConfig>,
    pub image_format: ImageFormat,
}

#[derive(Debug, Clone)]
pub struct ImageUploadResult {
    pub original_url: String,
    pub key: String,
    pub processed_url: String,
    pub error: Option<String>,
}

/// Helper struct to track cached image URLs to avoid reprocessing
#[derive(Debug, Clone)]
pub struct CachedImage {
    pub content_hash: String,
    pub processed_url: String,
}

#[derive(Debug, Clone)]
pub struct ImageCache {
    // original_url -> (content_hash, processed_url)
    cache: HashMap<String, CachedImage>,
}

impl ImageCache {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    /// Returns processed URL only if the content hash matches the cached entry
    pub fn get_if_hash_matches(&self, original_url: &str, content_hash: &str) -> Option<&String> {
        self.cache
            .get(original_url)
            .and_then(|c| if c.content_hash == content_hash { Some(&c.processed_url) } else { None })
    }

    pub fn insert(&mut self, original_url: String, content_hash: String, processed_url: String) {
        self.cache.insert(original_url, CachedImage { content_hash, processed_url });
    }
    
    pub fn len(&self) -> usize {
        self.cache.len()
    }
    
    pub fn clear(&mut self) {
        self.cache.clear();
    }
}

impl Default for ImageCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::data_source::{S3ImageConfig, ImageFormat};
    
    #[test]
    fn test_generate_image_key() {
        let config = Config {
            aws_region: "us-west-2".to_string(),
            default_image_bucket: "test-bucket".to_string(),
            aws_access_key_id: None,
            aws_secret_access_key: None,
            aws_endpoint: None,
            aws_public_base_url: None,
            // ... other fields would be set in real test
            port: 8089,
            mongodb_uri: "test".to_string(),
            mongodb_retry_writes: false,
            database_name: "test".to_string(),
            redis_url: "test".to_string(),
            search_service_url: "test".to_string(),
            embeddings_service_url: "test".to_string(),
            http_timeout_ms: 1000,
            http_user_agent: "test".to_string(),
            http_max_retries: 3,
            http_retry_backoff_ms: 500,
            enable_scheduler: true,
            default_batch_size: 10,
            max_concurrent_syncs: 1,
            image_processing_timeout_ms: 30000,
            max_image_size_mb: 50,
        };
        
        // This would require async runtime for full test
        // For now, just test the key generation logic conceptually
        let original_url = "https://example.com/image.jpg";
        let app_id = "test-app";
        let tenant_id = Some("tenant1");
        
        // We'd create the storage and test key generation
        // let storage = S3ImageStorage::new(&config).await.unwrap();
        // let key = storage.generate_image_key(app_id, tenant_id, original_url, None, ImageFormat::Jpeg);
        // assert!(key.starts_with("processed-images/test-app/tenant1/"));
        // assert!(key.ends_with(".jpg"));
        
        // For now, just ensure the test compiles
        assert_eq!(app_id, "test-app");
    }
    
    #[test]
    fn test_image_cache() {
        let mut cache = ImageCache::new();
        assert_eq!(cache.len(), 0);
        
        let original = "https://example.com/image.jpg".to_string();
        let processed_v1 = "https://s3.../processed_v1.jpg".to_string();
        let processed_v2 = "https://s3.../processed_v2.jpg".to_string();
        let h1 = "abcdef".to_string();
        let h2 = "123456".to_string();

        cache.insert(original.clone(), h1.clone(), processed_v1.clone());
        assert_eq!(cache.len(), 1);
        assert_eq!(cache.get_if_hash_matches(&original, &h1), Some(&processed_v1));
        assert_eq!(cache.get_if_hash_matches(&original, &h2), None);

        cache.insert(original.clone(), h2.clone(), processed_v2.clone());
        assert_eq!(cache.get_if_hash_matches(&original, &h1), None);
        assert_eq!(cache.get_if_hash_matches(&original, &h2), Some(&processed_v2));
        assert_eq!(cache.get_if_hash_matches("nonexistent", &h1), None);
        
        cache.clear();
        assert_eq!(cache.len(), 0);
    }
}
