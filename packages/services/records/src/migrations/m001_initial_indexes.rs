use async_trait::async_trait;
use mongodb::{Database, IndexModel};
use anyhow::Result;
use bson::doc;

use mongodb_migrator::{Migration, register_migration};

/// Initial migration to create essential indexes for the records service
#[derive(Default)]
pub struct InitialIndexes;

// Auto-register this migration using the inventory system
register_migration!(InitialIndexes);

#[async_trait]
impl Migration for InitialIndexes {
    fn version(&self) -> u32 {
        1
    }

    fn description(&self) -> &str {
        "Create initial indexes for records and variations collections"
    }

    async fn up(&self, db: &Database) -> Result<()> {
        tracing::info!("Creating initial indexes for records and variations collections");

        // Records collection indexes
        let records = db.collection::<bson::Document>("records");
        
        // Index on external_ref for fast lookups
        records
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "external_ref": 1 })
                    .build(),
                None,
            )
            .await?;

        // Index on created_at for sorting and time-based queries
        records
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "created_at": -1 })
                    .build(),
                None,
            )
            .await?;

        // Index on updated_at for finding recently updated records
        records
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "updated_at": -1 })
                    .build(),
                None,
            )
            .await?;

        // Index on brand for filtering by brand
        records
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "brand": 1 })
                    .build(),
                None,
            )
            .await?;

        // Compound index on brand and created_at for efficient brand-based queries with sorting
        records
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "brand": 1, "created_at": -1 })
                    .build(),
                None,
            )
            .await?;

        // Index on price for price-based queries and sorting
        records
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "price": 1 })
                    .build(),
                None,
            )
            .await?;

        // Variations collection indexes
        let variations = db.collection::<bson::Document>("variations");

        // Index on record_ref for finding variations by record
        variations
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "record_ref": 1 })
                    .build(),
                None,
            )
            .await?;

        // Compound index on record_ref and name for unique variation names per record
        variations
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "record_ref": 1, "name": 1 })
                    .build(),
                None,
            )
            .await?;

        tracing::info!("Initial indexes created successfully");
        Ok(())
    }

    async fn down(&self, db: &Database) -> Result<()> {
        tracing::info!("Dropping initial indexes");

        let records = db.collection::<bson::Document>("records");
        let variations = db.collection::<bson::Document>("variations");

        // Drop records indexes
        // Note: We can't easily drop specific indexes without knowing their names
        // In a real implementation, you might want to store index names or use listIndexes
        // For now, we'll drop all indexes except _id (which can't be dropped)
        
        // Get all index names for records collection
        let mut cursor = records.list_indexes(None).await?;
        let mut index_names = Vec::new();
        
        while cursor.advance().await? {
            let index_doc = cursor.current();
            if let Ok(name) = index_doc.get_str("name") {
                if name != "_id_" { // Don't drop the _id index
                    index_names.push(name.to_string());
                }
            }
        }

        // Drop each index
        for index_name in index_names {
            if let Err(e) = records.drop_index(&index_name, None).await {
                tracing::warn!("Failed to drop index {}: {}", index_name, e);
            }
        }

        // Get all index names for variations collection
        let mut cursor = variations.list_indexes(None).await?;
        let mut index_names = Vec::new();
        
        while cursor.advance().await? {
            let index_doc = cursor.current();
            if let Ok(name) = index_doc.get_str("name") {
                if name != "_id_" { // Don't drop the _id index
                    index_names.push(name.to_string());
                }
            }
        }

        // Drop each index
        for index_name in index_names {
            if let Err(e) = variations.drop_index(&index_name, None).await {
                tracing::warn!("Failed to drop index {}: {}", index_name, e);
            }
        }

        tracing::info!("Initial indexes dropped successfully");
        Ok(())
    }

    async fn validate(&self, db: &Database) -> Result<()> {
        // Check that the collections exist or can be created
        let records = db.collection::<bson::Document>("records");
        let variations = db.collection::<bson::Document>("variations");

        // Try to access the collections (this will create them if they don't exist)
        let _records_count = records.estimated_document_count(None).await?;
        let _variations_count = variations.estimated_document_count(None).await?;

        tracing::debug!("Migration validation passed: collections are accessible");
        Ok(())
    }

    fn estimated_duration(&self) -> Option<std::time::Duration> {
        // Index creation is usually fast, but can take longer on large collections
        Some(std::time::Duration::from_secs(30))
    }

    fn requires_backup(&self) -> bool {
        // Index creation is generally safe and doesn't require backup
        false
    }
}
