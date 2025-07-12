use anyhow::Result;
use bson::{doc, oid::ObjectId};
use chrono::Utc;
use mongodb::options::{FindOptions, UpdateOptions};
use futures::stream::TryStreamExt;

use crate::database::DatabaseManager;
use crate::models::{
    Record, Variation, CreateRecordInput, UpdateRecordInput, 
    CreateVariationInput, UpdateVariationInput, SortOption,
    Media, RecordTaxonomy, CreateRecordTaxonomyInput, RecommendationConfig, TaxonomyStatus, TaxonomyStatusGraphQL,
};

#[derive(Clone)]
pub struct RecordService {
    db: DatabaseManager,
}

impl RecordService {
    pub fn new(db: DatabaseManager) -> Self {
        Self { db }
    }

    // Record CRUD operations
    pub async fn create_record(&self, input: CreateRecordInput) -> Result<Record> {
        let now = Utc::now();
        let record = Record {
            id: ObjectId::new(),
            external_ref: input.external_ref,
            media: input.media.unwrap_or_default().into_iter().map(Media::from).collect(),
            price: input.price,
            price_discounted: input.price_discounted,
            name: input.name,
            brand: input.brand,
            original_url: input.original_url,
            payload: input.payload.map(|p| p.0),
            created_at: now,
            updated_at: now,
            synced_at: None,
        };

        self.db.records.insert_one(&record, None).await?;
        Ok(record)
    }

    pub async fn find_all_records(
        &self,
        limit: Option<i64>,
        offset: Option<u64>,
        sort: Option<Vec<SortOption>>,
    ) -> Result<Vec<Record>> {
        // Build find options with optional limit, skip, and sort
        let mut find_options = FindOptions::default();
        if let Some(lim) = limit {
            find_options.limit = Some(lim);
        }
        if let Some(off) = offset {
            find_options.skip = Some(off);
        }
        if let Some(sort_options) = sort {
            let mut sort_doc = bson::Document::new();
            for sort_opt in sort_options {
                let direction = if sort_opt.direction.to_uppercase() == "DESC" { -1 } else { 1 };
                sort_doc.insert(sort_opt.field, direction);
            }
            find_options.sort = Some(sort_doc);
        }

        let cursor = self.db.records.find(doc! {}, Some(find_options)).await?;
        let records: Vec<Record> = cursor.try_collect().await?;
        Ok(records)
    }

    pub async fn find_record_by_id(&self, id: ObjectId) -> Result<Option<Record>> {
        let record = self.db.records.find_one(doc! { "_id": id }, None).await?;
        Ok(record)
    }

    pub async fn update_record(&self, id: ObjectId, input: UpdateRecordInput) -> Result<Record> {
        let mut update_doc = bson::Document::new();
        
        if let Some(external_ref) = input.external_ref {
            update_doc.insert("external_ref", external_ref);
        }
        
        if let Some(media) = input.media {
            let media_docs: Vec<Media> = media.into_iter().map(Media::from).collect();
            update_doc.insert("media", bson::to_bson(&media_docs)?);
        }
        
        if let Some(price) = input.price {
            update_doc.insert("price", price);
        }
        
        if let Some(price_discounted) = input.price_discounted {
            update_doc.insert("price_discounted", price_discounted);
        }
        
        if let Some(name) = input.name {
            update_doc.insert("name", name);
        }
        
        if let Some(brand) = input.brand {
            update_doc.insert("brand", brand);
        }
        
        if let Some(original_url) = input.original_url {
            update_doc.insert("original_url", original_url);
        }
        
        if let Some(payload) = input.payload {
            update_doc.insert("payload", bson::to_bson(&payload.0)?);
        }
        
        if let Some(synced_at) = input.synced_at {
            update_doc.insert("synced_at", synced_at);
        }

        // Always update the updated_at field
        update_doc.insert("updated_at", Utc::now());

        let options = UpdateOptions::builder().upsert(false).build();
        self.db.records.update_one(
            doc! { "_id": id },
            doc! { "$set": update_doc },
            options,
        ).await?;

        // Return the updated record
        self.find_record_by_id(id).await?.ok_or_else(|| anyhow::anyhow!("Record not found after update"))
    }

    pub async fn delete_record(&self, id: ObjectId) -> Result<bool> {
        // First delete all variations for this record
        self.db.variations.delete_many(doc! { "record_ref": id }, None).await?;
        
        // Then delete the record
        let result = self.db.records.delete_one(doc! { "_id": id }, None).await?;
        Ok(result.deleted_count > 0)
    }

    pub async fn count_records(&self) -> Result<i64> {
        let count = self.db.records.count_documents(doc! {}, None).await?;
        Ok(count as i64)
    }

    pub async fn bulk_create_records(&self, records: Vec<CreateRecordInput>) -> Result<Vec<Record>> {
        let mut created_records = Vec::new();
        
        for input in records {
            let record = self.create_record(input).await?;
            created_records.push(record);
        }
        
        Ok(created_records)
    }

    // Variation CRUD operations
    pub async fn create_variation(&self, input: CreateVariationInput) -> Result<Variation> {
        let variation = Variation {
            id: ObjectId::new(),
            record_ref: input.record_ref.into(),
            name: input.name,
            value: input.value,
        };

        self.db.variations.insert_one(&variation, None).await?;
        Ok(variation)
    }

    pub async fn find_variations_by_record(&self, record_id: ObjectId) -> Result<Vec<Variation>> {
        let cursor = self.db.variations.find(doc! { "record_ref": record_id }, None).await?;
        let variations: Vec<Variation> = cursor.try_collect().await?;
        Ok(variations)
    }

    pub async fn find_variation_by_id(&self, id: ObjectId) -> Result<Option<Variation>> {
        let variation = self.db.variations.find_one(doc! { "_id": id }, None).await?;
        Ok(variation)
    }

    pub async fn update_variation(&self, id: ObjectId, input: UpdateVariationInput) -> Result<Variation> {
        let mut update_doc = bson::Document::new();
        
        if let Some(name) = input.name {
            update_doc.insert("name", name);
        }
        
        if let Some(value) = input.value {
            update_doc.insert("value", value);
        }

        let options = UpdateOptions::builder().upsert(false).build();
        self.db.variations.update_one(
            doc! { "_id": id },
            doc! { "$set": update_doc },
            options,
        ).await?;

        // Return the updated variation
        self.find_variation_by_id(id).await?.ok_or_else(|| anyhow::anyhow!("Variation not found after update"))
    }

    pub async fn delete_variation(&self, id: ObjectId) -> Result<bool> {
        let result = self.db.variations.delete_one(doc! { "_id": id }, None).await?;
        Ok(result.deleted_count > 0)
    }

    pub async fn delete_variations_by_record(&self, record_id: ObjectId) -> Result<i64> {
        let result = self.db.variations.delete_many(doc! { "record_ref": record_id }, None).await?;
        Ok(result.deleted_count as i64)
    }

    // RecordTaxonomy CRUD operations
    pub async fn create_record_taxonomy(&self, input: CreateRecordTaxonomyInput) -> Result<RecordTaxonomy> {
        let recommendation_configuration = input.recommendation_configuration.unwrap_or_default().into_iter().map(|c| RecommendationConfig {
            taxonomy_id: c.taxonomy_id.into(),
            priority: c.priority,
        }).collect();

        let taxonomy = RecordTaxonomy {
            id: ObjectId::new(),
            account_id: input.account_id.into(),
            taxonomy_class: input.taxonomy_class,
            taxonomy_locale: bson::to_bson(&input.taxonomy_locale.0)?.as_document().unwrap().clone(),
            status: input.status.map_or(TaxonomyStatus::ACCEPTED, |s| match s {
                TaxonomyStatusGraphQL::Accepted => TaxonomyStatus::ACCEPTED,
                TaxonomyStatusGraphQL::Ignored => TaxonomyStatus::IGNORED,
                TaxonomyStatusGraphQL::Active => TaxonomyStatus::ACTIVE,
            }),
            recommendation_configuration,
        };

        self.db.record_taxonomy.insert_one(&taxonomy, None).await?;
        Ok(taxonomy)
    }
}
