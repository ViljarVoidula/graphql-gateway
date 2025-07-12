use async_graphql::{Context, Object, Result, Schema, ComplexObject};

use crate::models::{
    RecordGraphQL, VariationGraphQL, ID, SortOption,
    CreateRecordInput, UpdateRecordInput, CreateVariationInput, 
    UpdateVariationInput, RecordTaxonomyGraphQL, CreateRecordTaxonomyInput
};
use crate::service::RecordService;

pub struct Query;

#[Object]
impl Query {
    async fn records(
        &self,
        ctx: &Context<'_>,
        limit: Option<i32>,
        offset: Option<i32>,
        sort: Option<Vec<SortOption>>,
    ) -> Result<Vec<RecordGraphQL>> {
        let service = ctx.data::<RecordService>()?;
        let records = service.find_all_records(
            limit.map(|l| l as i64),
            offset.map(|o| o as u64),
            sort,
        ).await
        .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        
        Ok(records.into_iter().map(RecordGraphQL::from).collect())
    }

    async fn record(&self, ctx: &Context<'_>, id: ID) -> Result<Option<RecordGraphQL>> {
        let service = ctx.data::<RecordService>()?;
        let record = service.find_record_by_id(id.into()).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(record.map(RecordGraphQL::from))
    }

    async fn records_count(&self, ctx: &Context<'_>) -> Result<i32> {
        let service = ctx.data::<RecordService>()?;
        let count = service.count_records().await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(count as i32)
    }

    async fn variations(&self, ctx: &Context<'_>, record_id: ID) -> Result<Vec<VariationGraphQL>> {
        let service = ctx.data::<RecordService>()?;
        let variations = service.find_variations_by_record(record_id.into()).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(variations.into_iter().map(VariationGraphQL::from).collect())
    }

    async fn variation(&self, ctx: &Context<'_>, id: ID) -> Result<Option<VariationGraphQL>> {
        let service = ctx.data::<RecordService>()?;
        let variation = service.find_variation_by_id(id.into()).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(variation.map(VariationGraphQL::from))
    }
}

pub struct Mutation;

#[Object]
impl Mutation {
    async fn create_record(
        &self,
        ctx: &Context<'_>,
        input: CreateRecordInput,
    ) -> Result<RecordGraphQL> {
        let service = ctx.data::<RecordService>()?;
        let record = service.create_record(input).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(RecordGraphQL::from(record))
    }

    async fn update_record(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateRecordInput,
    ) -> Result<RecordGraphQL> {
        let service = ctx.data::<RecordService>()?;
        let record = service.update_record(id.into(), input).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(RecordGraphQL::from(record))
    }

    async fn delete_record(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        let service = ctx.data::<RecordService>()?;
        service.delete_record(id.into())
            .await
            .map_err(|e| async_graphql::Error::new(e.to_string()))
    }

    async fn create_variation(
        &self,
        ctx: &Context<'_>,
        input: CreateVariationInput,
    ) -> Result<VariationGraphQL> {
        let service = ctx.data::<RecordService>()?;
        let variation = service.create_variation(input).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(VariationGraphQL::from(variation))
    }

    async fn update_variation(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateVariationInput,
    ) -> Result<VariationGraphQL> {
        let service = ctx.data::<RecordService>()?;
        let variation = service.update_variation(id.into(), input).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(VariationGraphQL::from(variation))
    }

    async fn delete_variation(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        let service = ctx.data::<RecordService>()?;
        service.delete_variation(id.into())
            .await
            .map_err(|e| async_graphql::Error::new(e.to_string()))
    }

    async fn delete_variations_by_record(&self, ctx: &Context<'_>, record_id: ID) -> Result<i64> {
        let service = ctx.data::<RecordService>()?;
        let result = service.delete_variations_by_record(record_id.into()).await?;
        Ok(result)
    }

    async fn bulk_create_records(
        &self,
        ctx: &Context<'_>,
        records: Vec<CreateRecordInput>,
    ) -> Result<Vec<RecordGraphQL>> {
        let service = ctx.data::<RecordService>()?;
        let created_records = service.bulk_create_records(records).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(created_records.into_iter().map(RecordGraphQL::from).collect())
    }

    async fn create_record_taxonomy(
        &self,
        ctx: &Context<'_>,
        input: CreateRecordTaxonomyInput,
    ) -> Result<RecordTaxonomyGraphQL> {
        let service = ctx.data::<RecordService>()?;
        let taxonomy = service.create_record_taxonomy(input).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(RecordTaxonomyGraphQL::from(taxonomy))
    }
}

// Complex resolver for Record to load variations
#[ComplexObject]
impl RecordGraphQL {
    async fn variations(&self, ctx: &Context<'_>) -> Result<Vec<VariationGraphQL>> {
        let service = ctx.data::<RecordService>()?;
        let variations = service.find_variations_by_record(self.id.0).await
            .map_err(|e| async_graphql::Error::new(e.to_string()))?;
        Ok(variations.into_iter().map(VariationGraphQL::from).collect())
    }
}

pub type RecordsSchema = Schema<Query, Mutation, async_graphql::EmptySubscription>;

pub fn create_schema(service: RecordService) -> RecordsSchema {
    Schema::build(Query, Mutation, async_graphql::EmptySubscription)
        .data(service)
        .finish()
}
