use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use serde::{Deserialize, Serialize};
use crate::models::SyncStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncExecution {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub data_source_id: ObjectId,
    pub sync_version: String,
    pub started_at: BsonDateTime,
    pub completed_at: Option<BsonDateTime>,
    pub status: SyncStatus,
    pub total_records: i64,
    pub processed_records: i64,
    pub failed_records: i64,
    pub error_details: Vec<SyncError>,
    pub rollback_info: Option<RollbackInfo>,
    pub performance_metrics: SyncMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncError {
    pub error_type: SyncErrorType,
    pub message: String,
    pub record_id: Option<String>,
    pub field: Option<String>,
    pub timestamp: BsonDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SyncErrorType {
    DataSourceFetch,
    Parsing,
    Validation,
    Transformation,
    EmbeddingGeneration,
    SearchIndexUpdate,
    AutocompleteUpdate,
    DatabaseTransaction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackInfo {
    pub sync_version: String,
    pub previous_snapshot_id: Option<ObjectId>,
    pub vespa_operations: Vec<VespaOperation>,
    pub redis_operations: Vec<RedisOperation>,
    pub rollback_timestamp: Option<BsonDateTime>,
    pub rollback_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VespaOperation {
    pub operation_type: VespaOperationType,
    pub document_id: String,
    pub app_id: String,
    pub tenant_id: Option<String>,
    pub timestamp: BsonDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VespaOperationType {
    Upsert,
    Delete,
    Update,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisOperation {
    pub operation_type: RedisOperationType,
    pub key: String,
    pub value: Option<String>,
    pub timestamp: BsonDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RedisOperationType {
    Set,
    Delete,
    SuggestAdd,
    SuggestRemove,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncMetrics {
    pub fetch_duration_ms: Option<i64>,
    pub processing_duration_ms: Option<i64>,
    pub validation_duration_ms: Option<i64>,
    pub embedding_duration_ms: Option<i64>,
    pub search_update_duration_ms: Option<i64>,
    pub autocomplete_update_duration_ms: Option<i64>,
    pub total_duration_ms: Option<i64>,
    pub records_per_second: Option<f64>,
}

impl Default for SyncMetrics {
    fn default() -> Self {
        Self {
            fetch_duration_ms: None,
            processing_duration_ms: None,
            validation_duration_ms: None,
            embedding_duration_ms: None,
            search_update_duration_ms: None,
            autocomplete_update_duration_ms: None,
            total_duration_ms: None,
            records_per_second: None,
        }
    }
}

impl SyncExecution {
    pub fn new(data_source_id: ObjectId, sync_version: String) -> Self {
        Self {
            id: None,
            data_source_id,
            sync_version,
            started_at: BsonDateTime::now(),
            completed_at: None,
            status: SyncStatus::Running,
            total_records: 0,
            processed_records: 0,
            failed_records: 0,
            error_details: Vec::new(),
            rollback_info: None,
            performance_metrics: SyncMetrics::default(),
        }
    }

    pub fn complete_successfully(&mut self) {
        self.status = SyncStatus::Success;
        self.completed_at = Some(BsonDateTime::now());
        self.calculate_final_metrics();
    }

    pub fn fail_with_error(&mut self, error: SyncError) {
        self.status = SyncStatus::Failed;
        self.completed_at = Some(BsonDateTime::now());
        self.error_details.push(error);
        self.calculate_final_metrics();
    }

    // Note: add_error and update_progress helpers were removed; errors are tracked via fail_with_error.

    fn calculate_final_metrics(&mut self) {
        if let Some(started) = self.started_at.to_chrono().timestamp_millis().into() {
            if let Some(completed) = self.completed_at.and_then(|c| c.to_chrono().timestamp_millis().into()) {
                let duration = completed - started;
                self.performance_metrics.total_duration_ms = Some(duration);
                
                if duration > 0 && self.processed_records > 0 {
                    self.performance_metrics.records_per_second = 
                        Some((self.processed_records as f64) / (duration as f64 / 1000.0));
                }
            }
        }
    }
}

impl RollbackInfo {
    pub fn new() -> Self {
        Self {
            sync_version: String::new(),
            previous_snapshot_id: None,
            vespa_operations: Vec::new(),
            redis_operations: Vec::new(),
            rollback_timestamp: None,
            rollback_completed: false,
        }
    }

    pub fn add_vespa_operation(&mut self, operation: VespaOperation) {
        self.vespa_operations.push(operation);
    }

    pub fn add_redis_operation(&mut self, operation: RedisOperation) {
        self.redis_operations.push(operation);
    }

    // mark_rollback_complete removed; rollback is logged via engine paths.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitResult {
    pub vespa_success: bool,
    pub redis_success: bool,
    pub operations_count: usize,
    pub commit_timestamp: BsonDateTime,
    pub rollback_info: RollbackInfo,
}

impl CommitResult {}

// GraphQL response types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub sync_version: String,
    pub status: SyncStatus,
    pub total_records: i64,
    pub processed_records: i64,
    pub failed_records: i64,
    pub duration_ms: Option<i64>,
    pub records_per_second: Option<f64>,
    pub error_summary: Option<String>,
}

impl From<SyncExecution> for SyncResult {
    fn from(execution: SyncExecution) -> Self {
        let error_summary = if !execution.error_details.is_empty() {
            Some(format!("{} errors occurred during sync", execution.error_details.len()))
        } else {
            None
        };

        Self {
            sync_version: execution.sync_version,
            status: execution.status,
            total_records: execution.total_records,
            processed_records: execution.processed_records,
            failed_records: execution.failed_records,
            duration_ms: execution.performance_metrics.total_duration_ms,
            records_per_second: execution.performance_metrics.records_per_second,
            error_summary,
        }
    }
}
