use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryOperation {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub data_source_id: ObjectId,
    pub recovery_type: RecoveryType,
    pub from_snapshot_id: ObjectId,
    pub to_snapshot_id: Option<ObjectId>,
    pub initiated_at: BsonDateTime,
    pub completed_at: Option<BsonDateTime>,
    pub status: RecoveryStatus,
    pub metadata: RecoveryMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryType {
    RollbackToSnapshot,    // Rollback to a specific snapshot
    CompareAndSync,        // Compare current with snapshot and sync differences
    FullRestore,          // Complete restore from snapshot
    IncrementalRestore,   // Restore only changes since last known good state
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryStatus {
    Initiated,
    Running,
    Completed,
    Failed,
    PartiallyCompleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryReason {
    ManualTrigger,
    AutoRecoveryAfterFailure,
    ScheduledMaintenance,
    DataConsistencyCheck,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryMetadata {
    pub reason: RecoveryReason,
    pub documents_recovered: i64,
    pub documents_failed: i64,
    pub error_details: Vec<RecoveryError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryError {
    pub error_type: RecoveryErrorType,
    pub message: String,
    pub document_id: Option<String>,
    pub timestamp: BsonDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryErrorType {
    SnapshotNotFound,
    InvalidSnapshot,
    SearchIndexError,
    RedisError,
    DocumentValidationError,
    NetworkError,
    PermissionError,
}

impl RecoveryOperation {}

// GraphQL types for recovery operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryResult {
    pub recovery_id: String,
    pub status: RecoveryStatus,
    pub documents_recovered: i64,
    pub documents_failed: i64,
    pub duration_ms: Option<i64>,
    pub error_summary: Option<String>,
}

impl From<RecoveryOperation> for RecoveryResult {
    fn from(operation: RecoveryOperation) -> Self {
        let duration_ms = if let (Some(started), Some(completed)) = 
            (operation.initiated_at.to_chrono().timestamp_millis().into(), 
             operation.completed_at.and_then(|c| c.to_chrono().timestamp_millis().into())) {
            Some(completed - started)
        } else {
            None
        };

        let error_summary = if !operation.metadata.error_details.is_empty() {
            Some(format!("{} errors occurred during recovery", operation.metadata.error_details.len()))
        } else {
            None
        };

        Self {
            recovery_id: operation.id.map(|id| id.to_string()).unwrap_or_default(),
            status: operation.status,
            documents_recovered: operation.metadata.documents_recovered,
            documents_failed: operation.metadata.documents_failed,
            duration_ms,
            error_summary,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryRequest {
    pub data_source_id: String,
    pub snapshot_id: String,
    pub recovery_type: RecoveryType,
    pub force: Option<bool>,
}
