use async_graphql::{Schema, EmptySubscription};
use search_service::{schema::{QueryRoot, MutationRoot, SearchSchema}, config::Config};
use serde_json::json;

#[tokio::test]
async fn error_on_query_and_weighted_query() {
    let cfg = Config { vespa_endpoint: "http://invalid".into(), vespa_deploy_endpoint: "http://invalid".into(), app_id: "app".into(), content_cluster_id: "app".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 1, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 500, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5 };
    let dummy_vespa = search_service::vespa::client::VespaClient::new(cfg.vespa_endpoint.clone());
    let dummy_deploy = search_service::vespa::client::VespaDeployClient::new(cfg.vespa_deploy_endpoint.clone());
    let schema: SearchSchema = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(cfg)
        .data(dummy_vespa)
        .data(dummy_deploy)
        .finish();

    let mut req = async_graphql::Request::new("query($i:SearchInput!){ search(input:$i){ meta{ totalResults } } }");
    req = req.variables(async_graphql::Variables::from_json(json!({
        "i": {"appId":"app","query":"foo","weightedQuery":{"bar":2}}
    })));
    let resp = schema.execute(req).await;
    assert!(!resp.errors.is_empty(), "expected validation error");
    let msg = resp.errors[0].message.clone();
    assert!(msg.contains("either query or weightedQuery"), "message: {}", msg);
}
