use mongodb::{Collection, Database, IndexModel};
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use bson::doc;

use crate::{MigrationResult, MigrationStatus, MigrationConfig};

/// Represents a migration version record stored in the database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationVersion {
    pub version: u32,
    pub description: String,
    pub applied_at: DateTime<Utc>,
    pub duration_ms: u64,
    pub checksum: Option<String>,
    pub rolled_back_at: Option<DateTime<Utc>>,
    pub service_name: String,
}

/// Tracks migration versions in the database
pub struct VersionTracker {
    collection: Collection<MigrationVersion>,
    service_name: String,
}

impl VersionTracker {
    /// Create a new version tracker with configuration
    pub fn new(database: &Database, config: &MigrationConfig) -> Self {
        let collection = database.collection::<MigrationVersion>(&config.version_collection);
        Self { 
            collection,
            service_name: config.service_name.clone(),
        }
    }

    /// Create a new version tracker with default collection name
    pub fn with_default_collection(database: &Database, service_name: &str) -> Self {
        let collection = database.collection::<MigrationVersion>("_migrations");
        Self { 
            collection,
            service_name: service_name.to_string(),
        }
    }

    /// Initialize the migrations collection with proper indexes
    pub async fn initialize(&self) -> Result<()> {
        // Create compound unique index on service_name and version
        self.collection
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "service_name": 1, "version": 1 })
                    .options(
                        mongodb::options::IndexOptions::builder()
                            .unique(true)
                            .build()
                    )
                    .build(),
                None,
            )
            .await?;

        // Create index on applied_at for sorting
        self.collection
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "applied_at": -1 })
                    .build(),
                None,
            )
            .await?;

        // Create index on service_name for filtering
        self.collection
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "service_name": 1 })
                    .build(),
                None,
            )
            .await?;

        tracing::info!("Migration version tracking initialized for service: {}", self.service_name);
        Ok(())
    }

    /// Record that a migration has been applied
    pub async fn record_migration(&self, result: &MigrationResult) -> Result<()> {
        if !result.success {
            return Ok(()); // Don't record failed migrations
        }

        let version_record = MigrationVersion {
            version: result.version,
            description: result.description.clone(),
            applied_at: result.executed_at,
            duration_ms: result.duration_ms,
            checksum: None, // TODO: Implement migration checksum
            rolled_back_at: None,
            service_name: self.service_name.clone(),
        };

        // Use upsert to handle cases where the record might already exist
        self.collection
            .replace_one(
                bson::doc! { 
                    "service_name": &self.service_name,
                    "version": result.version 
                },
                &version_record,
                mongodb::options::ReplaceOptions::builder()
                    .upsert(true)
                    .build(),
            )
            .await?;

        tracing::info!("Recorded migration version {} for service {}", result.version, self.service_name);
        Ok(())
    }

    /// Record that a migration has been rolled back
    pub async fn record_rollback(&self, version: u32) -> Result<()> {
        self.collection
            .update_one(
                doc! { 
                    "service_name": &self.service_name,
                    "version": version 
                },
                doc! { "$set": { "rolled_back_at": Utc::now() } },
                None,
            )
            .await?;

        tracing::info!("Recorded rollback for migration version {} in service {}", version, self.service_name);
        Ok(())
    }

    /// Get all applied migrations for this service, sorted by version
    pub async fn get_applied_migrations(&self) -> Result<Vec<MigrationVersion>> {
        let mut cursor = self.collection
            .find(
                doc! { 
                    "service_name": &self.service_name,
                    "$or": [
                        { "rolled_back_at": { "$exists": false } },
                        { "rolled_back_at": null }
                    ]
                },
                mongodb::options::FindOptions::builder()
                    .sort(doc! { "version": 1 })
                    .build(),
            )
            .await?;

        let mut migrations = Vec::new();
        while cursor.advance().await? {
            migrations.push(cursor.deserialize_current()?);
        }

        Ok(migrations)
    }

    /// Get the latest applied migration version for this service
    pub async fn get_latest_version(&self) -> Result<Option<u32>> {
        let filter = doc! { 
            "service_name": &self.service_name,
            "$or": [
                { "rolled_back_at": { "$exists": false } },
                { "rolled_back_at": null }
            ]
        };
        
        let result = self.collection
            .find_one(
                filter,
                mongodb::options::FindOneOptions::builder()
                    .sort(doc! { "version": -1 })
                    .build(),
            )
            .await?;
        
        Ok(result.map(|m| m.version))
    }

    /// Check if a specific migration version has been applied for this service
    pub async fn is_applied(&self, version: u32) -> Result<bool> {
        let count = self.collection
            .count_documents(
                doc! { 
                    "service_name": &self.service_name,
                    "version": version,
                    "rolled_back_at": { "$exists": false }
                },
                None,
            )
            .await?;

        Ok(count > 0)
    }

    /// Get migration status for a specific version
    pub async fn get_status(&self, version: u32) -> Result<MigrationStatus> {
        let migration = self.collection
            .find_one(
                doc! { 
                    "service_name": &self.service_name,
                    "version": version 
                }, 
                None
            )
            .await?;

        match migration {
            None => Ok(MigrationStatus::Pending),
            Some(m) => {
                if m.rolled_back_at.is_some() {
                    Ok(MigrationStatus::RolledBack)
                } else {
                    Ok(MigrationStatus::Applied)
                }
            }
        }
    }

    /// Get migration history with pagination for this service
    pub async fn get_history(&self, limit: Option<i64>, skip: Option<u64>) -> Result<Vec<MigrationVersion>> {
        let options = mongodb::options::FindOptions::builder()
            .sort(doc! { "applied_at": -1 })
            .limit(limit)
            .skip(skip)
            .build();

        let mut cursor = self.collection
            .find(
                doc! { "service_name": &self.service_name },
                options
            )
            .await?;

        let mut history = Vec::new();
        while cursor.advance().await? {
            history.push(cursor.deserialize_current()?);
        }

        Ok(history)
    }

    /// Remove a migration record (for testing or cleanup)
    pub async fn remove_migration(&self, version: u32) -> Result<()> {
        self.collection
            .delete_one(
                doc! { 
                    "service_name": &self.service_name,
                    "version": version 
                }, 
                None
            )
            .await?;

        tracing::info!("Removed migration version {} from tracking for service {}", version, self.service_name);
        Ok(())
    }

    /// Get statistics about migrations for this service
    pub async fn get_stats(&self) -> Result<MigrationStats> {
        let total_applied = self.collection
            .count_documents(
                doc! { 
                    "service_name": &self.service_name,
                    "$or": [
                        { "rolled_back_at": { "$exists": false } },
                        { "rolled_back_at": null }
                    ]
                }, 
                None
            )
            .await?;

        let total_rolled_back = self.collection
            .count_documents(
                doc! { 
                    "service_name": &self.service_name,
                    "rolled_back_at": { "$ne": null, "$exists": true } 
                }, 
                None
            )
            .await?;

        let latest_version = self.get_latest_version().await?;

        // Calculate average migration time for this service
        let pipeline = vec![
            doc! {
                "$match": {
                    "service_name": &self.service_name,
                    "rolled_back_at": { "$exists": false }
                }
            },
            doc! {
                "$group": {
                    "_id": null,
                    "avg_duration": { "$avg": "$duration_ms" },
                    "total_duration": { "$sum": "$duration_ms" }
                }
            }
        ];

        let mut cursor = self.collection.aggregate(pipeline, None).await?;
        let mut avg_duration_ms = 0.0;
        let mut total_duration_ms = 0;

        if cursor.advance().await? {
            let doc = cursor.current();
            avg_duration_ms = doc.get_f64("avg_duration").unwrap_or(0.0);
            total_duration_ms = doc.get_i64("total_duration").unwrap_or(0);
        }

        Ok(MigrationStats {
            total_applied: total_applied as u32,
            total_rolled_back: total_rolled_back as u32,
            latest_version,
            avg_duration_ms,
            total_duration_ms,
            service_name: self.service_name.clone(),
        })
    }

    /// Get the service name this tracker is managing
    pub fn service_name(&self) -> &str {
        &self.service_name
    }
}

/// Migration statistics
#[derive(Debug, Clone)]
pub struct MigrationStats {
    pub total_applied: u32,
    pub total_rolled_back: u32,
    pub latest_version: Option<u32>,
    pub avg_duration_ms: f64,
    pub total_duration_ms: i64,
    pub service_name: String,
}

impl MigrationStats {
    /// Check if there are any applied migrations
    pub fn has_migrations(&self) -> bool {
        self.total_applied > 0
    }

    /// Get a summary string of the migration stats
    pub fn summary(&self) -> String {
        match self.latest_version {
            Some(version) => format!(
                "Service '{}' at version {}, {} applied, {} rolled back",
                self.service_name, version, self.total_applied, self.total_rolled_back
            ),
            None => format!(
                "Service '{}' has no applied migrations",
                self.service_name
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_migration_stats() {
        let stats = MigrationStats {
            total_applied: 5,
            total_rolled_back: 1,
            latest_version: Some(5),
            avg_duration_ms: 150.0,
            total_duration_ms: 750,
            service_name: "test-service".to_string(),
        };

        assert!(stats.has_migrations());
        assert!(stats.summary().contains("test-service"));
        assert!(stats.summary().contains("version 5"));
    }

    #[test]
    fn test_migration_stats_no_migrations() {
        let stats = MigrationStats {
            total_applied: 0,
            total_rolled_back: 0,
            latest_version: None,
            avg_duration_ms: 0.0,
            total_duration_ms: 0,
            service_name: "empty-service".to_string(),
        };

        assert!(!stats.has_migrations());
        assert!(stats.summary().contains("no applied migrations"));
    }
}
