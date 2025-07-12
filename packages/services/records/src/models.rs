use async_graphql::{SimpleObject, InputObject, Scalar, ScalarType, Value, Enum};
use bson::oid::ObjectId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json;
use bson::Document;

// Custom scalar for ObjectId
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ID(pub ObjectId);

#[Scalar]
impl ScalarType for ID {
    fn parse(value: Value) -> async_graphql::InputValueResult<Self> {
        if let Value::String(s) = value {
            Ok(ID(ObjectId::parse_str(&s)?))
        } else {
            Err(async_graphql::InputValueError::expected_type(value))
        }
    }

    fn to_value(&self) -> Value {
        Value::String(self.0.to_hex())
    }
}

impl From<ObjectId> for ID {
    fn from(oid: ObjectId) -> Self {
        ID(oid)
    }
}

impl From<ID> for ObjectId {
    fn from(id: ID) -> Self {
        id.0
    }
}

// Custom scalar for JSON
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JSONObject(pub serde_json::Value);

#[Scalar]
impl ScalarType for JSONObject {
    fn parse(value: Value) -> async_graphql::InputValueResult<Self> {
        match value {
            Value::Object(obj) => {
                let json_value = serde_json::to_value(obj)?;
                Ok(JSONObject(json_value))
            }
            Value::Null => Ok(JSONObject(serde_json::Value::Null)),
            _ => Err(async_graphql::InputValueError::expected_type(value)),
        }
    }

    fn to_value(&self) -> Value {
        match serde_json::to_value(&self.0) {
            Ok(v) => match v {
                serde_json::Value::Object(obj) => {
                    let mut map = async_graphql::indexmap::IndexMap::new();
                    for (k, v) in obj {
                        map.insert(async_graphql::Name::new(k), Value::from_json(v).unwrap_or(Value::Null));
                    }
                    Value::Object(map)
                }
                _ => Value::Null,
            },
            Err(_) => Value::Null,
        }
    }
}

// Media struct (embedded in Record)
#[derive(Debug, Serialize, Deserialize, Clone, SimpleObject)]
pub struct Media {
    pub id: String,
    pub url: String,
    pub hash: String,
    #[serde(rename = "type")]
    #[graphql(name = "type")]
    pub media_type: String,
}

// Record struct (main collection)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Record {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub external_ref: Option<String>,
    pub media: Vec<Media>,
    pub price: Option<f64>,
    pub price_discounted: Option<f64>,
    pub name: Option<String>,
    pub brand: Option<String>,
    pub original_url: Option<String>,
    pub payload: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub synced_at: Option<DateTime<Utc>>,
}

// Variation struct (separate collection)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Variation {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub record_ref: ObjectId,
    pub name: Option<String>,
    pub value: Option<String>,
}

// GraphQL Object for Record (with custom resolvers)
#[derive(SimpleObject)]
#[graphql(complex)]
pub struct RecordGraphQL {
    pub id: ID,
    pub external_ref: Option<String>,
    pub media: Vec<Media>,
    pub price: Option<f64>,
    pub price_discounted: Option<f64>,
    pub name: Option<String>,
    pub brand: Option<String>,
    pub original_url: Option<String>,
    pub payload: Option<JSONObject>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub synced_at: Option<DateTime<Utc>>,
}

impl From<Record> for RecordGraphQL {
    fn from(record: Record) -> Self {
        Self {
            id: ID(record.id),
            external_ref: record.external_ref,
            media: record.media,
            price: record.price,
            price_discounted: record.price_discounted,
            name: record.name,
            brand: record.brand,
            original_url: record.original_url,
            payload: record.payload.map(JSONObject),
            created_at: Some(record.created_at),
            updated_at: Some(record.updated_at),
            synced_at: record.synced_at,
        }
    }
}

// GraphQL Object for Variation
#[derive(SimpleObject)]
pub struct VariationGraphQL {
    pub id: ID,
    pub record_ref: ID,
    pub name: Option<String>,
    pub value: Option<String>,
}

impl From<Variation> for VariationGraphQL {
    fn from(variation: Variation) -> Self {
        Self {
            id: ID(variation.id),
            record_ref: ID(variation.record_ref),
            name: variation.name,
            value: variation.value,
        }
    }
}

// Sort option
#[derive(Debug, Serialize, Deserialize, Clone, InputObject)]
pub struct SortOption {
    pub field: String,
    pub direction: String, // "ASC" or "DESC"
}

// Input types
#[derive(Debug, InputObject)]
pub struct MediaInput {
    pub id: String,
    pub url: String,
    pub hash: String,
    #[graphql(name = "type")]
    pub media_type: String,
}

impl From<MediaInput> for Media {
    fn from(input: MediaInput) -> Self {
        Self {
            id: input.id,
            url: input.url,
            hash: input.hash,
            media_type: input.media_type,
        }
    }
}

#[derive(Debug, InputObject)]
pub struct CreateRecordInput {
    pub external_ref: Option<String>,
    pub media: Option<Vec<MediaInput>>,
    pub price: Option<f64>,
    pub price_discounted: Option<f64>,
    pub name: Option<String>,
    pub brand: Option<String>,
    pub original_url: Option<String>,
    pub payload: Option<JSONObject>,
}

#[derive(Debug, InputObject)]
pub struct UpdateRecordInput {
    pub external_ref: Option<String>,
    pub media: Option<Vec<MediaInput>>,
    pub price: Option<f64>,
    pub price_discounted: Option<f64>,
    pub name: Option<String>,
    pub brand: Option<String>,
    pub original_url: Option<String>,
    pub payload: Option<JSONObject>,
    pub synced_at: Option<DateTime<Utc>>,
}

#[derive(Debug, InputObject)]
pub struct CreateVariationInput {
    pub record_ref: ID,
    pub name: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, InputObject)]
pub struct UpdateVariationInput {
    pub name: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, InputObject)]
pub struct BulkUpdateInput {
    pub id: ID,
    pub input: UpdateRecordInput,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum TaxonomyStatus {
    ACCEPTED,
    IGNORED,
    ACTIVE,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecommendationConfig {
    pub taxonomy_id: ObjectId,
    pub priority: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecordTaxonomy {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub account_id: ObjectId,
    pub taxonomy_class: String,
    pub taxonomy_locale: Document,
    pub status: TaxonomyStatus,
    pub recommendation_configuration: Vec<RecommendationConfig>,
}

#[derive(SimpleObject, Clone)]
#[graphql(name = "RecommendationConfig")]
pub struct RecommendationConfigGraphQL {
    pub taxonomy_id: ID,
    pub priority: i32,
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum TaxonomyStatusGraphQL {
    Accepted,
    Ignored,
    Active,
}

#[derive(SimpleObject, Clone)]
#[graphql(name = "RecordTaxonomy")]
pub struct RecordTaxonomyGraphQL {
    pub id: ID,
    pub account_id: ID,
    pub taxonomy_class: String,
    pub taxonomy_locale: JSONObject,
    pub status: TaxonomyStatusGraphQL,
    pub recommendation_configuration: Vec<RecommendationConfigGraphQL>,
}

impl From<RecordTaxonomy> for RecordTaxonomyGraphQL {
    fn from(t: RecordTaxonomy) -> Self {
        Self {
            id: t.id.into(),
            account_id: t.account_id.into(),
            taxonomy_class: t.taxonomy_class,
            taxonomy_locale: JSONObject(serde_json::to_value(&t.taxonomy_locale).unwrap_or(serde_json::Value::Null)),
            status: match t.status {
                TaxonomyStatus::ACCEPTED => TaxonomyStatusGraphQL::Accepted,
                TaxonomyStatus::IGNORED => TaxonomyStatusGraphQL::Ignored,
                TaxonomyStatus::ACTIVE => TaxonomyStatusGraphQL::Active,
            },
            recommendation_configuration: t.recommendation_configuration.into_iter().map(|c| RecommendationConfigGraphQL {
                taxonomy_id: c.taxonomy_id.into(),
                priority: c.priority,
            }).collect(),
        }
    }
}

#[derive(InputObject)]
pub struct CreateRecordTaxonomyInput {
    pub account_id: ID,
    pub taxonomy_class: String,
    pub taxonomy_locale: JSONObject,
    pub status: Option<TaxonomyStatusGraphQL>,
    pub recommendation_configuration: Option<Vec<CreateRecommendationConfigInput>>,
}

#[derive(InputObject)]
pub struct CreateRecommendationConfigInput {
    pub taxonomy_id: ID,
    pub priority: i32,
}
