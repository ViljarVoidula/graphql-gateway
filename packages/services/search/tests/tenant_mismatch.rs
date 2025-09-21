use async_graphql::{Schema, EmptySubscription};
use search_service::{schema::{QueryRoot, MutationRoot, SearchSchema}, config::Config};
use serde_json::json;

#[tokio::test]
async fn tenant_mismatch_single_upsert() {
    let cfg = Config { vespa_endpoint: "http://invalid".into(), vespa_deploy_endpoint: "http://invalid".into(), app_id: "app".into(), content_cluster_id: "app".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "default".into(), feed_batch_size: 10, feed_max_concurrency: 1, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 500, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5, redis_url: None, enable_autocomplete: false };
    let schema: SearchSchema = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(cfg)
        .data(search_service::vespa::client::VespaClient::new("http://invalid".into()))
        .data(search_service::vespa::client::VespaDeployClient::new("http://invalid".into()))
        .data(None::<Option<search_service::embeddings::EmbeddingsClient>>)
        .finish();

    let mut req = async_graphql::Request::new("mutation($app:String!,$tenant:String!,$doc:JSON!){ upsertProduct(appId:$app, tenantId:$tenant, doc:$doc) }");
    req = req.variables(async_graphql::Variables::from_json(json!({
        "app":"app",
        "tenant":"tenantA",
        "doc": {"id":"1","type":"product","tenant_id":"different","name":"A"}
    })));
    let resp = schema.execute(req).await;
    assert!(!resp.errors.is_empty(), "expected tenant mismatch error");
    let msg = resp.errors[0].message.clone();
    assert!(msg.contains("tenant_id mismatch"), "message: {}", msg);
}
