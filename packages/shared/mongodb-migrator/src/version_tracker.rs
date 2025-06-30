use anyhow::Result;
use futures_util::stream::TryStreamExt;
use mongodb::{
    bson::{doc, Document},
    Database,
};

use crate::MigrationConfig;

/// Tracks the state of applied migrations in the database.
#[derive(Clone)]
pub struct VersionTracker {
    db: Database,
    config: MigrationConfig,
}

impl VersionTracker {
    pub fn new(db: &Database, config: &MigrationConfig) -> Self {
        Self {
            db: db.clone(),
            config: config.clone(),
        }
    }

    /// Gets the latest applied migration version from the database using an aggregation pipeline.
    pub async fn get_latest_version(&self) -> Result<Option<u32>> {
        let coll = self.db.collection::<Document>(&self.config.version_collection);
        
        // This pipeline finds the max version for documents that either match the service name
        // or do not have a service_name field at all (for backward compatibility).
        let pipeline = vec![
            doc! { "$match": { "$or": [
                { "service_name": &self.config.service_name },
                { "service_name": { "$exists": false } }
            ]}},
            doc! { "$group": { "_id": null, "max_version": { "$max": "$version" } } },
        ];

        let mut cursor = coll.aggregate(pipeline, None).await?;

        if let Some(doc) = cursor.try_next().await? {
            // BSON can return null if no documents were in the group.
            if let Ok(version) = doc.get_i32("max_version") {
                return Ok(Some(version as u32));
            }
        }
        
        Ok(None)
    }

    /// Checks if a specific migration version has been applied.
    pub async fn is_applied(&self, version: u32) -> Result<bool> {
        let coll = self.db.collection::<Document>(&self.config.version_collection);
        let filter = doc! {
            "service_name": &self.config.service_name,
            "version": version as i32
        };
        let count = coll.count_documents(filter, None).await?;
        Ok(count > 0)
    }

    /// Records that a migration has been rolled back by deleting its record.
    pub async fn record_rollback(&self, version: u32) -> Result<()> {
        let coll = self.db.collection::<Document>(&self.config.version_collection);
        let filter = doc! {
            "service_name": &self.config.service_name,
            "version": version as i32
        };
        coll.delete_one(filter, None).await?;
        Ok(())
    }

    /// Counts the total number of applied migrations.
    pub async fn count_applied(&self) -> Result<u32> {
        let coll = self.db.collection::<Document>(&self.config.version_collection);
        let filter = doc! { "$or": [
            { "service_name": &self.config.service_name },
            { "service_name": { "$exists": false } }
        ]};
        let count = coll.count_documents(filter, None).await?;
        Ok(count as u32)
    }

    /// Initializes the version tracker (e.g., creates indexes).
    pub async fn initialize(&self) -> Result<()> {
        // This is a good place to ensure the migration collection has necessary indexes
        // For now, it's a placeholder.
        Ok(())
    }
}
