use mongodb::{Client, Collection, Database, IndexModel};
use anyhow::Result;
use bson::doc;

use crate::models::{Record, Variation, RecordTaxonomy};

#[derive(Clone)]
pub struct DatabaseManager {
    _database: Database,
    pub records: Collection<Record>,
    pub variations: Collection<Variation>,
    pub record_taxonomy: Collection<RecordTaxonomy>,
}

impl DatabaseManager {
    pub async fn new(mongodb_uri: &str, database_name: &str) -> Result<Self> {
        let client = Client::with_uri_str(mongodb_uri).await?;
        let database = client.database(database_name);
        
        let records = database.collection::<Record>("records");
        let variations = database.collection::<Variation>("variations");
        let record_taxonomy = database.collection::<RecordTaxonomy>("record_taxonomy");

        let db_manager = Self {
            _database: database,
            records,
            variations,
            record_taxonomy,
        };

        // Create indexes
        db_manager.create_indexes().await?;

        Ok(db_manager)
    }

    /// Get a reference to the underlying database for migrations
    pub fn database(&self) -> &Database {
        &self._database
    }

    async fn create_indexes(&self) -> Result<()> {
        // Records collection indexes
        self.records
            .create_index(IndexModel::builder().keys(doc! { "external_ref": 1 }).build(), None)
            .await?;
        
        self.records
            .create_index(IndexModel::builder().keys(doc! { "created_at": -1 }).build(), None)
            .await?;

        // Variations collection indexes
        self.variations
            .create_index(IndexModel::builder().keys(doc! { "record_ref": 1 }).build(), None)
            .await?;
        
        self.variations
            .create_index(IndexModel::builder().keys(doc! { "record_ref": 1, "name": 1 }).build(), None)
            .await?;

        tracing::info!("Database indexes created successfully");
        Ok(())
    }
}
