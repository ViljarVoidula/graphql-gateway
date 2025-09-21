use async_trait::async_trait;
use anyhow::Result;
use bson::doc;
use mongodb::{Database, IndexModel};
use mongodb_migrator::{Migration, register_migration};

/// Initial indexes for ingestion service collections
#[derive(Default)]
pub struct IngestionInitialIndexes;

register_migration!(IngestionInitialIndexes);

#[async_trait]
impl Migration for IngestionInitialIndexes {
    fn version(&self) -> u32 { 1 }
    fn description(&self) -> &str { "Create indexes for data_sources, processed_data_snapshots, processed_documents, sync_executions" }

    async fn up(&self, db: &Database) -> Result<()> {
        tracing::info!("Creating ingestion indexes");

        // data_sources
        let data_sources = db.collection::<bson::Document>("data_sources");
        data_sources.create_index(IndexModel::builder().keys(doc!{"app_id":1}).build(), None).await?;
        data_sources.create_index(IndexModel::builder().keys(doc!{"tenant_id":1}).build(), None).await?;
        data_sources.create_index(IndexModel::builder().keys(doc!{"status":1}).build(), None).await?;
        data_sources.create_index(IndexModel::builder().keys(doc!{"next_sync":1}).build(), None).await?;
        data_sources.create_index(IndexModel::builder().keys(doc!{"enabled":1,"next_sync":1}).build(), None).await?;

        // processed_data_snapshots
        let snapshots = db.collection::<bson::Document>("processed_data_snapshots");
        snapshots.create_index(IndexModel::builder().keys(doc!{"data_source_id":1,"snapshot_type":1}).build(), None).await?;
        snapshots.create_index(IndexModel::builder().keys(doc!{"created_at":-1}).build(), None).await?;
        snapshots.create_index(IndexModel::builder().keys(doc!{"sync_version":1}).build(), None).await?;

        // processed_documents
        let docs = db.collection::<bson::Document>("processed_documents");
        docs.create_index(IndexModel::builder().keys(doc!{"snapshot_id":1}).build(), None).await?;
        docs.create_index(IndexModel::builder().keys(doc!{"source_id":1}).build(), None).await?;
        // Ensure idempotency: prevent duplicate source_id per snapshot
        docs.create_index(
            IndexModel::builder()
                .keys(doc!{"snapshot_id":1, "source_id":1})
                .options(mongodb::options::IndexOptions::builder().unique(true).build())
                .build(),
            None
        ).await?;
        docs.create_index(IndexModel::builder().keys(doc!{"checksum":1}).build(), None).await?;
        docs.create_index(IndexModel::builder().keys(doc!{"processed_at":-1}).build(), None).await?;

        // sync_executions
        let execs = db.collection::<bson::Document>("sync_executions");
        execs.create_index(IndexModel::builder().keys(doc!{"data_source_id":1,"started_at":-1}).build(), None).await?;
        execs.create_index(IndexModel::builder().keys(doc!{"status":1}).build(), None).await?;

        Ok(())
    }

    async fn down(&self, db: &Database) -> Result<()> {
        // Best-effort drop of non _id_ indexes for created collections
        let collections = [
            "data_sources",
            "processed_data_snapshots",
            "processed_documents",
            "sync_executions",
        ];
        for name in collections {
            let coll = db.collection::<bson::Document>(name);
            let mut cursor = coll.list_indexes(None).await?;
            while cursor.advance().await? {
                let idx = cursor.current();
                if let Ok(name) = idx.get_str("name") {
                    if name != "_id_" {
                        let _ = coll.drop_index(name, None).await;
                    }
                }
            }
        }
        Ok(())
    }
}
