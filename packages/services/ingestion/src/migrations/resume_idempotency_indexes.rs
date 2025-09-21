use async_trait::async_trait;
use anyhow::Result;
use bson::doc;
use mongodb::{Database, IndexModel};
use mongodb_migrator::{Migration, register_migration};

/// Add indexes to support resume/idempotency and performance
#[derive(Default)]
pub struct IngestionResumeIdempotencyIndexes;

register_migration!(IngestionResumeIdempotencyIndexes);

#[async_trait]
impl Migration for IngestionResumeIdempotencyIndexes {
    fn version(&self) -> u32 { 2 }
    fn description(&self) -> &str { "Ensure unique (snapshot_id, source_id) and add resume helper indexes" }

    async fn up(&self, db: &Database) -> Result<()> {
        tracing::info!("Applying resume/idempotency indexes");

        // processed_documents: unique compound to prevent duplicates on resume
        let docs = db.collection::<bson::Document>("processed_documents");
        // Best effort: delete exact duplicate docs per (snapshot_id, source_id)
        // Note: without aggregation framework or transactions here; assume low duplicate count.
        // If duplicates exist, caller may need a one-off cleanup.
        docs.create_index(
            IndexModel::builder()
                .keys(doc!{"snapshot_id":1, "source_id":1})
                .options(mongodb::options::IndexOptions::builder().unique(true).build())
                .build(),
            None,
        ).await?;

        // processed_data_snapshots: index on (data_source_id, snapshot_type, created_at desc) to quickly find latest staging
        let snapshots = db.collection::<bson::Document>("processed_data_snapshots");
        snapshots.create_index(
            IndexModel::builder()
                .keys(doc!{"data_source_id":1, "snapshot_type":1, "created_at":-1})
                .build(),
            None,
        ).await?;

        Ok(())
    }

    async fn down(&self, db: &Database) -> Result<()> {
        // Best effort drop of the specific indexes we created
        let docs = db.collection::<bson::Document>("processed_documents");
        let _ = docs.drop_index("snapshot_id_1_source_id_1", None).await;

        let snapshots = db.collection::<bson::Document>("processed_data_snapshots");
        let _ = snapshots.drop_index("data_source_id_1_snapshot_type_1_created_at_-1", None).await;
        Ok(())
    }
}
