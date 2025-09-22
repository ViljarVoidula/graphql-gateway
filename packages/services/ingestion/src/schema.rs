use async_graphql::{Context, EmptySubscription, Object, Schema, ID, Result as GraphQLResult, Json};
use mongodb::bson::oid::ObjectId;
use serde_json::Value;

use crate::models::*;
use crate::sync::SyncEngine;

pub type IngestionSchema = Schema<QueryRoot, MutationRoot, EmptySubscription>;

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    /// Get all data sources, optionally filtered by app_id
    async fn data_sources(
        &self,
        ctx: &Context<'_>,
        app_id: Option<String>,
    ) -> GraphQLResult<Vec<DataSource>> {
        let sync_engine = ctx.data::<SyncEngine>()?;
        let sources = sync_engine.storage.list_data_sources(app_id.as_deref()).await?;
        Ok(sources)
    }

    /// Get a specific data source by ID
    async fn data_source(&self, ctx: &Context<'_>, id: ID) -> GraphQLResult<Option<DataSource>> {
        let sync_engine = ctx.data::<SyncEngine>()?;
        let object_id = ObjectId::parse_str(&id)?;
        
        match sync_engine.storage.get_data_source(object_id).await {
            Ok(source) => Ok(Some(source)),
            Err(_) => Ok(None),
        }
    }

    /// Get sync history for a data source
    async fn sync_history(
        &self,
        ctx: &Context<'_>,
        data_source_id: ID,
        limit: Option<i32>,
    ) -> GraphQLResult<Vec<SyncExecution>> {
        let sync_engine = ctx.data::<SyncEngine>()?;
        let object_id = ObjectId::parse_str(&data_source_id)?;
        let history = sync_engine.storage.get_sync_history(object_id, limit.unwrap_or(10)).await?;
        Ok(history)
    }

    /// Get current snapshot for a data source
    async fn current_snapshot(
        &self,
        ctx: &Context<'_>,
        data_source_id: ID,
    ) -> GraphQLResult<Option<ProcessedDataSnapshot>> {
        let sync_engine = ctx.data::<SyncEngine>()?;
        let object_id = ObjectId::parse_str(&data_source_id)?;
        let snapshot = sync_engine.storage.get_current_snapshot(object_id).await?;
        Ok(snapshot)
    }

    /// Health check
    async fn health(&self) -> GraphQLResult<String> {
        Ok("OK".to_string())
    }
}

pub struct MutationRoot;

// Helpers to normalize flexible client inputs into serde-friendly shapes
fn normalize_source_type(mut v: Value) -> Value {
    // Expect one of:
    // - "source_type": { "Csv": { ... } }  (already correct)
    // - "source_type": "Csv", and details under config["Csv"]
    // - "source_type": { "type": "Csv", "config"|"value"|"options": { ... } }
    if let Some(obj) = v.as_object_mut() {
        // Clone values we need first to avoid overlapping borrows
        let st_kind = obj.get("source_type").cloned();
        let top_config = obj.get("config").cloned();

        if let Some(st_val_cloned) = st_kind {
            match st_val_cloned {
                Value::String(variant) => {
                    // Try to find details for this variant under config.{variant}
                    let mut should_remove_config = false;
                    let details_opt = match top_config {
                        Some(Value::Object(ref cfg_obj)) => {
                            if let Some(d) = cfg_obj.get(variant.as_str()).cloned() {
                                should_remove_config = cfg_obj.len() == 1;
                                Some(d)
                            } else { None }
                        }
                        _ => None,
                    };

                    let details = details_opt.unwrap_or_else(|| Value::Object(serde_json::Map::new()));

                    let mut tagged = serde_json::Map::new();
                    tagged.insert(variant, details);
                    if let Some(st_mut) = obj.get_mut("source_type") { *st_mut = Value::Object(tagged); }

                    if should_remove_config { obj.remove("config"); }
                }
                Value::Object(mut map) => {
                    // Adjacent tagging support
                    let type_key = if map.contains_key("type") {
                        Some("type")
                    } else if map.contains_key("variant") {
                        Some("variant")
                    } else { None };

                    if let Some(tk) = type_key {
                        if let Some(Value::String(t)) = map.remove(tk) {
                            let (details, remove_config_key) = map
                                .remove("config")
                                .map(|v| (v, true))
                                .or_else(|| map.remove("value").map(|v| (v, false)))
                                .or_else(|| map.remove("options").map(|v| (v, false)))
                                .unwrap_or((Value::Object(serde_json::Map::new()), false));
                            let mut tagged = serde_json::Map::new();
                            tagged.insert(t, details);
                            if let Some(st_mut) = obj.get_mut("source_type") { *st_mut = Value::Object(tagged); }
                            if remove_config_key { obj.remove("config"); }
                        }
                    }
                    // else already externally tagged; leave as-is
                }
                _ => {}
            }
        }
    }
    v
}

fn normalize_mapping(mut v: Value) -> Value {
    if let Some(obj) = v.as_object_mut() {
        if let Some(mapping_val) = obj.get_mut("mapping") {
            // If mapping already has "fields", assume it's in the correct internal format
            let needs_conversion = match mapping_val {
                Value::Object(m) => !m.contains_key("fields") && m.contains_key("field_map"),
                _ => false,
            };

            if needs_conversion {
                // Build FieldMapping from a simplified mapping: { field_map, transforms?, autocomplete_fields? }
                let mut new_mapping = serde_json::Map::new();

                // Collect autocomplete_fields if provided
                let autocomplete_fields = mapping_val
                    .get("autocomplete_fields")
                    .cloned()
                    .unwrap_or(Value::Array(vec![]));
                new_mapping.insert("autocomplete_fields".to_string(), autocomplete_fields);

                // Empty embedding_fields by default
                new_mapping.insert("embedding_fields".to_string(), Value::Array(vec![]));

                // Transforms map: { field: ["to_number", ...] }
                let transforms_obj = mapping_val
                    .get("transforms")
                    .and_then(|t| t.as_object())
                    .cloned()
                    .unwrap_or_default();

                // Build fields map
                let mut fields_map = serde_json::Map::new();
                if let Some(field_map) = mapping_val.get("field_map").and_then(|fm| fm.as_object()) {
                    for (source, target_v) in field_map.iter() {
                        if let Some(target) = target_v.as_str() {
                            // Determine data_type (simple heuristic)
                            let data_type = if source.eq_ignore_ascii_case("price") || target.eq_ignore_ascii_case("price") {
                                "Float"
                            } else {
                                "String"
                            };

                            // Optional transform from transforms_obj
                            let transform_val = transforms_obj.get(source)
                                .and_then(|arr| arr.as_array())
                                .and_then(|arr| arr.first())
                                .and_then(|v| v.as_str())
                                .map(|fname| {
                                    let mut tf = serde_json::Map::new();
                                    tf.insert("function_name".to_string(), Value::String(fname.to_string()));
                                    // parameters optional
                                    Value::Object(tf)
                                });

                            let mut rule = serde_json::Map::new();
                            rule.insert("source_path".to_string(), Value::String(source.clone()));
                            rule.insert("target_field".to_string(), Value::String(target.to_string()));
                            rule.insert("data_type".to_string(), Value::String(data_type.to_string()));
                            if let Some(tf) = transform_val { rule.insert("transform".to_string(), tf); }
                            rule.insert("required".to_string(), Value::Bool(false));

                            // Key by target field for internal map
                            fields_map.insert(target.to_string(), Value::Object(rule));
                        }
                    }
                }

                new_mapping.insert("fields".to_string(), Value::Object(fields_map));
                *mapping_val = Value::Object(new_mapping);
            }
        }
    }
    v
}

fn normalize_input(v: Value) -> Value {
    let v = normalize_source_type(v);
    let v = normalize_mapping(v);
    v
}

#[Object]
impl MutationRoot {
    /// Create a new data source
    async fn create_data_source(
        &self,
        ctx: &Context<'_>,
        input: Json<serde_json::Value>,
    ) -> GraphQLResult<DataSource> {
        let sync_engine = ctx.data::<SyncEngine>()?;
    // Normalize flexible shapes (source_type, mapping) then convert JSON input into our domain input
    let normalized = normalize_input(input.0);
        let ds_input: CreateDataSourceInput = serde_json::from_value(normalized)?;
        let mut data_source = DataSource::from(ds_input);
        // Inject embedding defaults from index config if user didn't specify
        if let Err(e) = sync_engine.inject_embedding_defaults_if_absent(&mut data_source).await {
            tracing::warn!(error = %e, "Failed to inject embedding defaults during create; continuing");
        }
        let id = sync_engine.storage.create_data_source(&data_source).await?;
        data_source.id = Some(id);
        
        Ok(data_source)
    }

    /// Update an existing data source
    async fn update_data_source(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: Json<serde_json::Value>,
    ) -> GraphQLResult<DataSource> {
        let sync_engine = ctx.data::<SyncEngine>()?;
        let object_id = ObjectId::parse_str(&id)?;
        
        let mut data_source = sync_engine.storage.get_data_source(object_id).await?;
        
    // Apply updates (normalize first)
    let normalized = normalize_input(input.0);
    let input: UpdateDataSourceInput = serde_json::from_value(normalized)?;
        if let Some(name) = input.name {
            data_source.name = name;
        }
        if let Some(source_type) = input.source_type {
            data_source.source_type = source_type;
        }
        if let Some(mapping) = input.mapping { data_source.mapping = mapping; }
        if let Some(sync_interval) = input.sync_interval {
            data_source.sync_interval = sync_interval;
        }
        if let Some(enabled) = input.enabled {
            data_source.enabled = enabled;
        }
        if let Some(config) = input.config {
            data_source.config = config;
        }
        
        // If embedding config still not provided, try to fill from index defaults
        if let Err(e) = sync_engine.inject_embedding_defaults_if_absent(&mut data_source).await {
            tracing::warn!(error = %e, "Failed to inject embedding defaults during update; continuing");
        }
        data_source.updated_at = mongodb::bson::DateTime::now();
        sync_engine.storage.update_data_source(&data_source).await?;
        
        Ok(data_source)
    }

    /// Delete a data source
    async fn delete_data_source(&self, ctx: &Context<'_>, id: ID) -> GraphQLResult<bool> {
        let _sync_engine = ctx.data::<SyncEngine>()?;
        let _object_id = ObjectId::parse_str(&id)?;
        
        // Implementation would delete the data source and associated snapshots
        // For now, return true as placeholder
        Ok(true)
    }

    /// Trigger a manual sync for a data source
    async fn trigger_sync(&self, ctx: &Context<'_>, id: ID) -> GraphQLResult<SyncExecution> {
        let sync_engine = ctx.data::<SyncEngine>()?;
        let object_id = ObjectId::parse_str(&id)?;
        let result = sync_engine.execute_sync_with_snapshots(object_id).await?;
        Ok(result)
    }

    /// Rollback to a previous snapshot
    async fn rollback_to_snapshot(
        &self,
        ctx: &Context<'_>,
        data_source_id: ID,
        snapshot_id: ID,
    ) -> GraphQLResult<bool> {
        let _sync_engine = ctx.data::<SyncEngine>()?;
        let _ds_object_id = ObjectId::parse_str(&data_source_id)?;
        let _snap_object_id = ObjectId::parse_str(&snapshot_id)?;
        
        // Implementation would perform rollback to the specified snapshot
        // For now, return true as placeholder
        Ok(true)
    }

    /// Test a data source connection and fetch sample data
    async fn test_data_source(
        &self,
        ctx: &Context<'_>,
        input: Json<serde_json::Value>,
    ) -> GraphQLResult<TestDataSourceResult> {
        let sync_engine = ctx.data::<SyncEngine>()?;
    // Create temporary data source for testing (normalize first)
    let normalized = normalize_input(input.0);
        let input: CreateDataSourceInput = serde_json::from_value(normalized)?;
        let temp_source = DataSource::from(input);
        
        // Attempt to fetch a small sample of data
        match sync_engine.fetch_source_data(&temp_source).await {
            Ok(data) => {
                let sample_size = data.len().min(5);
                let sample: Vec<serde_json::Value> = data.into_iter().take(sample_size).collect();
                
                Ok(TestDataSourceResult {
                    success: true,
                    sample_data: Some(sample),
                    error_message: None,
                    record_count: Some(sample_size as i32),
                })
            }
            Err(e) => Ok(TestDataSourceResult {
                success: false,
                sample_data: None,
                error_message: Some(e.to_string()),
                record_count: None,
            })
        }
    }

    /// Process images for a specific data source independently of sync
    async fn process_images(
        &self,
        ctx: &Context<'_>,
        data_source_id: ID,
        force_reprocess: Option<bool>,
    ) -> GraphQLResult<ImageProcessingResult> {
        let sync_engine = ctx.data::<SyncEngine>()?;
        let object_id = ObjectId::parse_str(&data_source_id)?;
        
        // Load data source
        let data_source = sync_engine.storage.get_data_source(object_id).await?;
        
        // Check if image processing is enabled
        if !data_source.config.image_preprocessing.unwrap_or(false) 
            && !data_source.config.image_refitting.unwrap_or(false) {
            return Ok(ImageProcessingResult {
                success: false,
                processed_count: 0,
                error_message: Some("Image processing is not enabled for this data source".to_string()),
                processing_time_ms: Some(0),
            });
        }

        let start_time = tokio::time::Instant::now();
        
        // Get current snapshot documents if available
        if let Some(current_snapshot) = sync_engine.storage.get_current_snapshot(object_id).await? {
            let documents = sync_engine.storage.load_snapshot_documents(current_snapshot.id.unwrap()).await?;
            let mut processed_count = 0;
            let mut error_messages = Vec::new();
            
            // Process images for each document
            for mut doc in documents {
                match sync_engine.process_document_images(&doc.document, &data_source).await {
                    Ok(processed_doc) => {
                        // Update the document in storage with processed images
                        doc.document = processed_doc;
                        if let Err(e) = sync_engine.storage.update_processed_document(&doc).await {
                            error_messages.push(format!("Failed to update document {}: {}", doc.source_id, e));
                        } else {
                            processed_count += 1;
                        }
                    }
                    Err(e) => {
                        error_messages.push(format!("Failed to process images for document {}: {}", doc.source_id, e));
                    }
                }
            }
            
            let processing_time = start_time.elapsed();
            
            Ok(ImageProcessingResult {
                success: error_messages.is_empty(),
                processed_count,
                error_message: if error_messages.is_empty() { 
                    None 
                } else { 
                    Some(error_messages.join("; ")) 
                },
                processing_time_ms: Some(processing_time.as_millis() as i64),
            })
        } else {
            Ok(ImageProcessingResult {
                success: false,
                processed_count: 0,
                error_message: Some("No current snapshot found for data source".to_string()),
                processing_time_ms: Some(start_time.elapsed().as_millis() as i64),
            })
        }
    }
}

// GraphQL input and output types
#[derive(async_graphql::SimpleObject)]
pub struct TestDataSourceResult {
    pub success: bool,
    pub sample_data: Option<Vec<serde_json::Value>>,
    pub error_message: Option<String>,
    pub record_count: Option<i32>,
}

#[derive(async_graphql::SimpleObject)]
pub struct ImageProcessingResult {
    pub success: bool,
    pub processed_count: i32,
    pub error_message: Option<String>,
    pub processing_time_ms: Option<i64>,
}

// Convert domain models to GraphQL objects

#[Object]
impl DataSource {
    async fn id(&self) -> Option<ID> {
        self.id.map(|id| ID::from(id.to_string()))
    }

    async fn name(&self) -> &str {
        &self.name
    }

    async fn app_id(&self) -> &str {
        &self.app_id
    }

    async fn tenant_id(&self) -> Option<&str> {
        self.tenant_id.as_deref()
    }

    async fn source_type(&self) -> Json<serde_json::Value> {
        Json(serde_json::to_value(&self.source_type).unwrap_or(serde_json::Value::Null))
    }

    async fn mapping(&self) -> Json<serde_json::Value> {
        Json(serde_json::to_value(&self.mapping).unwrap_or(serde_json::Value::Null))
    }

    async fn sync_interval(&self) -> &str {
        &self.sync_interval
    }

    async fn enabled(&self) -> bool {
        self.enabled
    }

    async fn status(&self) -> Json<serde_json::Value> {
        Json(serde_json::to_value(&self.status).unwrap_or(serde_json::Value::Null))
    }

    async fn last_sync(&self) -> Option<String> {
        self.last_sync.map(|dt| dt.to_chrono().to_rfc3339())
    }

    async fn next_sync(&self) -> Option<String> {
        self.next_sync.map(|dt| dt.to_chrono().to_rfc3339())
    }

    async fn created_at(&self) -> String {
        self.created_at.to_chrono().to_rfc3339()
    }

    async fn updated_at(&self) -> String {
        self.updated_at.to_chrono().to_rfc3339()
    }

    async fn config(&self) -> Json<serde_json::Value> {
        Json(serde_json::to_value(&self.config).unwrap_or(serde_json::Value::Null))
    }
}

#[Object]
impl SyncExecution {
    async fn id(&self) -> Option<ID> {
        self.id.map(|id| ID::from(id.to_string()))
    }

    async fn data_source_id(&self) -> ID {
        ID::from(self.data_source_id.to_string())
    }

    async fn sync_version(&self) -> &str {
        &self.sync_version
    }

    async fn started_at(&self) -> String {
        self.started_at.to_chrono().to_rfc3339()
    }

    async fn completed_at(&self) -> Option<String> {
        self.completed_at.map(|dt| dt.to_chrono().to_rfc3339())
    }

    async fn status(&self) -> Json<serde_json::Value> {
        Json(serde_json::to_value(&self.status).unwrap_or(serde_json::Value::Null))
    }

    async fn total_records(&self) -> i32 {
        self.total_records as i32
    }

    async fn processed_records(&self) -> i32 {
        self.processed_records as i32
    }

    async fn failed_records(&self) -> i32 {
        self.failed_records as i32
    }

    async fn performance_metrics(&self) -> Json<serde_json::Value> {
        Json(serde_json::to_value(&self.performance_metrics).unwrap_or(serde_json::Value::Null))
    }
}

#[Object]
impl ProcessedDataSnapshot {
    async fn id(&self) -> Option<ID> {
        self.id.map(|id| ID::from(id.to_string()))
    }

    async fn data_source_id(&self) -> ID {
        ID::from(self.data_source_id.to_string())
    }

    async fn sync_version(&self) -> &str {
        &self.sync_version
    }

    async fn snapshot_type(&self) -> Json<serde_json::Value> {
        Json(serde_json::to_value(&self.snapshot_type).unwrap_or(serde_json::Value::Null))
    }

    async fn document_count(&self) -> i32 {
        self.document_count as i32
    }

    async fn created_at(&self) -> String {
        self.created_at.to_chrono().to_rfc3339()
    }

    async fn committed_at(&self) -> Option<String> {
        self.committed_at.map(|dt| dt.to_chrono().to_rfc3339())
    }

    async fn metadata(&self) -> Json<serde_json::Value> {
        Json(serde_json::to_value(&self.metadata).unwrap_or(serde_json::Value::Null))
    }
}

// Note: We accept raw JSON for create/update mutations for flexibility; no dedicated InputObjects needed here.
