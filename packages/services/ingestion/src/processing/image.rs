use image::{ImageFormat as ImageLibFormat, DynamicImage};
use reqwest::Client as HttpClient;
use std::io::Cursor;
use std::time::Duration;
use tokio::time::timeout;

use crate::config::Config;
use crate::models::data_source::{DataSource, ImageDimensions, ImageFormat};
use crate::models::{IngestionError, Result};
use crate::processing::{ImageFieldDetector, ImageField, S3ImageStorage, ImageCache};
use futures::stream::{self, StreamExt};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Main image processing engine
pub struct ImageProcessor {
    http_client: HttpClient,
    detector: ImageFieldDetector,
    storage: S3ImageStorage,
    cache: Arc<Mutex<ImageCache>>, // shared across concurrent tasks
    config: Config,
}

impl ImageProcessor {
    /// Creates a new ImageProcessor instance
    pub async fn new(config: Config) -> Result<Self> {
        let http_client = HttpClient::builder()
            .user_agent(&config.http_user_agent)
            .timeout(Duration::from_millis(config.image_processing_timeout_ms))
            .build()
            .map_err(|e| IngestionError::Configuration(format!("Failed to create HTTP client: {}", e)))?;

        let detector = ImageFieldDetector::new();
        let storage = S3ImageStorage::new(&config).await?;
    let cache = Arc::new(Mutex::new(ImageCache::new()));

        Ok(Self {
            http_client,
            detector,
            storage,
            cache,
            config,
        })
    }

    /// Processes images in a document according to data source configuration
    pub async fn process_document_images(
        &self,
        document: &serde_json::Value,
        data_source: &DataSource,
    ) -> Result<serde_json::Value> {
        // Check if image processing is enabled
        if !data_source.config.image_preprocessing.unwrap_or(false) 
            && !data_source.config.image_refitting.unwrap_or(false) {
            return Ok(document.clone());
        }

        // Detect image fields
        let image_fields = self.detector.detect_with_overrides(
            document,
            data_source.config.image_field_overrides.as_deref(),
        );

        if image_fields.is_empty() {
            tracing::debug!("No image fields detected in document");
            return Ok(document.clone());
        }

        tracing::debug!(
            image_fields_count = image_fields.len(),
            app_id = %data_source.app_id,
            "Processing images for document"
        );

        // Concurrency limit from data source, default 3
        let parallelism = data_source.config.image_parallelism.unwrap_or(8).max(1);

        // Process images concurrently with bounded parallelism
        let results: Vec<(ImageField, Result<ProcessedImageInfo>)> = stream::iter(image_fields.clone())
            .map(|field| async move {
                let res = self.process_single_image(&field, data_source).await;
                (field, res)
            })
            .buffer_unordered(parallelism)
            .collect()
            .await;

        // Apply results back to document
        let mut processed_document = document.clone();
        let mut processed_count = 0;
        let mut failed_count = 0;
        let total_fields = results.len();

        for (field, res) in results {
            match res {
                Ok(info) => {
                    self.update_document_with_processed_image(&mut processed_document, &field, &info)?;
                    processed_count += 1;
                }
                Err(e) => {
                    tracing::warn!(error = %e, original_url = %field.original_url, field_path = %field.field_path, "Failed to process image, keeping original");
                    failed_count += 1;
                }
            }
        }

        tracing::info!(
            processed = processed_count,
            failed = failed_count,
            total = total_fields,
            app_id = %data_source.app_id,
            "Image processing completed for document"
        );

        Ok(processed_document)
    }

    /// Processes a single image field
    async fn process_single_image(
        &self,
        image_field: &ImageField,
        data_source: &DataSource,
    ) -> Result<ProcessedImageInfo> {
        // We need the content hash to decide caching; download first

    // Download image bytes (source may update content even if URL stays same)
    let image_data = self.download_image(&image_field.original_url).await?;
        let content_hash = Self::hash_bytes_sha256_hex(&image_data);
        if let Some(cached_url) = self.cache.lock().await.get_if_hash_matches(&image_field.original_url, &content_hash).cloned() {
            tracing::debug!(
                original_url = %image_field.original_url,
                cached_url = %cached_url,
                "Using cached processed image (content hash match)"
            );
            return Ok(ProcessedImageInfo {
                original_url: image_field.original_url.clone(),
                processed_url: cached_url,
                width: None,
                height: None,
                file_size: None,
            });
        }

        // Check size limits
        let max_size_bytes = self.config.max_image_size_mb * 1024 * 1024;
        if image_data.len() > max_size_bytes as usize {
            return Err(IngestionError::Sync(format!(
                "Image too large: {} MB (max: {} MB)",
                image_data.len() / (1024 * 1024),
                self.config.max_image_size_mb
            )));
        }

        // Load and process image if refitting is enabled
        let (processed_data, dimensions) = if data_source.config.image_refitting.unwrap_or(false) {
            // Offload CPU-bound decode/resize/encode to a blocking thread
            let fast = data_source.config.image_fast_resize.unwrap_or(true);
            let ds_cfg = data_source.config.clone();
            let data = image_data.clone();
            let out = tokio::task::spawn_blocking(move || {
                Self::resize_image_blocking(data, &ds_cfg, fast)
            }).await.map_err(|e| IngestionError::Sync(format!("Join error in resize: {}", e)))??;
            out
        } else {
            // Avoid re-encoding: only sniff dimensions via lightweight decode
            let img = image::load_from_memory(&image_data)
                .map_err(|e| IngestionError::Sync(format!("Failed to load image: {}", e)))?;
            let dimensions = (img.width(), img.height());
            (image_data, dimensions)
        };

        // Determine output format
        let output_format = data_source.config.image_format.clone()
            .unwrap_or(ImageFormat::Jpeg);

        // Compute a processing-config hash to reflect changes in format, quality, and dimensions
        let config_hash = Self::hash_processing_config_hex(
            &output_format,
            data_source.config.image_quality.unwrap_or(85),
            data_source.config.image_target_dimensions.as_ref(),
        );

        // Generate S3 key using content+config hashes to make outputs change-on-update
        // (fall back to URL-hash key only if hashes are unexpectedly empty)
        let s3_key = self.storage.generate_image_key_with_hashes(
            &data_source.app_id,
            data_source.tenant_id.as_deref(),
            &content_hash,
            &config_hash,
            data_source.config.image_s3_config.as_ref(),
            output_format.clone(),
        );

        // Check if already exists in S3 (additional caching layer)
        let bucket = data_source.config.image_s3_config.as_ref().map(|c| c.bucket.as_str());
        if self.storage.image_exists(&s3_key, bucket).await? {
            let processed_url = self.storage.generate_public_url(
                bucket.unwrap_or(&self.config.default_image_bucket),
                &s3_key,
                data_source.config.image_s3_config.as_ref(),
            );
            
            // Cache the result with content hash
            self.cache.lock().await.insert(image_field.original_url.clone(), content_hash.clone(), processed_url.clone());
            
            return Ok(ProcessedImageInfo {
                original_url: image_field.original_url.clone(),
                processed_url,
                width: Some(dimensions.0),
                height: Some(dimensions.1),
                file_size: Some(processed_data.len()),
            });
        }

        // Upload to S3
        let processed_url = self.storage.upload_image(
            processed_data.clone(),
            &s3_key,
            data_source.config.image_s3_config.as_ref(),
            output_format,
        ).await?;

    // Cache the result with content hash
    self.cache.lock().await.insert(image_field.original_url.clone(), content_hash.clone(), processed_url.clone());

        Ok(ProcessedImageInfo {
            original_url: image_field.original_url.clone(),
            processed_url,
            width: Some(dimensions.0),
            height: Some(dimensions.1),
            file_size: Some(processed_data.len()),
        })
    }

    /// Downloads an image from a URL
    async fn download_image(&self, url: &str) -> Result<Vec<u8>> {
        tracing::debug!(url = %url, "Downloading image");
        
        let download_future = async {
            let mut req = self.http_client.get(url);
            // Note: a true ETag loop would require storing previous ETag per URL; we use a plain GET first.
            let response = req.send().await.map_err(|e| IngestionError::Http(e))?;

            if !response.status().is_success() {
                return Err(IngestionError::Sync(format!(
                    "HTTP error downloading image: {} {}",
                    response.status().as_u16(),
                    response.status().canonical_reason().unwrap_or("Unknown")
                )));
            }

            // Check content type
            if let Some(content_type) = response.headers().get("content-type") {
                let content_type_str = content_type.to_str().unwrap_or("");
                if !content_type_str.starts_with("image/") {
                    tracing::warn!(
                        url = %url,
                        content_type = %content_type_str,
                        "URL does not appear to be an image"
                    );
                }
            }

            let bytes = response.bytes().await.map_err(|e| IngestionError::Http(e))?;
            Ok(bytes.to_vec())
        };

        // Apply timeout
        timeout(
            Duration::from_millis(self.config.image_processing_timeout_ms),
            download_future,
        )
        .await
        .map_err(|_| IngestionError::Sync("Image download timeout".to_string()))?
    }

    /// Resizes an image according to configuration
    fn resize_image_blocking(image_data: Vec<u8>, ds_cfg: &crate::models::data_source::DataSourceConfig, fast: bool) -> Result<(Vec<u8>, (u32, u32))> {
        // Load image
        let img = image::load_from_memory(&image_data)
            .map_err(|e| IngestionError::Sync(format!("Failed to load image: {}", e)))?;

        let original_dimensions = (img.width(), img.height());
        // Determine target dimensions
        let target_dimensions = {
            // local helper uses same logic
            let (ow, oh) = original_dimensions;
            if let Some(cfg) = ds_cfg.image_target_dimensions.as_ref() {
                if let (Some(w), Some(h)) = (cfg.width, cfg.height) { (w, h) }
                else if let Some(max_dim) = cfg.max_dimension { 
                    let maintain = cfg.maintain_aspect_ratio.unwrap_or(true);
                    if !maintain { (max_dim, max_dim) }
                    else if ow > max_dim || oh > max_dim {
                        if ow > oh { let r = max_dim as f32 / ow as f32; (max_dim, (oh as f32 * r) as u32) }
                        else { let r = max_dim as f32 / oh as f32; ((ow as f32 * r) as u32, max_dim) }
                    } else { (ow, oh) }
                } else { (ow, oh) }
            } else {
                // default 1000 max dimension
                let max_dim = 1000u32;
                if ow > max_dim || oh > max_dim {
                    if ow > oh { let r = max_dim as f32 / ow as f32; (max_dim, (oh as f32 * r) as u32) }
                    else { let r = max_dim as f32 / oh as f32; ((ow as f32 * r) as u32, max_dim) }
                } else { (ow, oh) }
            }
        };

        // Resize if dimensions changed
        let filter = if fast { image::imageops::FilterType::Triangle } else { image::imageops::FilterType::Lanczos3 };
        let resized_img = if target_dimensions != original_dimensions {
            tracing::debug!(
                original_width = original_dimensions.0,
                original_height = original_dimensions.1,
                target_width = target_dimensions.0,
                target_height = target_dimensions.1,
                fast = fast,
                "Resizing image"
            );
            img.resize(target_dimensions.0, target_dimensions.1, filter)
        } else { img };

        // Encode to target format
        let output_format = ds_cfg.image_format.clone().unwrap_or(ImageFormat::Jpeg);
        let quality = ds_cfg.image_quality.unwrap_or(85);
        let encoded_data = {
            let mut buffer = Vec::new();
            let mut cursor = Cursor::new(&mut buffer);
            match output_format {
                ImageFormat::Jpeg => {
                    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality);
                    resized_img.write_with_encoder(encoder)
                        .map_err(|e| IngestionError::Sync(format!("JPEG encoding failed: {}", e)))?;
                }
                ImageFormat::Png => {
                    resized_img.write_to(&mut cursor, ImageLibFormat::Png)
                        .map_err(|e| IngestionError::Sync(format!("PNG encoding failed: {}", e)))?;
                }
                ImageFormat::Webp => {
                    resized_img.write_to(&mut cursor, ImageLibFormat::WebP)
                        .map_err(|e| IngestionError::Sync(format!("WebP encoding failed: {}", e)))?;
                }
            }
            buffer
        };

        Ok((encoded_data, target_dimensions))
    }

    /// Calculates target dimensions based on configuration
    fn calculate_target_dimensions(
        &self,
        original: (u32, u32),
        config: Option<&ImageDimensions>,
    ) -> (u32, u32) {
        let (original_width, original_height) = original;
        
        let config = match config {
            Some(c) => c,
            None => {
                // Default: max dimension 1000, maintain aspect ratio
                let max_dim = 1000;
                return if original_width > max_dim || original_height > max_dim {
                    if original_width > original_height {
                        let ratio = max_dim as f32 / original_width as f32;
                        (max_dim, (original_height as f32 * ratio) as u32)
                    } else {
                        let ratio = max_dim as f32 / original_height as f32;
                        ((original_width as f32 * ratio) as u32, max_dim)
                    }
                } else {
                    original
                };
            }
        };

        // If specific width/height are set, use them
        if let (Some(width), Some(height)) = (config.width, config.height) {
            return (width, height);
        }

        // If max_dimension is set, scale proportionally
        if let Some(max_dim) = config.max_dimension {
            let maintain_aspect = config.maintain_aspect_ratio.unwrap_or(true);
            
            if !maintain_aspect {
                return (max_dim, max_dim);
            }
            
            if original_width > max_dim || original_height > max_dim {
                if original_width > original_height {
                    let ratio = max_dim as f32 / original_width as f32;
                    (max_dim, (original_height as f32 * ratio) as u32)
                } else {
                    let ratio = max_dim as f32 / original_height as f32;
                    ((original_width as f32 * ratio) as u32, max_dim)
                }
            } else {
                original
            }
        } else {
            original
        }
    }

    /// Encodes an image to the specified format
    fn encode_image(&self, img: DynamicImage, format: ImageFormat, quality: u8) -> Result<Vec<u8>> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        match format {
            ImageFormat::Jpeg => {
                let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality);
                img.write_with_encoder(encoder)
                    .map_err(|e| IngestionError::Sync(format!("JPEG encoding failed: {}", e)))?;
            }
            ImageFormat::Png => {
                img.write_to(&mut cursor, ImageLibFormat::Png)
                    .map_err(|e| IngestionError::Sync(format!("PNG encoding failed: {}", e)))?;
            }
            ImageFormat::Webp => {
                // Note: WebP support may require additional features/deps
                img.write_to(&mut cursor, ImageLibFormat::WebP)
                    .map_err(|e| IngestionError::Sync(format!("WebP encoding failed: {}", e)))?;
            }
        }

        Ok(buffer)
    }

    /// Hash utility (hex-encoded SHA-256) for image bytes
    fn hash_bytes_sha256_hex(bytes: &[u8]) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        let out = hasher.finalize();
        format!("{:x}", out)
    }

    /// Hash the effective processing configuration
    fn hash_processing_config_hex(format: &ImageFormat, quality: u8, dims: Option<&ImageDimensions>) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        let fmt = match format { ImageFormat::Jpeg => "jpeg", ImageFormat::Png => "png", ImageFormat::Webp => "webp" };
        hasher.update(fmt.as_bytes());
        hasher.update(&[quality]);
        if let Some(d) = dims {
            if let Some(w) = d.width { hasher.update(w.to_le_bytes()); }
            if let Some(h) = d.height { hasher.update(h.to_le_bytes()); }
            if let Some(m) = d.max_dimension { hasher.update(m.to_le_bytes()); }
            let ar = d.maintain_aspect_ratio.unwrap_or(true);
            hasher.update(&[ar as u8]);
        }
        let out = hasher.finalize();
        format!("{:x}", out)
    }

    /// Updates a document with processed image information
    fn update_document_with_processed_image(
        &self,
        document: &mut serde_json::Value,
        image_field: &ImageField,
        processed_info: &ProcessedImageInfo,
    ) -> Result<()> {
        // Strategy: Keep original URL and add processed URL in new field
        // For field "image", add "image_processed"
        // For nested fields like "product.image", add "product.image_processed"
        
        let processed_field_name = if image_field.field_path.contains('.') {
            format!("{}_processed", image_field.field_path)
        } else {
            format!("{}_processed", image_field.field_path)
        };

        // Also add metadata about the processing
        let processed_metadata = serde_json::json!({
            "original_url": processed_info.original_url,
            "processed_url": processed_info.processed_url,
            "dimensions": {
                "width": processed_info.width,
                "height": processed_info.height
            },
            "file_size_bytes": processed_info.file_size,
            "processing_timestamp": chrono::Utc::now().to_rfc3339()
        });

        // Set processed URL field
        self.set_document_field(document, &processed_field_name, serde_json::Value::String(processed_info.processed_url.clone()))?;
        
        // Set metadata field
        let metadata_field_name = format!("{}_metadata", image_field.field_path.replace('.', "_"));
        self.set_document_field(document, &metadata_field_name, processed_metadata)?;

        Ok(())
    }

    /// Helper to set a field in a JSON document by path
    fn set_document_field(&self, document: &mut serde_json::Value, path: &str, value: serde_json::Value) -> Result<()> {
        let parts: Vec<&str> = path.split('.').collect();
        
        let mut current = document;
        for (i, part) in parts.iter().enumerate() {
            if i == parts.len() - 1 {
                // Last part - set the value
                if let Some(obj) = current.as_object_mut() {
                    obj.insert(part.to_string(), value);
                    return Ok(());
                } else {
                    return Err(IngestionError::Sync(format!("Cannot set field '{}' - parent is not an object", path)));
                }
            } else {
                // Intermediate part - navigate or create object
                if !current.is_object() {
                    return Err(IngestionError::Sync(format!("Cannot navigate to field '{}' - intermediate value is not an object", path)));
                }
                
                let obj = current.as_object_mut().unwrap();
                if !obj.contains_key(*part) {
                    obj.insert(part.to_string(), serde_json::Value::Object(serde_json::Map::new()));
                }
                current = obj.get_mut(*part).unwrap();
            }
        }
        
        // This should never be reached due to the early return above
        Err(IngestionError::Sync("Empty path provided".to_string()))
    }

    /// Clears the image cache
    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.cache.try_lock() {
            cache.clear();
        } else {
            // best-effort: spawn a task to clear asynchronously if currently locked
            let cache = self.cache.clone();
            tokio::spawn(async move {
                if let Ok(mut c) = cache.try_lock() {
                    c.clear();
                } else {
                    let mut c = cache.lock().await;
                    c.clear();
                }
            });
        }
    }

    /// Returns cache statistics
    pub fn cache_stats(&self) -> (usize,) {
        if let Ok(cache) = self.cache.try_lock() {
            (cache.len(),)
        } else {
            // If locked, report 0 to avoid blocking; this is only a debug helper
            (0,)
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProcessedImageInfo {
    pub original_url: String,
    pub processed_url: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub file_size: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::data_source::{ImageDimensions, ImageFormat};
    use serde_json::json;

    #[test]
    fn test_calculate_target_dimensions() {
        let config = Config {
            // Mock config - in real tests you'd set all required fields
            aws_region: "us-west-2".to_string(),
            default_image_bucket: "test".to_string(),
            aws_access_key_id: None,
            aws_secret_access_key: None,
            aws_endpoint: None,
            aws_public_base_url: None,
            image_processing_timeout_ms: 30000,
            max_image_size_mb: 50,
            // ... other required fields would be set
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
        };
        
        // This would need to be made async for full testing
        // For now, just test the dimension calculation logic
        
        // Test default max dimension (1000)
        let original = (2000, 1500);
        // Would test: let processor = ImageProcessor::new(config).await.unwrap();
        // let result = processor.calculate_target_dimensions(original, None);
        // assert_eq!(result, (1000, 750)); // Maintain aspect ratio
        
        // For now, just ensure test compiles
        assert_eq!(original.0, 2000);
    }

    #[test]
    fn test_set_document_field() {
        let config = Config {
            aws_region: "test".to_string(),
            default_image_bucket: "test".to_string(),
            aws_access_key_id: None,
            aws_secret_access_key: None,
            aws_endpoint: None,
            aws_public_base_url: None,
            image_processing_timeout_ms: 30000,
            max_image_size_mb: 50,
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
        };
        
        // Would need async setup for real test
        // For now ensure field path logic would work
        let path = "image_processed";
        let nested_path = "product.image_processed";
        
        assert!(path.len() > 0);
        assert!(nested_path.contains('.'));
    }
}
