use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};
use crate::models::{DataSourceType, DataSourceStatus, FieldMapping};
use crate::models::ValidationStrategy;
use cron::Schedule;
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSource {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub name: String,
    pub app_id: String,
    pub tenant_id: Option<String>,
    pub source_type: DataSourceType,
    pub mapping: FieldMapping,
    pub sync_interval: String, // cron expression
    pub enabled: bool,
    pub last_sync: Option<BsonDateTime>,
    pub next_sync: Option<BsonDateTime>,
    pub status: DataSourceStatus,
    pub created_at: BsonDateTime,
    pub updated_at: BsonDateTime,
    pub config: DataSourceConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSourceConfig {
    pub batch_size: Option<usize>,
    pub timeout_seconds: Option<u64>,
    pub retry_attempts: Option<u32>,
    pub parallel_processing: Option<bool>,
    pub auto_recovery_enabled: Option<bool>,
    pub snapshot_retention_days: Option<i32>,
    pub max_snapshots: Option<i32>,
    // Validation
    pub required_fields: Option<Vec<String>>, // additional required fields per datasource
    pub validation_strategy: Option<ValidationStrategy>, // SkipInvalid (default) or FailSync
    // Image processing options
    pub image_preprocessing: Option<bool>,
    pub image_refitting: Option<bool>,
    pub image_target_dimensions: Option<ImageDimensions>,
    pub image_quality: Option<u8>, // JPEG quality 0-100
    pub image_format: Option<ImageFormat>,
    pub image_field_overrides: Option<Vec<String>>, // Manual field specification
    pub image_s3_config: Option<S3ImageConfig>,
    pub image_parallelism: Option<usize>, // Max concurrent image downloads/processing per document
    pub embedding_parallelism: Option<usize>, // Max concurrent embedding generations across documents
    pub image_use_etag_when_available: Option<bool>, // Use HEAD to origin to check ETag and skip downloads when processed exists
    pub image_fast_resize: Option<bool>, // Use faster resize filter over highest quality
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageDimensions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub max_dimension: Option<u32>, // Default: 1000
    pub maintain_aspect_ratio: Option<bool>, // Default: true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageFormat {
    Jpeg,
    Png,
    Webp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3ImageConfig {
    pub bucket: String,
    pub prefix: String, // e.g., "processed-images/app-id/"
    pub region: Option<String>,
    pub endpoint: Option<String>, // For S3-compatible services
    pub public_base_url: Option<String>, // For constructing public URLs
}

impl Default for DataSourceConfig {
    fn default() -> Self {
        Self {
            batch_size: Some(1000),
            timeout_seconds: Some(300),
            retry_attempts: Some(3),
            parallel_processing: Some(true),
            auto_recovery_enabled: Some(true),
            snapshot_retention_days: Some(30),
            max_snapshots: Some(10),
            required_fields: None,
            validation_strategy: None,
            image_preprocessing: None,
            image_refitting: None,
            image_target_dimensions: None,
            image_quality: Some(85), // Default JPEG quality
            image_format: Some(ImageFormat::Webp),
            image_field_overrides: None,
            image_s3_config: None,
            image_parallelism: Some(8),
            embedding_parallelism: Some(8),
            image_use_etag_when_available: Some(true),
            image_fast_resize: Some(true),
        }
    }
}

impl DataSource {
    pub fn new(
        name: String,
        app_id: String,
        tenant_id: Option<String>,
        source_type: DataSourceType,
        mapping: FieldMapping,
        sync_interval: String,
    ) -> Self {
        let now = BsonDateTime::now();
        Self {
            id: None,
            name,
            app_id,
            tenant_id,
            source_type,
            mapping,
            sync_interval,
            enabled: true,
            last_sync: None,
            next_sync: None,
            status: DataSourceStatus::Active,
            created_at: now,
            updated_at: now,
            config: DataSourceConfig::default(),
        }
    }

    pub fn is_due_for_sync(&self) -> bool {
        match self.next_sync {
            Some(next) => {
                let now = BsonDateTime::now();
                next.timestamp_millis() <= now.timestamp_millis()
            }
            None => true, // If no next_sync set, assume it's due
        }
    }

    pub fn calculate_next_sync(&self) -> Option<BsonDateTime> {
        if let Ok(schedule) = Schedule::from_str(&self.sync_interval) {
            let now = chrono::Utc::now();
            if let Some(next) = schedule.after(&now).next() {
                return Some(BsonDateTime::from_chrono(next));
            }
        }
        None
    }

    pub fn update_sync_status(&mut self, status: DataSourceStatus) {
        self.status = status;
        self.updated_at = BsonDateTime::now();
    }
}

// GraphQL input types for creating and updating data sources
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDataSourceInput {
    pub name: String,
    pub app_id: String,
    pub tenant_id: Option<String>,
    pub source_type: DataSourceType,
    pub mapping: FieldMapping,
    pub sync_interval: String,
    pub enabled: Option<bool>,
    pub config: Option<DataSourceConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDataSourceInput {
    pub name: Option<String>,
    pub source_type: Option<DataSourceType>,
    pub mapping: Option<FieldMapping>,
    pub sync_interval: Option<String>,
    pub enabled: Option<bool>,
    pub config: Option<DataSourceConfig>,
}

impl From<CreateDataSourceInput> for DataSource {
    fn from(input: CreateDataSourceInput) -> Self {
        let mut data_source = DataSource::new(
            input.name,
            input.app_id,
            input.tenant_id,
            input.source_type,
            input.mapping,
            input.sync_interval,
        );
        
        if let Some(enabled) = input.enabled {
            data_source.enabled = enabled;
        }
        
        if let Some(config) = input.config {
            data_source.config = config;
        }
        
        data_source
    }
}
