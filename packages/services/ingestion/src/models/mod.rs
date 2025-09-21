pub mod data_source;
pub mod sync;
pub mod snapshot;
pub mod recovery;

pub use data_source::*;
pub use sync::*;
pub use snapshot::*;
pub use recovery::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataSourceType {
    Api {
        endpoint: String,
        auth: Option<AuthConfig>,
        headers: Option<std::collections::HashMap<String, String>>,
    },
    Csv {
        url: String,
        delimiter: char,
        has_headers: bool,
    },
    Jsonl {
        url: String,
    },
    Tsv {
        url: String,
        has_headers: bool,
    },
    Xml {
        url: String,
        root_element: String,
        record_element: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub auth_type: AuthType,
    pub credentials: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthType {
    Bearer,
    BasicAuth,
    ApiKey,
    OAuth2,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldMapping {
    pub fields: std::collections::HashMap<String, FieldMappingRule>,
    pub embedding_fields: Vec<EmbeddingFieldConfig>,
    pub autocomplete_fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldMappingRule {
    pub source_path: String, // JSONPath, XPath, or column name
    pub target_field: String,
    pub data_type: DataType,
    pub transform: Option<TransformFunction>,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataType {
    String,
    Integer,
    Float,
    Boolean,
    Array,
    Object,
    DateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformFunction {
    pub function_name: String,
    pub parameters: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingFieldConfig {
    pub fields: Vec<String>, // Source fields to combine for embedding
    pub weights: Option<std::collections::HashMap<String, f32>>,
    pub target_field: String, // Where to store the embedding in the output
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DataSourceStatus {
    Active,
    Inactive,
    Error,
    Syncing,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SyncStatus {
    Pending,
    Running,
    Success,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationStatus {
    Valid,
    Invalid,
    Warning,
}

#[derive(Debug, thiserror::Error)]
pub enum IngestionError {
    #[error("Database error: {0}")]
    Database(#[from] mongodb::error::Error),
    
    #[error("HTTP request error: {0}")]
    Http(#[from] reqwest::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("CSV parsing error: {0}")]
    CsvParsing(#[from] csv::Error),
    
    #[error("XML parsing error: {0}")]
    XmlParsing(String),
    
    #[error("Field mapping error: {0}")]
    FieldMapping(String),
    
    #[error("Validation error: {0}")]
    #[allow(dead_code)]
    Validation(String),
    
    #[error("Sync error: {0}")]
    Sync(String),
    
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),
    
    #[error("Configuration error: {0}")]
    Configuration(String),
}

pub type Result<T> = std::result::Result<T, IngestionError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationStrategy {
    SkipInvalid,
    FailSync,
}
