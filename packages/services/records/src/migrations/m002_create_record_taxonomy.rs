use async_trait::async_trait;
use mongodb::Database;
use anyhow::Result;
use mongodb::bson::doc;
use mongodb_migrator::{Migration, register_migration};
use mongodb::IndexModel;

#[derive(Default)]
pub struct CreateRecordTaxonomy;

register_migration!(CreateRecordTaxonomy);

#[async_trait]
impl Migration for CreateRecordTaxonomy {
    fn version(&self) -> u32 { 2 }
    fn description(&self) -> &str { "Create record_taxonomy collection with indexes" }

    async fn up(&self, db: &Database) -> Result<()> {
        db.create_collection("record_taxonomy", None).await?;
        let collection = db.collection::<bson::Document>("record_taxonomy");

        let account_id_index = IndexModel::builder()
            .keys(doc! { "account_id": 1 })
            .build();
        collection.create_index(account_id_index, None).await?;

        let class_index = IndexModel::builder()
            .keys(doc! { "taxonomy_class": 1 })
            .build();
        collection.create_index(class_index, None).await?;
        
        Ok(())
    }

    async fn down(&self, db: &Database) -> Result<()> {
        db.collection::<bson::Document>("record_taxonomy").drop(None).await?;
        Ok(())
    }
}
