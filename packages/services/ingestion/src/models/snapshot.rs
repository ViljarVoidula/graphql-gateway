use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};
use crate::models::ValidationStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedDataSnapshot {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub data_source_id: ObjectId,
    pub sync_version: String,
    pub snapshot_type: SnapshotType,
    pub document_count: i64,
    pub created_at: BsonDateTime,
    pub committed_at: Option<BsonDateTime>,
    pub search_index_state: IndexState,
    pub metadata: SnapshotMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SnapshotType {
    Previous,   // Last successfully committed data
    Staging,    // Currently being processed
    Current,    // Successfully committed, now active
    Archived,   // Old snapshot kept for audit/recovery
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedDocument {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub snapshot_id: ObjectId,
    pub source_id: String, // ID from the source system
    pub document: serde_json::Value, // Final processed document ready for search
    // Cached embedding vector for recovery/re-index without recomputation
    pub embedding: Option<Vec<f32>>, 
    pub embedding_generated: bool,
    pub autocomplete_terms: Vec<String>,
    pub checksum: String, // For change detection
    pub validation_status: ValidationStatus,
    pub processed_at: BsonDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexState {
    pub vespa_document_ids: Vec<String>,
    pub redis_autocomplete_keys: Vec<String>,
    pub last_commit_timestamp: BsonDateTime,
    pub commit_metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMetadata {
    pub total_source_records: i64,
    pub processed_records: i64,
    pub failed_records: i64,
    pub validation_errors: Vec<ValidationError>,
    pub processing_time_ms: Option<i64>,
    pub data_source_checksum: Option<String>, // Hash of entire source data
    // Resumability fields
    pub resume_offset: Option<i64>, // Next source index to process (0-based)
    pub progress_updated_at: Option<BsonDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub record_id: String,
    pub field: Option<String>,
    pub error_type: ValidationErrorType,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationErrorType {
    MissingRequiredField,
    InvalidDataType,
    InvalidFormat,
    TransformationFailed,
    EmbeddingGenerationFailed,
}

impl ProcessedDataSnapshot {
    pub fn new_staging(data_source_id: ObjectId, sync_version: String) -> Self {
        Self {
            id: None,
            data_source_id,
            sync_version,
            snapshot_type: SnapshotType::Staging,
            document_count: 0,
            created_at: BsonDateTime::now(),
            committed_at: None,
            search_index_state: IndexState {
                vespa_document_ids: Vec::new(),
                redis_autocomplete_keys: Vec::new(),
                last_commit_timestamp: BsonDateTime::now(),
                commit_metadata: None,
            },
            metadata: SnapshotMetadata {
                total_source_records: 0,
                processed_records: 0,
                failed_records: 0,
                validation_errors: Vec::new(),
                processing_time_ms: None,
                data_source_checksum: None,
                resume_offset: None,
                progress_updated_at: None,
            },
        }
    }


    pub fn is_ready_for_commit(&self) -> bool {
        matches!(self.snapshot_type, SnapshotType::Staging) 
            && self.metadata.failed_records == 0
    }
}

impl ProcessedDocument {
    pub fn new(
        snapshot_id: ObjectId,
        source_id: String,
        document: serde_json::Value,
    ) -> Self {
        let checksum = Self::calculate_checksum(&document);
        
        Self {
            id: None,
            snapshot_id,
            source_id,
            document,
            embedding: None,
            embedding_generated: false,
            autocomplete_terms: Vec::new(),
            checksum,
            validation_status: ValidationStatus::Valid,
            processed_at: BsonDateTime::now(),
        }
    }

    pub fn calculate_checksum(document: &serde_json::Value) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let json_str = serde_json::to_string(document).unwrap_or_default();
        let mut hasher = DefaultHasher::new();
        json_str.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotDiff {
    pub from_snapshot_id: ObjectId,
    pub to_snapshot_id: ObjectId,
    pub changes: Vec<DocumentChange>,
    pub summary: DiffSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChange {
    pub operation: ChangeOperation,
    pub source_id: String,
    pub document: Option<serde_json::Value>,
    pub old_checksum: Option<String>,
    pub new_checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChangeOperation {
    Add,
    Update,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffSummary {
    pub total_changes: usize,
    pub additions: usize,
    pub updates: usize,
    pub deletions: usize,
    pub change_percentage: f32,
}

impl DiffSummary {}
