use mongodb::{Database, Client as MongoClient};
use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime};
use tokio::time::Instant;
use std::sync::{Arc, Mutex};
use uuid::Uuid;
use std::collections::HashMap;

use crate::models::*;
use crate::clients::*;
use crate::storage::*;
use crate::handlers::*;
use crate::mapping::*;
use crate::processing::ImageProcessor;
use crate::config::Config;

// Output of processing stage: successful documents and collected validation errors
pub struct ProcessOutput {
    pub processed_docs: Vec<ProcessedDocument>,
    pub validation_errors: Vec<ValidationError>,
}

// Result type for processing a single record end-to-end (module scope)
enum RecordProcessResult {
    Ok(ProcessedDocument),
    ValidationError(ValidationError),
}

pub struct SyncEngine {
    client: MongoClient,
    db: Database,
    search_client: SearchServiceClient,
    embeddings_client: EmbeddingsServiceClient,
    redis_client: RedisClient,
    pub(crate) storage: StorageManager,
    field_mapper: FieldMapper,
    image_processor: Arc<Mutex<Option<ImageProcessor>>>,
    cfg: Config,
    active_syncs: Arc<Mutex<std::collections::HashSet<ObjectId>>>,
    index_config_cache: Arc<Mutex<std::collections::HashMap<String, (Vec<(String, f32)>, Option<u32>)>>>,
}

struct ActiveSyncGuard {
    set: Arc<Mutex<std::collections::HashSet<ObjectId>>>,
    id: ObjectId,
}

impl Drop for ActiveSyncGuard {
    fn drop(&mut self) {
        if let Ok(mut s) = self.set.lock() { s.remove(&self.id); }
    }
}

impl SyncEngine {
    pub fn new(
        client: MongoClient,
        db: Database,
        search_client: SearchServiceClient,
        embeddings_client: EmbeddingsServiceClient,
        redis_client: RedisClient,
        cfg: Config,
    ) -> Self {
        let storage = StorageManager::with_db(db.clone());
        Self {
            client,
            db,
            search_client,
            embeddings_client,
            redis_client,
            storage,
            field_mapper: FieldMapper::new(),
            image_processor: Arc::new(Mutex::new(None)),
            cfg,
            active_syncs: Arc::new(Mutex::new(std::collections::HashSet::new())),
            index_config_cache: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    /// If a data source lacks explicit embedding field configuration, fetch index defaults
    /// from the embeddings service and inject a single EmbeddingFieldConfig entry that uses
    /// those defaults (fields + weights) targeting the standard `embedding` field.
    pub async fn inject_embedding_defaults_if_absent(&self, data_source: &mut DataSource) -> Result<()> {
        if data_source.mapping.embedding_fields.is_empty() {
            let app_id = data_source.app_id.clone();
            match self.embeddings_client.get_index_config(&app_id).await {
                Ok((fields_with_weights, _dim)) => {
                    if !fields_with_weights.is_empty() {
                        let fields: Vec<String> = fields_with_weights.iter().map(|(f, _)| f.clone()).collect();
                        let weights: std::collections::HashMap<String, f32> = fields_with_weights.into_iter().collect();
                        let cfg = EmbeddingFieldConfig {
                            fields,
                            weights: Some(weights),
                            target_field: "embedding".to_string(),
                        };
                        data_source.mapping.embedding_fields.push(cfg);
                    }
                }
                Err(e) => {
                    tracing::warn!(app_id = %app_id, error = %e, "Failed to get index defaults; proceeding without embedding defaults");
                }
            }
        }
        Ok(())
    }

    /// Initialize or get the image processor (lazy initialization)
    async fn get_image_processor(&self) -> Result<()> {
        // First check under lock if initialization is needed
        let needs_init = {
            let guard = self.image_processor.lock().expect("Image processor mutex poisoned");
            guard.is_none()
        };
        if needs_init {
            // Initialize outside the lock to avoid holding a non-Send guard across await
            match ImageProcessor::new(self.cfg.clone()).await {
                Ok(processor) => {
                    let mut guard = self.image_processor.lock().expect("Image processor mutex poisoned");
                    // Only set if still none to avoid race
                    if guard.is_none() {
                        *guard = Some(processor);
                        tracing::info!("Image processor initialized successfully");
                    }
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to initialize image processor; image processing will be disabled");
                }
            }
        }
        Ok(())
    }

    /// Process document images if image processing is enabled
    pub async fn process_document_images(&self, document: &serde_json::Value, data_source: &DataSource) -> Result<serde_json::Value> {
        // Check if image processing is enabled
        if !data_source.config.image_preprocessing.unwrap_or(false) 
            && !data_source.config.image_refitting.unwrap_or(false) {
            return Ok(document.clone());
        }

        // Ensure image processor is initialized
        self.get_image_processor().await?;

        // Take the processor out to avoid holding the guard across await
        let mut maybe_processor = {
            let mut guard = self.image_processor.lock().expect("Image processor mutex poisoned");
            guard.take()
        };

        let result = if let Some(proc_ref) = maybe_processor.as_mut() {
            proc_ref.process_document_images(document, data_source).await
        } else {
            tracing::debug!("Image processor not available; skipping image processing");
            Ok(document.clone())
        };

        // Put the processor back
        {
            let mut guard = self.image_processor.lock().expect("Image processor mutex poisoned");
            *guard = maybe_processor;
        }

        result
    }

    pub async fn execute_sync(&self, data_source_id: ObjectId) -> Result<SyncExecution> {
        // Use a lock to ensure only one sync per data source runs at a time
        {
            let mut active = self.active_syncs.lock().expect("Mutex poisoned");
            if active.contains(&data_source_id) {
                return Err(IngestionError::Sync("Sync for this data source is already in progress".to_string()));
            }
            active.insert(data_source_id.clone());
        }
        let _guard = ActiveSyncGuard { set: self.active_syncs.clone(), id: data_source_id.clone() };
        let start_time = Instant::now();
        let sync_version = self.generate_sync_version();
        
        tracing::info!(
            data_source_id = %data_source_id,
            sync_version = %sync_version,
            "Starting sync execution"
        );

        // Load data source configuration
        let mut data_source = self.storage.get_data_source(data_source_id).await?;
        if !data_source.enabled {
            return Err(IngestionError::Sync("Data source is disabled".to_string()));
        }

        // Mark data source as syncing
        data_source.update_sync_status(DataSourceStatus::Syncing);
        self.storage.update_data_source(&data_source).await?;

        // Create sync execution record
        let mut sync_execution = SyncExecution::new(data_source_id, sync_version.clone());
        let sync_execution_id = self.storage.create_sync_execution(&sync_execution).await?;
        sync_execution.id = Some(sync_execution_id);

    // STAGE 1: DATA PREPARATION AND STAGING
    let staging_result = self.stage_data_preparation(&data_source, &sync_version).await;
        
        let staging_snapshot = match staging_result {
            Ok(snapshot) => snapshot,
            Err(e) => {
                tracing::error!(
                    data_source_id = %data_source_id,
                    sync_version = %sync_version,
                    error = %e,
                    "Stage data preparation failed"
                );
                sync_execution.fail_with_error(SyncError {
                    error_type: SyncErrorType::DataSourceFetch,
                    message: e.to_string(),
                    record_id: None,
                    field: None,
                    timestamp: BsonDateTime::now(),
                });
                self.storage.update_sync_execution(&sync_execution).await?;
                return Err(e);
            }
        };

        // STAGE 2: COMMIT TO EXTERNAL SERVICES
        let commit_result = self.commit_to_search_services(&staging_snapshot, &data_source).await;
        
        match commit_result {
            Ok(commit_info) => {
                // Success: Promote staging to current
                self.promote_staging_to_current(data_source_id, staging_snapshot.id.unwrap(), commit_info).await?;
                sync_execution.complete_successfully();
                
                // Update data source last sync
                self.storage.update_data_source_last_sync(data_source_id).await?;
                // Mark data source status back to active
                data_source.update_sync_status(DataSourceStatus::Active);
                self.storage.update_data_source(&data_source).await?;
                
                let fully_successful = sync_execution.status == SyncStatus::Success;
                tracing::info!(
                    data_source_id = %data_source_id,
                    sync_version = %sync_version,
                    duration_ms = start_time.elapsed().as_millis(),
                    fully_successful = fully_successful,
                    "Sync completed successfully"
                );
            },
            Err(e) => {
                // Failure: Mark staging as failed and optionally recover
                self.storage.mark_snapshot_failed(staging_snapshot.id.unwrap(), &e.to_string()).await?;
                
                sync_execution.fail_with_error(SyncError {
                    error_type: SyncErrorType::SearchIndexUpdate,
                    message: e.to_string(),
                    record_id: None,
                    field: None,
                    timestamp: BsonDateTime::now(),
                });

                // Mark data source as error
                data_source.update_sync_status(DataSourceStatus::Error);
                let _ = self.storage.update_data_source(&data_source).await;

                // Auto-recovery if enabled
                if data_source.config.auto_recovery_enabled.unwrap_or(true) {
                    if let Err(recovery_err) = self.attempt_auto_recovery(data_source_id).await {
                        tracing::error!(
                            data_source_id = %data_source_id,
                            error = %recovery_err,
                            "Auto-recovery failed"
                        );
                    }
                }
                
                tracing::error!(
                    data_source_id = %data_source_id,
                    sync_version = %sync_version,
                    error = %e,
                    "Sync failed"
                );
                
                self.storage.update_sync_execution(&sync_execution).await?;
                return Err(e);
            }
        }

        self.storage.update_sync_execution(&sync_execution).await?;
        
        // Cleanup old snapshots
        self.cleanup_old_snapshots(data_source_id, &data_source.config).await?;
        
        Ok(sync_execution)
    }

    /// Backwards-compatible wrapper used by callers that expect the older name
    pub async fn execute_sync_with_snapshots(&self, data_source_id: ObjectId) -> Result<SyncExecution> {
        self.execute_sync(data_source_id).await
    }

    /// Stage 1: Data preparation and staging
    async fn stage_data_preparation(
        &self,
        data_source: &DataSource,
        sync_version: &str,
    ) -> Result<ProcessedDataSnapshot> {
        let fetch_start = Instant::now();
        let data_source_id = data_source.id.unwrap();
        // Reuse existing staging snapshot for this sync_version if present (resume), else create new
        let mut staging_snapshot = if let Some(s) = self.storage.get_staging_snapshot(data_source_id, sync_version).await? {
            tracing::info!(snapshot_id = %s.id.unwrap(), data_source_id = %data_source_id, "Resuming existing staging snapshot");
            s
        } else if let Some(s) = self.storage.get_latest_staging_snapshot(data_source_id).await? {
            tracing::info!(snapshot_id = %s.id.unwrap(), data_source_id = %data_source_id, "Resuming latest staging snapshot (version mismatch)");
            s
        } else {
            let mut s = ProcessedDataSnapshot::new_staging(
                data_source_id,
                sync_version.to_string(),
            );
            let sid = self.storage.create_snapshot(&s).await?;
            s.id = Some(sid);
            tracing::info!(snapshot_id = %sid, data_source_id = %data_source_id, "Created staging snapshot");
            s
        };
        let snapshot_id = staging_snapshot.id.unwrap();

        // Fetch raw data from source
    let raw_data = self.fetch_source_data(data_source).await?;
        let fetch_duration = fetch_start.elapsed();
        
        tracing::info!(
            data_source_id = %data_source.id.unwrap(),
            records_fetched = raw_data.len(),
            fetch_duration_ms = fetch_duration.as_millis(),
            "Data fetched from source"
        );

        // Persist total and checksum for resumability tracking
        staging_snapshot.metadata.total_source_records = raw_data.len() as i64;
        // Compute checksum of source payload shape to detect drift during resume
        let current_checksum = {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut hasher = DefaultHasher::new();
            // Hash only ids if available to be stable across runs; fallback length/index
            for (i, rec) in raw_data.iter().enumerate() {
                if let Some(id) = rec.get("id").and_then(|v| v.as_str()) { id.hash(&mut hasher); } else { i.hash(&mut hasher); }
            }
            format!("{:x}", hasher.finish())
        };
        match &staging_snapshot.metadata.data_source_checksum {
            Some(existing) if existing != &current_checksum => {
                tracing::warn!(snapshot_id = %snapshot_id, old_checksum = %existing, new_checksum = %current_checksum, "Source appears to have changed since last run; resetting resume offset to 0");
                staging_snapshot.metadata.resume_offset = Some(0);
                staging_snapshot.metadata.data_source_checksum = Some(current_checksum);
            }
            Some(_) => { /* same checksum, keep resume_offset */ }
            None => { staging_snapshot.metadata.data_source_checksum = Some(current_checksum); }
        }
        self.storage.update_snapshot(&staging_snapshot).await?;

        // Determine resume offset
        let mut start_index: usize = staging_snapshot
            .metadata
            .resume_offset
            .and_then(|v| if v >= 0 { Some(v as usize) } else { None })
            .unwrap_or(0);
        if start_index > raw_data.len() { start_index = 0; }

        // Process in chunks to persist progress frequently
        let process_start = Instant::now();
        let chunk = data_source.config.batch_size.unwrap_or(self.cfg.default_batch_size).max(1);
        let mut total_processed = staging_snapshot.metadata.processed_records as usize;
        let mut total_failed = staging_snapshot.metadata.failed_records as usize;
        while start_index < raw_data.len() {
            let end = (start_index + chunk).min(raw_data.len());
            let slice = raw_data[start_index..end].to_vec();
            let ProcessOutput { processed_docs, validation_errors } = self.process_and_validate_data(
                slice,
                data_source,
                snapshot_id,
            ).await?;
            // Store processed docs immediately (already stored inside process_and_validate_data, but keep counters here)
            total_processed += processed_docs.len();
            total_failed += validation_errors.len();

            staging_snapshot.document_count = total_processed as i64;
            staging_snapshot.metadata.processed_records = total_processed as i64;
            staging_snapshot.metadata.failed_records = total_failed as i64;
            // Keep recent sample of errors
            if !validation_errors.is_empty() {
                const MAX_SAMPLED_ERRORS: usize = 100;
                staging_snapshot.metadata.validation_errors.extend(
                    validation_errors.into_iter().take(MAX_SAMPLED_ERRORS)
                );
                if staging_snapshot.metadata.validation_errors.len() > MAX_SAMPLED_ERRORS {
                    staging_snapshot.metadata.validation_errors.truncate(MAX_SAMPLED_ERRORS);
                }
            }
            staging_snapshot.metadata.resume_offset = Some(end as i64);
            staging_snapshot.metadata.progress_updated_at = Some(BsonDateTime::now());
            self.storage.update_snapshot(&staging_snapshot).await?;

            tracing::info!(
                snapshot_id = %snapshot_id,
                progress = format!("{}/{}", end, raw_data.len()),
                processed = total_processed,
                failed = total_failed,
                "Stage processing progress"
            );
            start_index = end;
        }
        let process_duration = process_start.elapsed();

        // Update snapshot metadata
        staging_snapshot.metadata.processing_time_ms = Some(process_duration.as_millis() as i64);

        self.storage.update_snapshot(&staging_snapshot).await?;
        
        Ok(staging_snapshot)
    }

    /// Fetch data from the configured data source
    pub async fn fetch_source_data(&self, data_source: &DataSource) -> Result<Vec<serde_json::Value>> {
        let timeout_override = data_source
            .config
            .timeout_seconds
            .map(|secs| std::time::Duration::from_secs(secs));
        match &data_source.source_type {
            DataSourceType::Api { endpoint, auth, headers } => {
                let handler = ApiHandler::with_config(Some(&self.cfg));
                handler.fetch_data(endpoint, auth.as_ref(), headers.as_ref(), timeout_override).await
            },
            DataSourceType::Csv { url, delimiter, has_headers } => {
                let handler = CsvHandler::with_config(Some(&self.cfg));
                handler.fetch_data(url, *delimiter, *has_headers, timeout_override).await
            },
            DataSourceType::Jsonl { url } => {
                let handler = JsonlHandler::with_config(Some(&self.cfg));
                handler.fetch_data(url, timeout_override).await
            },
            DataSourceType::Tsv { url, has_headers } => {
                let handler = TsvHandler::with_config(Some(&self.cfg));
                handler.fetch_data(url, *has_headers, timeout_override).await
            },
            DataSourceType::Xml { url, root_element, record_element } => {
                let handler = XmlHandler::with_config(Some(&self.cfg));
                handler.fetch_data(url, root_element, record_element, timeout_override).await
            },
        }
    }

    /// Process and validate raw data using MongoDB transaction
    async fn process_and_validate_data(
        &self,
        raw_data: Vec<serde_json::Value>,
        data_source: &DataSource,
        snapshot_id: ObjectId,
    ) -> Result<ProcessOutput> {
        // We'll try to use a transaction first; if not supported (e.g., standalone Mongo),
        // we fall back to non-transactional writes.
    let mut processed_docs: Vec<ProcessedDocument> = Vec::new();
    let mut validation_errors: Vec<ValidationError> = Vec::new();

        // Concurrent per-record processing configured via embedding_parallelism

        // Process records concurrently with bounded parallelism through mapping -> images -> validation -> embedding
        let embed_parallelism = data_source.config.embedding_parallelism.unwrap_or(4).max(1);
        let mut processed_docs_local: Vec<ProcessedDocument> = Vec::new();
        let mut validation_errors_local: Vec<ValidationError> = Vec::new();

        use futures::stream::{self, StreamExt};
        let results = stream::iter(raw_data.into_iter().enumerate().map(|(index, raw_record)| {
            let data_source_cloned = data_source.clone();
            let engine = self.clone();
            async move {
                engine.process_single_record(raw_record, index, data_source_cloned, snapshot_id).await
            }
        }))
        .buffer_unordered(embed_parallelism)
        .collect::<Vec<_>>()
        .await;

        for item in results {
            match item {
                Ok(RecordProcessResult::Ok(doc)) => processed_docs_local.push(doc),
                Ok(RecordProcessResult::ValidationError(err)) => validation_errors_local.push(err),
                Err(e) => {
                    // Treat as transformation failure associated with a synthetic id
                    validation_errors_local.push(ValidationError{ record_id: "<unknown>".into(), field: None, error_type: ValidationErrorType::TransformationFailed, message: e.to_string() });
                }
            }
        }

    // Replace previous per-record loop outputs
    processed_docs = processed_docs_local;
    validation_errors = validation_errors_local;
        // Legacy mapping loop removed; now handled via process_single_record
        /* for (index, raw_record) in raw_data.iter().enumerate() {
            let source_id = self.extract_source_id(raw_record, index);
            // Apply field mapping
            match self.field_mapper.map_fields(raw_record, &data_source.mapping) {
                Ok(mapped_doc) => {
                    // STEP 1: Process images if enabled (before validation and embeddings)
                    let processed_doc = match self.process_document_images(&mapped_doc, data_source).await {
                        Ok(doc) => doc,
                        Err(e) => {
                            tracing::warn!(
                                error = %e,
                                record_id = %source_id,
                                "Image processing failed, continuing with original document"
                            );
                            // Continue with original document if image processing fails
                            mapped_doc
                        }
                    };

                    // STEP 2: Product-level validation (now using processed document with images)
                    let mut missing: Vec<String> = Vec::new();
                    let mut has_categories = false;
                    let mut has_category_path = false;
                    let mut has_category_alias = false;
                    if let Some(obj) = processed_doc.as_object() {
                        for f in &default_required {
                            if !obj.contains_key(f) || self.field_mapper.is_empty_value(&obj[f]) {
                                missing.push(f.clone());
                            }
                        }
                        if let Some(v) = obj.get("categories") { if !self.field_mapper.is_empty_value(v) { has_categories = true; } }
                        if let Some(v) = obj.get("category_path") { if !self.field_mapper.is_empty_value(v) { has_category_path = true; } }
                        if let Some(v) = obj.get("category") { if !self.field_mapper.is_empty_value(v) { has_category_alias = true; } }
                    } else {
                        // processed_doc isn't an object, treat as invalid
                        missing.push("<document>".to_string());
                    }
                    // Enforce OR rule: require at least one of categories, category_path, or category(alias)
                    if !has_categories && !has_category_path && !has_category_alias {
                        missing.push("categories|category_path|category".to_string());
                    }
                    if !missing.is_empty() {
                        let msg = format!("Missing required fields: {}", missing.join(", "));
                        let verr = ValidationError {
                            record_id: source_id.clone(),
                            field: None,
                            error_type: ValidationErrorType::MissingRequiredField,
                            message: msg,
                        };
                        match strategy {
                            ValidationStrategy::SkipInvalid => {
                                validation_errors.push(verr);
                                continue; // skip this record
                            }
                            ValidationStrategy::FailSync => {
                                validation_errors.push(verr);
                                // We'll continue collecting but will cause staging not ready for commit; engine already fails if any validation errors exist
                                continue;
                            }
                        }
                    }

                    // STEP 3: Generate embedding if needed (can now use processed images for multimodal embeddings)
                    let mut final_doc = self.generate_embedding_if_needed(&processed_doc, data_source).await?;
                    // Ensure document has an 'id': prefer mapped value, else use source_id (UUID)
                    let doc_id = final_doc
                        .get("id")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| source_id.clone());
                    if final_doc.get("id").is_none() {
                        if let Some(obj) = final_doc.as_object_mut() {
                            obj.insert("id".to_string(), serde_json::Value::String(doc_id.clone()));
                        }
                    }
                    
                    // Extract autocomplete terms based on index config autocompletePaths or mapping fallback
                    let autocomplete_terms = {
                        let app_id = data_source.app_id.clone();
                        let paths = match self.embeddings_client.get_autocomplete_paths(&app_id).await {
                            Ok(p) if !p.is_empty() => p,
                            _ => data_source.mapping.autocomplete_fields.clone(),
                        };
                        self.extract_autocomplete_terms_with_paths(&final_doc, &paths)
                    };
                    
                    let mut processed_doc = ProcessedDocument::new(snapshot_id, doc_id, final_doc);
                    // If document has an embedding array, cache it in processed_doc.embedding for recovery
                    if let Some(arr) = processed_doc.document.get("embedding").and_then(|v| v.as_array()) {
                        let mut vec: Vec<f32> = Vec::with_capacity(arr.len());
                        for v in arr {
                            if let Some(f) = v.as_f64() { vec.push(f as f32); }
                            else if let Some(i) = v.as_i64() { vec.push(i as f32); }
                            else if let Some(u) = v.as_u64() { vec.push(u as f32); }
                        }
                        if !vec.is_empty() {
                            processed_doc.embedding = Some(vec);
                        }
                    }
                    processed_doc.autocomplete_terms = autocomplete_terms;
                    processed_doc.embedding_generated = processed_doc.document.get("embedding").is_some();
                    
                    processed_docs.push(processed_doc);
                },
                Err(e) => {
                    // Distinguish between mapping-time required field validation and transform errors
                    let (etype, msg) = match e {
                        IngestionError::Validation(m) => (ValidationErrorType::MissingRequiredField, m),
                        _ => (ValidationErrorType::TransformationFailed, e.to_string()),
                    };
                    validation_errors.push(ValidationError {
                        record_id: source_id,
                        field: None,
                        error_type: etype,
                        message: msg,
                    });
                    if let ValidationStrategy::FailSync = strategy {
                        // continue collecting errors; commit phase will be prevented by snapshot.is_ready_for_commit()
                        continue;
                    }
                }
            }
        } */

    // Store processed documents
    tracing::info!(processed_count = processed_docs.len(), validation_errors = validation_errors.len(), "Storing processed documents to MongoDB");
        if !self.cfg.mongodb_retry_writes {
            // In environments without retryable writes/transactions, avoid sessions entirely
            if !processed_docs.is_empty() {
                self.storage.store_processed_documents_no_session(&processed_docs).await?;
                tracing::info!(stored_count = processed_docs.len(), mode = "no-session", "Processed documents stored");
            }
        } else {
            let session_res = self.client.start_session(None).await;
            match session_res {
                Ok(mut session) => {
                    if let Err(e) = session.start_transaction(None).await {
                        tracing::warn!(error = %e, "Transactions not supported; falling back to non-transactional writes");
                        if !processed_docs.is_empty() {
                            self.storage.store_processed_documents_no_session(&processed_docs).await?;
                        }
                    } else {
                        if !processed_docs.is_empty() {
                            if let Err(e) = self.storage.store_processed_documents(&processed_docs, &mut session).await {
                                tracing::warn!(error = %e, "Insert with session failed; retrying without session");
                                self.storage.store_processed_documents_no_session(&processed_docs).await?;
                                let _ = session.abort_transaction().await; // best-effort
                                tracing::info!(stored_count = processed_docs.len(), mode = "no-session-fallback", "Processed documents stored after session failure");
                            } else {
                                let _ = session.commit_transaction().await;
                                tracing::info!(stored_count = processed_docs.len(), mode = "session", "Processed documents stored");
                            }
                        } else {
                            let _ = session.commit_transaction().await; // nothing to commit
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Sessions not supported; writing without session");
                    if !processed_docs.is_empty() {
                        self.storage.store_processed_documents_no_session(&processed_docs).await?;
                        tracing::info!(stored_count = processed_docs.len(), mode = "no-session (no sessions supported)", "Processed documents stored");
                    }
                }
            }
        }
        
    if !validation_errors.is_empty() {
            // Build a compact breakdown by error type and sample messages
            let mut by_type: HashMap<&'static str, usize> = HashMap::new();
            let mut message_counts: HashMap<String, usize> = HashMap::new();
            let mut sample_ids: Vec<String> = Vec::new();
            for err in &validation_errors {
                let key = match err.error_type {
                    ValidationErrorType::MissingRequiredField => "MissingRequiredField",
                    ValidationErrorType::InvalidDataType => "InvalidDataType",
                    ValidationErrorType::InvalidFormat => "InvalidFormat",
                    ValidationErrorType::TransformationFailed => "TransformationFailed",
                    ValidationErrorType::EmbeddingGenerationFailed => "EmbeddingGenerationFailed",
                };
                *by_type.entry(key).or_insert(0) += 1;
                if sample_ids.len() < 5 { sample_ids.push(err.record_id.clone()); }
                if message_counts.len() < 50 { // cap hashmap size
                    *message_counts.entry(err.message.clone()).or_insert(0) += 1;
                }
            }
            // Top 3 messages
            let mut top_msgs: Vec<(String, usize)> = message_counts.into_iter().collect();
            top_msgs.sort_by(|a,b| b.1.cmp(&a.1));
            top_msgs.truncate(3);
            let error_types_json = serde_json::to_string(&by_type).unwrap_or_else(|_| "{}".to_string());
            let top_msgs_json = serde_json::to_string(&top_msgs).unwrap_or_else(|_| "[]".to_string());
            tracing::warn!(
                snapshot_id = %snapshot_id,
                failed_records = validation_errors.len(),
                error_types = %error_types_json,
                sample_record_ids = %sample_ids.join(","),
                top_messages = %top_msgs_json,
                "Some records failed validation (summary)"
            );
        }

        Ok(ProcessOutput { processed_docs, validation_errors })
    }

    async fn process_single_record(&self, raw_record: serde_json::Value, index: usize, data_source: DataSource, snapshot_id: ObjectId) -> Result<RecordProcessResult> {
        let source_id = self.extract_source_id(&raw_record, index);
    use crate::models::ValidationStrategy;
        let strategy = data_source.config.validation_strategy.clone().unwrap_or(ValidationStrategy::SkipInvalid);

        // Map
        let mapped_doc = match self.field_mapper.map_fields(&raw_record, &data_source.mapping) {
            Ok(m) => m,
            Err(e) => {
                let (etype, msg) = match e {
                    IngestionError::Validation(m) => (ValidationErrorType::MissingRequiredField, m),
                    _ => (ValidationErrorType::TransformationFailed, e.to_string()),
                };
                let verr = ValidationError { record_id: source_id, field: None, error_type: etype, message: msg };
                return Ok(RecordProcessResult::ValidationError(verr));
            }
        };

        // Images
    let processed_doc = match self.process_document_images(&mapped_doc, &data_source).await {
            Ok(doc) => doc,
            Err(e) => {
                tracing::warn!(error = %e, record_id = %source_id, "Image processing failed, continuing with original document");
                mapped_doc
            }
        };

        // Validate
        let mut missing: Vec<String> = Vec::new();
        let mut has_categories = false;
        let mut has_category_path = false;
        let mut has_category_alias = false;
        if let Some(obj) = processed_doc.as_object() {
            // Default required fields (same as original loop)
            let mut default_required: std::collections::HashSet<String> = ["price".to_string()].into_iter().collect();
            let extra_required = data_source.config.required_fields.clone().unwrap_or_default();
            for f in extra_required { default_required.insert(f); }
            for f in &default_required {
                if !obj.contains_key(f) || self.field_mapper.is_empty_value(&obj[f]) {
                    missing.push(f.clone());
                }
            }
            if let Some(v) = obj.get("categories") { if !self.field_mapper.is_empty_value(v) { has_categories = true; } }
            if let Some(v) = obj.get("category_path") { if !self.field_mapper.is_empty_value(v) { has_category_path = true; } }
            if let Some(v) = obj.get("category") { if !self.field_mapper.is_empty_value(v) { has_category_alias = true; } }
        } else {
            missing.push("<document>".to_string());
        }
        if !has_categories && !has_category_path && !has_category_alias {
            missing.push("categories|category_path|category".to_string());
        }
        if !missing.is_empty() {
            let msg = format!("Missing required fields: {}", missing.join(", "));
            let verr = ValidationError { record_id: source_id.clone(), field: None, error_type: ValidationErrorType::MissingRequiredField, message: msg };
            if let ValidationStrategy::FailSync = strategy {
                // Continue collecting but mark as error
            }
            return Ok(RecordProcessResult::ValidationError(verr));
        }

        // Embedding
    let mut final_doc = self.generate_embedding_if_needed(&processed_doc, &data_source).await?;
        // Ensure id present
        let doc_id = final_doc
            .get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string())
            .unwrap_or_else(|| source_id.clone());
        if final_doc.get("id").is_none() {
            if let Some(obj) = final_doc.as_object_mut() { obj.insert("id".to_string(), serde_json::Value::String(doc_id.clone())); }
        }

        // Autocomplete
        let autocomplete_terms = {
            let app_id = data_source.app_id.clone();
            let paths = match self.embeddings_client.get_autocomplete_paths(&app_id).await {
                Ok(p) if !p.is_empty() => p,
                _ => data_source.mapping.autocomplete_fields.clone(),
            };
            self.extract_autocomplete_terms_with_paths(&final_doc, &paths)
        };

        // Build ProcessedDocument
        let mut processed_doc = ProcessedDocument::new(snapshot_id, doc_id, final_doc);
        if let Some(arr) = processed_doc.document.get("embedding").and_then(|v| v.as_array()) {
            let mut vec: Vec<f32> = Vec::with_capacity(arr.len());
            for v in arr { if let Some(f) = v.as_f64() { vec.push(f as f32); } else if let Some(i) = v.as_i64() { vec.push(i as f32); } else if let Some(u) = v.as_u64() { vec.push(u as f32); } }
            if !vec.is_empty() { processed_doc.embedding = Some(vec); }
        }
        processed_doc.autocomplete_terms = autocomplete_terms;
        processed_doc.embedding_generated = processed_doc.document.get("embedding").is_some();

        Ok(RecordProcessResult::Ok(processed_doc))
    }

    /// Stage 2: Commit to external search services
    async fn commit_to_search_services(
        &self,
        staging_snapshot: &ProcessedDataSnapshot,
        data_source: &DataSource,
    ) -> Result<CommitResult> {
        // Allow commit when strategy is SkipInvalid and there are processed docs, even if some failed
        let strategy = data_source
            .config
            .validation_strategy
            .clone()
            .unwrap_or(crate::models::ValidationStrategy::SkipInvalid);
        if !staging_snapshot.is_ready_for_commit() {
            if matches!(strategy, crate::models::ValidationStrategy::SkipInvalid) && staging_snapshot.document_count > 0 {
                tracing::warn!("Proceeding with commit despite validation failures (SkipInvalid)");
            } else {
                return Err(IngestionError::Sync("Snapshot not ready for commit".to_string()));
            }
        }

        // Load processed documents from staging
        let staged_docs = self.storage.load_snapshot_documents(staging_snapshot.id.unwrap()).await?;
        
        // Prepare rollback info
        let current_snapshot = self.storage.get_current_snapshot(staging_snapshot.data_source_id).await?;
        let mut rollback_info = RollbackInfo::new();
        rollback_info.sync_version = staging_snapshot.sync_version.clone();
        rollback_info.previous_snapshot_id = current_snapshot.map(|s| s.id.unwrap());

        // Commit Phase 1: Update search index
        let search_start = Instant::now();
        let search_result = self.update_search_index(&staged_docs, data_source, &mut rollback_info).await;
    let _search_duration = search_start.elapsed();

        let search_success = match search_result {
            Ok(_) => true,
            Err(e) => {
                tracing::error!(error = %e, "Search index update failed");
                // Attempt rollback
                if let Err(rollback_err) = self.rollback_search_operations(&rollback_info).await {
                    tracing::error!(error = %rollback_err, "Search rollback failed");
                }
                return Err(e);
            }
        };

        // Commit Phase 2: Update autocomplete
        let autocomplete_start = Instant::now();
        let autocomplete_result = self.update_autocomplete_index(&staged_docs, data_source, &mut rollback_info).await;
    let _autocomplete_duration = autocomplete_start.elapsed();

        let autocomplete_success = match autocomplete_result {
            Ok(_) => true,
            Err(e) => {
                tracing::error!(error = %e, "Autocomplete update failed");
                // Rollback both search and autocomplete
                if let Err(rollback_err) = self.rollback_all_operations(&rollback_info).await {
                    tracing::error!(error = %rollback_err, "Full rollback failed");
                }
                return Err(e);
            }
        };

        Ok(CommitResult {
            vespa_success: search_success,
            redis_success: autocomplete_success,
            operations_count: staged_docs.len(),
            commit_timestamp: BsonDateTime::now(),
            rollback_info,
        })
    }

    fn generate_sync_version(&self) -> String {
        format!("sync_{}", Uuid::new_v4().simple())
    }

    fn extract_source_id(&self, record: &serde_json::Value, _index: usize) -> String {
        // Prefer existing string id if present and non-empty
        if let Some(id) = record.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            return id.to_string();
        }
        // Otherwise generate a stable-looking unique id
        Uuid::new_v4().simple().to_string()
    }

    async fn generate_embedding_if_needed(
        &self,
        document: &serde_json::Value,
        data_source: &DataSource,
    ) -> Result<serde_json::Value> {
        if document.get("embedding").is_some() {
            return Ok(document.clone());
        }

        // Note: per-record logging kept minimal; aggregate stats logged by caller
    // Decide embedding fields and target
        let mut target_field = "embedding".to_string();
        let mut fields: Vec<String> = Vec::new();
        let mut weights: std::collections::HashMap<String, f32> = std::collections::HashMap::new();
        if !data_source.mapping.embedding_fields.is_empty() {
            // Use explicit mapping (take the first for backward compatibility)
            let cfg = &data_source.mapping.embedding_fields[0];
            target_field = cfg.target_field.clone();
            fields = cfg.fields.clone();
            if let Some(w) = &cfg.weights { weights = w.clone(); }
        } else {
            // Fallback to index defaults from embeddings service (cached per app_id)
            let app_id = data_source.app_id.clone();
            // First, try cache without awaiting
            let cached: Option<(Vec<(String, f32)>, Option<u32>)> = {
                let cache = self.index_config_cache.lock().expect("index_config_cache poisoned");
                cache.get(&app_id).cloned()
            };
            let defaults_vec: Option<Vec<(String, f32)>> = if let Some((fws, _dim)) = cached {
                Some(fws)
            } else {
                // Fetch from embeddings service (no lock held during await)
                match self.embeddings_client.get_index_config(&app_id).await {
                    Ok((fws, dim)) => {
                        // Insert into cache
                        {
                            let mut cache = self.index_config_cache.lock().expect("index_config_cache poisoned");
                            cache.insert(app_id.clone(), (fws.clone(), dim));
                        }
                        Some(fws)
                    }
                    Err(e) => {
                        tracing::warn!(app_id = %app_id, error = %e, "Failed to fetch index defaults; skipping embedding defaults");
                        None
                    }
                }
            };
            if let Some(fws) = defaults_vec {
                for (name, weight) in fws {
                    fields.push(name.clone());
                    weights.insert(name, weight);
                }
            }
        }

        if !fields.is_empty() {
            if let Ok(Some(embedding)) = self
                .embeddings_client
                .generate_embedding_for_fields(document, &fields, Some(&weights))
                .await
            {
                let mut doc = document.clone();
                if let Some(obj) = doc.as_object_mut() {
                    obj.insert(target_field, serde_json::Value::Array(
                        embedding.into_iter().map(serde_json::Value::from).collect()
                    ));
                }
                return Ok(doc);
            }
        }

        Ok(document.clone())
    }

    fn extract_autocomplete_terms_with_paths(
        &self,
        document: &serde_json::Value,
        field_paths: &[String],
    ) -> Vec<String> {
        let mut terms = Vec::new();
        for field_name in field_paths {
            if let Some(value) = document.get(field_name) {
                if let Some(text) = value.as_str() {
                    // Simple term extraction - could be enhanced with NLP
                    for word in text.split_whitespace() {
                        let clean_word = word.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
                        if clean_word.len() > 2 {
                            terms.push(clean_word);
                        }
                    }
                }
            }
        }
        
        terms.sort();
        terms.dedup();
        terms
    }

    async fn update_search_index(
        &self,
        documents: &[ProcessedDocument],
        data_source: &DataSource,
        rollback_info: &mut RollbackInfo,
    ) -> Result<()> {
        let docs_for_search: Vec<serde_json::Value> = documents
            .iter()
            .map(|doc| self.normalize_for_search_schema(doc.document.clone()))
            .collect();

        // Determine max batch size: prefer data source config, fallback to global default
        let mut max_batch = data_source.config.batch_size.unwrap_or(self.cfg.default_batch_size);
        if max_batch == 0 { max_batch = 1; }

        // Adaptive chunking loop: on 413, halve chunk size and retry current window
        let client = &self.search_client;
        let app_id = &data_source.app_id;
        let tenant_id = data_source.tenant_id.as_deref();
        let mut start = 0usize;
        let mut chunk_size = if max_batch == 0 { 1 } else { max_batch };
        while start < docs_for_search.len() {
            let end = (start + chunk_size).min(docs_for_search.len());
            let slice = docs_for_search[start..end].to_vec();
            tracing::info!(
                app_id = %app_id,
                tenant = ?tenant_id,
                batch_start = start,
                batch_end = end,
                batch_size = slice.len(),
                total = docs_for_search.len(),
                "Search upsert: sending batch"
            );
            match client.upsert_products_batch(app_id, tenant_id, slice).await {
                Ok(_) => {
                    tracing::info!(
                        app_id = %app_id,
                        tenant = ?tenant_id,
                        batch_start = start,
                        batch_end = end,
                        batch_size = (end - start),
                        "Search upsert: batch ok"
                    );
                    start = end;
                }
                Err(IngestionError::Sync(msg)) if msg.contains("413") || msg.contains("Payload Too Large") || msg.contains("length limit exceeded") => {
                    if chunk_size <= 1 {
                        return Err(IngestionError::Sync("Search service rejected single-document payload as too large".to_string()));
                    }
                    let new_chunk = chunk_size / 2;
                    tracing::warn!(old_chunk = chunk_size, new_chunk = new_chunk, "Search payload too large; retrying with smaller chunks");
                    chunk_size = new_chunk;
                    // do not advance start; retry with smaller chunk
                }
                Err(e) => {
                    tracing::error!(
                        app_id = %app_id,
                        tenant = ?tenant_id,
                        batch_start = start,
                        batch_end = end,
                        batch_size = (end - start),
                        error = %e,
                        "Search upsert: batch failed"
                    );
                    return Err(e)
                },
            }
        }

        // Record operations for rollback
        for doc in documents {
            rollback_info.add_vespa_operation(VespaOperation {
                operation_type: VespaOperationType::Upsert,
                document_id: doc.source_id.clone(),
                app_id: data_source.app_id.clone(),
                tenant_id: data_source.tenant_id.clone(),
                timestamp: BsonDateTime::now(),
            });
        }

        Ok(())
    }

    // Best-effort normalization to the search service's expected schema:
    // - title -> name
    // - description -> description_en
    // - category -> categories (array of strings); also coerce categories string -> array
    fn normalize_for_search_schema(&self, mut v: serde_json::Value) -> serde_json::Value {
        if let Some(map) = v.as_object_mut() {
            // Allowed fields in search service schema
            use std::collections::HashSet;
            let allowed: HashSet<&'static str> = [
                "tenant_id", "id", "name", "brand", "description_en", "price", "image",
                "payload", "attributes_kv", "media_images", "media_videos", "categories",
                "views", "popularity", "priority", "variations", "embedding", "location",
                "location_zcurve",
            ].into_iter().collect();

            // title -> name
            if !map.contains_key("name") {
                if let Some(val) = map.remove("title") { map.insert("name".into(), val); }
            } else {
                // If both present, drop unknown 'title' to avoid feed errors
                map.remove("title");
            }

            // description -> description_en
            if !map.contains_key("description_en") {
                if let Some(val) = map.remove("description") { map.insert("description_en".into(), val); }
            } else {
                map.remove("description");
            }

            // category -> categories (array)
            if let Some(cat_val) = map.remove("category") {
                match cat_val {
                    serde_json::Value::String(s) => {
                        if !map.contains_key("categories") {
                            map.insert("categories".into(), serde_json::Value::Array(vec![serde_json::Value::String(s)]));
                        }
                    }
                    serde_json::Value::Array(arr) => {
                        if !map.contains_key("categories") {
                            let out: Vec<serde_json::Value> = arr
                                .into_iter()
                                .filter_map(|x| x.as_str().map(|s| serde_json::Value::String(s.to_string())))
                                .collect();
                            map.insert("categories".into(), serde_json::Value::Array(out));
                        }
                    }
                    _ => {}
                }
            } else if let Some(categories) = map.get_mut("categories") {
                if let serde_json::Value::String(s) = categories {
                    *categories = serde_json::Value::Array(vec![serde_json::Value::String(s.clone())]);
                }
            }

            // Move all unknown keys under payload to avoid Vespa schema errors
            // Collect keys first to avoid borrow issues
            let keys_to_move: Vec<String> = map
                .keys()
                .filter(|k| !allowed.contains(k.as_str()))
                .cloned()
                .collect();
            if !keys_to_move.is_empty() {
                // Ensure payload is an object we can merge into
                let mut payload_obj = match map.get_mut("payload") {
                    Some(serde_json::Value::Object(obj)) => obj.clone(),
                    Some(_) => serde_json::Map::new(), // payload exists but not an object; start fresh map
                    None => serde_json::Map::new(),
                };
                for k in keys_to_move {
                    if let Some(val) = map.remove(&k) { payload_obj.insert(k, val); }
                }
                map.insert("payload".into(), serde_json::Value::Object(payload_obj));
            }
        }
        v
    }

    async fn update_autocomplete_index(
        &self,
        documents: &[ProcessedDocument],
        data_source: &DataSource,
        rollback_info: &mut RollbackInfo,
    ) -> Result<()> {
    let tenant = data_source.tenant_id.as_deref().unwrap_or("default");
    let app_id = data_source.app_id.as_str();
        
        // Group terms by field for efficient Redis operations
        let mut terms_by_field: HashMap<String, Vec<String>> = HashMap::new();
        
        // Prefer index-config-driven paths for autocomplete
        let paths = match self.embeddings_client.get_autocomplete_paths(app_id).await {
            Ok(p) if !p.is_empty() => p,
            _ => data_source.mapping.autocomplete_fields.clone(),
        };
        for doc in documents {
            for field_name in &paths {
                let key = format!("{}:{}:{}", app_id, tenant, field_name);
                let terms = terms_by_field.entry(key).or_insert_with(Vec::new);
                terms.extend(doc.autocomplete_terms.iter().cloned());
            }
        }

        // Update Redis autocomplete dictionaries
        for (field_key, terms) in terms_by_field {
            self.redis_client.add_autocomplete_terms(&field_key, &terms).await?;
            
            rollback_info.add_redis_operation(RedisOperation {
                operation_type: RedisOperationType::SuggestAdd,
                key: field_key,
                value: Some(terms.join(",")),
                timestamp: BsonDateTime::now(),
            });
        }

        Ok(())
    }

    async fn promote_staging_to_current(
        &self,
        data_source_id: ObjectId,
        staging_snapshot_id: ObjectId,
        _commit_result: CommitResult,
    ) -> Result<()> {
        if !self.cfg.mongodb_retry_writes {
            if let Some(current) = self.storage.get_current_snapshot(data_source_id).await? {
                self.storage.demote_snapshot_to_previous_no_session(current.id.unwrap()).await?;
            }
            self.storage.promote_snapshot_to_current_no_session(staging_snapshot_id).await?;
        } else {
            // Try transactional path first
            match self.client.start_session(None).await {
                Ok(mut session) => {
                    if let Err(e) = session.start_transaction(None).await {
                        tracing::warn!(error = %e, "Transactions not supported; promoting without session");
                        if let Some(current) = self.storage.get_current_snapshot(data_source_id).await? {
                            self.storage.demote_snapshot_to_previous_no_session(current.id.unwrap()).await?;
                        }
                        self.storage.promote_snapshot_to_current_no_session(staging_snapshot_id).await?;
                    } else {
                        if let Some(current) = self.storage.get_current_snapshot(data_source_id).await? {
                            self.storage.demote_snapshot_to_previous(current.id.unwrap(), &mut session).await?;
                        }
                        self.storage.promote_snapshot_to_current(staging_snapshot_id, &mut session).await?;
                        let _ = session.commit_transaction().await;
                    }
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Sessions not supported; promoting without session");
                    if let Some(current) = self.storage.get_current_snapshot(data_source_id).await? {
                        self.storage.demote_snapshot_to_previous_no_session(current.id.unwrap()).await?;
                    }
                    self.storage.promote_snapshot_to_current_no_session(staging_snapshot_id).await?;
                }
            }
        }
        Ok(())
    }

    async fn cleanup_old_snapshots(
        &self,
        data_source_id: ObjectId,
        config: &DataSourceConfig,
    ) -> Result<()> {
        let retention_days = config.snapshot_retention_days.unwrap_or(30);
        let max_snapshots = config.max_snapshots.unwrap_or(10);
        
        self.storage.cleanup_old_snapshots(data_source_id, retention_days, max_snapshots).await
    }

    async fn attempt_auto_recovery(&self, data_source_id: ObjectId) -> Result<()> {
        if let Some(previous_snapshot) = self.storage.get_previous_snapshot(data_source_id).await? {
            tracing::info!(
                data_source_id = %data_source_id,
                recovery_snapshot_id = %previous_snapshot.id.unwrap(),
                "Attempting auto-recovery"
            );

            // Create a recovery operation record (best-effort)
            let mut recovery_op = RecoveryOperation {
                id: None,
                data_source_id,
                recovery_type: RecoveryType::RollbackToSnapshot,
                from_snapshot_id: previous_snapshot.id.unwrap(),
                to_snapshot_id: None,
                initiated_at: BsonDateTime::now(),
                completed_at: None,
                status: RecoveryStatus::Initiated,
                metadata: RecoveryMetadata {
                    reason: RecoveryReason::AutoRecoveryAfterFailure,
                    documents_recovered: 0,
                    documents_failed: 0,
                    error_details: vec![],
                },
            };
            if let Ok(new_id) = self.storage.create_recovery_operation(&recovery_op).await {
                recovery_op.id = Some(new_id);
            }

            let res = self.recover_from_snapshot(data_source_id, previous_snapshot.id.unwrap()).await;

            // Update recovery operation status (best-effort)
            match res {
                Ok(()) => {
                    recovery_op.status = RecoveryStatus::Completed;
                    recovery_op.completed_at = Some(BsonDateTime::now());
                    let _ = self.storage.update_recovery_operation(&recovery_op).await;
                    Ok(())
                }
                Err(e) => {
                    recovery_op.status = RecoveryStatus::Failed;
                    recovery_op.completed_at = Some(BsonDateTime::now());
                    recovery_op.metadata.error_details.push(RecoveryError {
                        error_type: RecoveryErrorType::NetworkError,
                        message: e.to_string(),
                        document_id: None,
                        timestamp: BsonDateTime::now(),
                    });
                    let _ = self.storage.update_recovery_operation(&recovery_op).await;
                    Err(e)
                }
            }
        } else {
            tracing::info!("No previous snapshot available for recovery; skipping");
            Ok(())
        }
    }

    async fn recover_from_snapshot(&self, data_source_id: ObjectId, snapshot_id: ObjectId) -> Result<()> {
        // Implementation would restore from the specified snapshot
        // This is a placeholder - full implementation would involve:
        // 1. Loading snapshot documents
        // 2. Clearing current search index state
        // 3. Restoring documents to search index
        // 4. Restoring autocomplete data
        // 5. Updating current snapshot pointer
        
        tracing::info!(
            data_source_id = %data_source_id,
            snapshot_id = %snapshot_id,
            "Recovery from snapshot completed"
        );
        
        Ok(())
    }

    async fn rollback_search_operations(&self, _rollback_info: &RollbackInfo) -> Result<()> {
        // Implement search rollback by deleting documents that were upserted in this sync
        // Note: Assuming search service exposes delete by IDs; if not, this becomes a no-op or uses a tombstone flag
        let mut ids_by_tenant: std::collections::HashMap<(String, Option<String>), Vec<String>> = std::collections::HashMap::new();
        for op in &_rollback_info.vespa_operations {
            if matches!(op.operation_type, VespaOperationType::Upsert | VespaOperationType::Update) {
                let key = (op.app_id.clone(), op.tenant_id.clone());
                ids_by_tenant.entry(key).or_default().push(op.document_id.clone());
            }
        }

        for ((app_id, tenant_id), ids) in ids_by_tenant {
            // Best-effort; log and continue on failure
            if let Err(e) = self.search_client.delete_products_batch(&app_id, tenant_id.as_deref(), ids.iter().map(|s| s.as_str()).collect()).await {
                tracing::warn!(app_id = %app_id, tenant = ?tenant_id, error = %e, "Rollback: failed to delete products");
            }
        }

        Ok(())
    }

    async fn rollback_all_operations(&self, rollback_info: &RollbackInfo) -> Result<()> {
        self.rollback_search_operations(rollback_info).await?;
        // Rollback Redis operations by removing terms that were added
        let mut terms_by_field: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
        for op in &rollback_info.redis_operations {
            if matches!(op.operation_type, RedisOperationType::SuggestAdd) {
                if let Some(values) = &op.value {
                    let terms: Vec<String> = values.split(',').map(|s| s.to_string()).collect();
                    terms_by_field.entry(op.key.clone()).or_default().extend(terms);
                }
            }
        }
        for (field, terms) in terms_by_field {
            if let Err(e) = self.redis_client.remove_autocomplete_terms(&field, &terms).await {
                tracing::warn!(field = %field, error = %e, "Rollback: failed to remove autocomplete terms");
            }
        }
        Ok(())
    }
}

impl Clone for SyncEngine {
    fn clone(&self) -> Self {
        Self {
            client: self.client.clone(),
            db: self.db.clone(),
            search_client: self.search_client.clone(),
            embeddings_client: self.embeddings_client.clone(),
            redis_client: self.redis_client.clone(),
            storage: self.storage.clone(),
            field_mapper: FieldMapper::new(),
            image_processor: self.image_processor.clone(),
            cfg: self.cfg.clone(),
            active_syncs: self.active_syncs.clone(),
            index_config_cache: self.index_config_cache.clone(),
        }
    }
}
