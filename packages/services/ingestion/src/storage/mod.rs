use mongodb::{Database, ClientSession, Collection};
use mongodb::bson::{oid::ObjectId, DateTime as BsonDateTime, doc};
use futures::StreamExt;

use crate::models::*;

#[derive(Clone)]
pub struct StorageManager {
    pub(crate) db: Database,
}

impl StorageManager {
    
    // new(): Not provided; use with_client(db, client)

    pub fn with_db(db: Database) -> Self { Self { db } }

    
    // start_session(): remove unused helper; callers can start sessions directly via client

    // Data source operations
    pub async fn create_data_source(&self, data_source: &DataSource) -> Result<ObjectId> {
        let collection: Collection<DataSource> = self.db.collection("data_sources");
        let result = collection.insert_one(data_source, None).await?;
        Ok(result.inserted_id.as_object_id().unwrap())
    }

    pub async fn get_data_source(&self, id: ObjectId) -> Result<DataSource> {
        let collection: Collection<DataSource> = self.db.collection("data_sources");
        collection
            .find_one(doc! { "_id": id }, None)
            .await?
            .ok_or_else(|| IngestionError::Sync("Data source not found".to_string()))
    }

    pub async fn update_data_source(&self, data_source: &DataSource) -> Result<()> {
        let collection: Collection<DataSource> = self.db.collection("data_sources");
        let filter = doc! { "_id": data_source.id.unwrap() };
        collection.replace_one(filter, data_source, None).await?;
        Ok(())
    }

    pub async fn update_data_source_last_sync(&self, id: ObjectId) -> Result<()> {
        let collection: Collection<DataSource> = self.db.collection("data_sources");
        let filter = doc! { "_id": id };
        let update = doc! { 
            "$set": {
                "last_sync": BsonDateTime::now(),
                "updated_at": BsonDateTime::now()
            }
        };
        collection.update_one(filter, update, None).await?;
        Ok(())
    }

    // Sync execution operations
    pub async fn create_sync_execution(&self, sync_execution: &SyncExecution) -> Result<ObjectId> {
        let collection: Collection<SyncExecution> = self.db.collection("sync_executions");
        let result = collection.insert_one(sync_execution, None).await?;
        Ok(result.inserted_id.as_object_id().unwrap())
    }

    pub async fn update_sync_execution(&self, sync_execution: &SyncExecution) -> Result<()> {
        let collection: Collection<SyncExecution> = self.db.collection("sync_executions");
        let filter = doc! { "_id": sync_execution.id.unwrap() };
        collection.replace_one(filter, sync_execution, None).await?;
        Ok(())
    }

    // Snapshot operations
    pub async fn create_snapshot(&self, snapshot: &ProcessedDataSnapshot) -> Result<ObjectId> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let result = collection.insert_one(snapshot, None).await?;
        Ok(result.inserted_id.as_object_id().unwrap())
    }

    pub async fn update_snapshot(&self, snapshot: &ProcessedDataSnapshot) -> Result<()> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! { "_id": snapshot.id.unwrap() };
        collection.replace_one(filter, snapshot, None).await?;
        Ok(())
    }

    pub async fn get_current_snapshot(&self, data_source_id: ObjectId) -> Result<Option<ProcessedDataSnapshot>> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! { 
            "data_source_id": data_source_id,
            "snapshot_type": "Current"
        };
        collection.find_one(filter, None).await.map_err(Into::into)
    }

    pub async fn get_previous_snapshot(&self, data_source_id: ObjectId) -> Result<Option<ProcessedDataSnapshot>> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! { 
            "data_source_id": data_source_id,
            "snapshot_type": "Previous"
        };
        collection.find_one(filter, None).await.map_err(Into::into)
    }

    pub async fn get_staging_snapshot(&self, data_source_id: ObjectId, sync_version: &str) -> Result<Option<ProcessedDataSnapshot>> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! {
            "data_source_id": data_source_id,
            "snapshot_type": "Staging",
            "sync_version": sync_version,
        };
        collection.find_one(filter, None).await.map_err(Into::into)
    }

    pub async fn get_latest_staging_snapshot(&self, data_source_id: ObjectId) -> Result<Option<ProcessedDataSnapshot>> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! {
            "data_source_id": data_source_id,
            "snapshot_type": "Staging",
        };
        let options = mongodb::options::FindOneOptions::builder()
            .sort(doc!{"created_at": -1})
            .build();
        collection.find_one(filter, options).await.map_err(Into::into)
    }

    pub async fn promote_snapshot_to_current(&self, snapshot_id: ObjectId, session: &mut ClientSession) -> Result<()> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! { "_id": snapshot_id };
        let update = doc! { 
            "$set": {
                "snapshot_type": "Current",
                "committed_at": BsonDateTime::now()
            }
        };
        collection.update_one_with_session(filter, update, None, session).await?;
        Ok(())
    }

    /// Fallback: promote snapshot to current without using a session/transaction
    pub async fn promote_snapshot_to_current_no_session(&self, snapshot_id: ObjectId) -> Result<()> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! { "_id": snapshot_id };
        let update = doc! { 
            "$set": {
                "snapshot_type": "Current",
                "committed_at": BsonDateTime::now()
            }
        };
        collection.update_one(filter, update, None).await?;
        Ok(())
    }

    pub async fn demote_snapshot_to_previous(&self, snapshot_id: ObjectId, session: &mut ClientSession) -> Result<()> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! { "_id": snapshot_id };
        let update = doc! { 
            "$set": {
                "snapshot_type": "Previous"
            }
        };
        collection.update_one_with_session(filter, update, None, session).await?;
        Ok(())
    }

    /// Fallback: demote snapshot to previous without using a session/transaction
    pub async fn demote_snapshot_to_previous_no_session(&self, snapshot_id: ObjectId) -> Result<()> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! { "_id": snapshot_id };
        let update = doc! { 
            "$set": {
                "snapshot_type": "Previous"
            }
        };
        collection.update_one(filter, update, None).await?;
        Ok(())
    }

    pub async fn mark_snapshot_failed(&self, snapshot_id: ObjectId, error_message: &str) -> Result<()> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        let filter = doc! { "_id": snapshot_id };
        let update = doc! { 
            "$set": {
                "snapshot_type": "Staging",
                "metadata.error_message": error_message
            }
        };
        collection.update_one(filter, update, None).await?;
        Ok(())
    }

    // Document operations
    pub async fn store_processed_documents(
        &self,
        documents: &[ProcessedDocument],
        session: &mut ClientSession,
    ) -> Result<()> {
        if documents.is_empty() {
            return Ok(());
        }

        let collection: Collection<ProcessedDocument> = self.db.collection("processed_documents");
        let expected = documents.len();
        let res = match collection.insert_many_with_session(documents, None, session).await {
            Ok(r) => r,
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("E11000") || msg.to_lowercase().contains("duplicate key") {
                    let mut inserted_count = 0usize;
                    for doc in documents {
                        match collection.insert_one_with_session(doc, None, session).await {
                            Ok(_) => { inserted_count += 1; },
                            Err(err) => {
                                let s = err.to_string();
                                if s.contains("E11000") || s.to_lowercase().contains("duplicate key") {
                                    // already exists; ignore
                                } else {
                                    return Err(err.into());
                                }
                            }
                        }
                    }
                    tracing::warn!(expected_count = expected, inserted_count = inserted_count, collection = "processed_documents", "Insert_many had duplicates (txn); inserted individually with skips");
                    return Ok(());
                } else {
                    return Err(e.into());
                }
            }
        };
        let inserted = res.inserted_ids.len();
        if inserted == expected {
            tracing::debug!(inserted_count = inserted, collection = "processed_documents", "Inserted processed documents (transaction)");
        } else {
            tracing::warn!(expected_count = expected, inserted_count = inserted, collection = "processed_documents", "Partial insert result (transaction)");
        }
        Ok(())
    }

    /// Fallback: store processed documents without using a session/transaction
    pub async fn store_processed_documents_no_session(
        &self,
        documents: &[ProcessedDocument],
    ) -> Result<()> {
        if documents.is_empty() {
            return Ok(());
        }

        let collection: Collection<ProcessedDocument> = self.db.collection("processed_documents");
        let expected = documents.len();
        let res = match collection.insert_many(documents, None).await {
            Ok(r) => r,
            Err(e) => {
                // On duplicate key error (from unique snapshot_id+source_id), proceed by inserting individually ignoring dups
                let msg = e.to_string();
                if msg.contains("E11000") || msg.to_lowercase().contains("duplicate key") {
                    let mut inserted_count = 0usize;
                    for doc in documents {
                        match collection.insert_one(doc, None).await {
                            Ok(_) => { inserted_count += 1; },
                            Err(err) => {
                                let s = err.to_string();
                                if s.contains("E11000") || s.to_lowercase().contains("duplicate key") {
                                    // already exists; ignore
                                } else {
                                    return Err(err.into());
                                }
                            }
                        }
                    }
                    tracing::warn!(expected_count = expected, inserted_count = inserted_count, collection = "processed_documents", "Insert_many had duplicates; inserted individually with skips");
                    return Ok(());
                } else {
                    return Err(e.into());
                }
            }
        };
        let inserted = res.inserted_ids.len();
        if inserted == expected {
            tracing::debug!(inserted_count = inserted, collection = "processed_documents", "Inserted processed documents (no session)");
        } else {
            tracing::warn!(expected_count = expected, inserted_count = inserted, collection = "processed_documents", "Partial insert result (no session)");
        }
        Ok(())
    }

    pub async fn load_snapshot_documents(&self, snapshot_id: ObjectId) -> Result<Vec<ProcessedDocument>> {
        let collection: Collection<ProcessedDocument> = self.db.collection("processed_documents");
        let filter = doc! { "snapshot_id": snapshot_id };
        let mut cursor = collection.find(filter, None).await?;
        
        let mut documents = Vec::new();
        while let Some(doc) = cursor.next().await {
            documents.push(doc?);
        }
        
        Ok(documents)
    }

    // Cleanup operations
    pub async fn cleanup_old_snapshots(
        &self,
        data_source_id: ObjectId,
        retention_days: i32,
        max_snapshots: i32,
    ) -> Result<()> {
        let collection: Collection<ProcessedDataSnapshot> = self.db.collection("processed_data_snapshots");
        
        // Delete old snapshots based on retention policy
        let cutoff_date = chrono::Utc::now() - chrono::Duration::days(retention_days.into());
        let cutoff_bson = BsonDateTime::from_chrono(cutoff_date);
        
        let filter = doc! {
            "data_source_id": data_source_id,
            "snapshot_type": { "$in": ["Archived", "Staging"] },
            "created_at": { "$lt": cutoff_bson }
        };
        
        collection.delete_many(filter, None).await?;
        
        // Keep only max_snapshots for each type
        let filter_current = doc! {
            "data_source_id": data_source_id,
            "snapshot_type": "Archived"
        };
        
        let mut cursor = collection
            .find(filter_current, None)
            .await?;
        
        let mut archived_snapshots = Vec::new();
        while let Some(doc) = cursor.next().await {
            archived_snapshots.push(doc?);
        }
        
        if archived_snapshots.len() > max_snapshots as usize {
            // Sort by creation date and keep only the newest ones
            archived_snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            
            let to_delete: Vec<ObjectId> = archived_snapshots
                .into_iter()
                .skip(max_snapshots as usize)
                .map(|s| s.id.unwrap())
                .collect();
            
            if !to_delete.is_empty() {
                let delete_filter = doc! { "_id": { "$in": to_delete } };
                collection.delete_many(delete_filter, None).await?;
            }
        }
        
        Ok(())
    }

    // Recovery operations
    
    pub async fn create_recovery_operation(&self, recovery_op: &RecoveryOperation) -> Result<ObjectId> {
        let collection: Collection<RecoveryOperation> = self.db.collection("recovery_operations");
        let result = collection.insert_one(recovery_op, None).await?;
        Ok(result.inserted_id.as_object_id().unwrap())
    }

    
    pub async fn update_recovery_operation(&self, recovery_op: &RecoveryOperation) -> Result<()> {
        let collection: Collection<RecoveryOperation> = self.db.collection("recovery_operations");
        let filter = doc! { "_id": recovery_op.id.unwrap() };
        collection.replace_one(filter, recovery_op, None).await?;
        Ok(())
    }

    // Query operations for GraphQL API
    pub async fn list_data_sources(&self, app_id: Option<&str>) -> Result<Vec<DataSource>> {
        let collection: Collection<DataSource> = self.db.collection("data_sources");
        
        let filter = if let Some(app) = app_id {
            doc! { "app_id": app }
        } else {
            doc! {}
        };
        
        let mut cursor = collection.find(filter, None).await?;
        let mut sources = Vec::new();
        
        while let Some(doc) = cursor.next().await {
            sources.push(doc?);
        }
        
        Ok(sources)
    }

    pub async fn get_sync_history(&self, data_source_id: ObjectId, limit: i32) -> Result<Vec<SyncExecution>> {
        let collection: Collection<SyncExecution> = self.db.collection("sync_executions");
        let filter = doc! { "data_source_id": data_source_id };
        
        let options = mongodb::options::FindOptions::builder()
            .sort(doc! { "started_at": -1 })
            .limit(limit as i64)
            .build();
            
        let mut cursor = collection.find(filter, options).await?;
        let mut executions = Vec::new();
        
        while let Some(doc) = cursor.next().await {
            executions.push(doc?);
        }
        
        Ok(executions)
    }
}
