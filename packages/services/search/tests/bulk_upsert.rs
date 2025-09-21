use async_graphql::{Schema, EmptySubscription};
use search_service::{schema::{QueryRoot, MutationRoot, SearchSchema}, config::Config};
use serde_json::json;
use axum::{Router, routing::post, extract::State};
use std::net::SocketAddr;

#[derive(Clone)]
struct MockState { fed: std::sync::Arc<std::sync::Mutex<Vec<serde_json::Value>>> }

async fn mock_feed(State(state): State<MockState>, body: axum::Json<serde_json::Value>) -> axum::Json<serde_json::Value> {
    // Capture each feed (single doc path) by pushing fields object
    if let Some(fields) = body.0.get("fields") { if let Ok(mut g) = state.fed.lock() { g.push(fields.clone()); } }
    axum::Json(json!({"message":"ok"}))
}

async fn mock_search(State(_): State<MockState>) -> axum::Json<serde_json::Value> { axum::Json(json!({"root": {"fields": {"totalCount": 2}, "children": []}})) }
async fn mock_deploy() -> axum::Json<serde_json::Value> { axum::Json(json!({"message":"ok"})) }

#[tokio::test]
async fn bulk_upsert_invokes_per_doc_feeds() {
    let fed_store: std::sync::Arc<std::sync::Mutex<Vec<serde_json::Value>>> = Default::default();
    let state = MockState { fed: fed_store.clone() };
    // Router matching /document/v1/<app>/<type>/docid/<id>
    let app = Router::new()
        .route("/search/", post(mock_search))
        .route("/application/v2/tenant/default/prepareandactivate", post(mock_deploy))
        // axum 0.8 capture syntax uses {param}
        .route("/document/v1/{app}/{dtype}/docid/{id}", post(mock_feed))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127,0,0,1], 0))).await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });

    let base = format!("http://{}:{}", addr.ip(), addr.port());
    let cfg = Config { vespa_endpoint: base.clone(), vespa_deploy_endpoint: base.clone(), app_id: "app".into(), content_cluster_id: "cluster".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 4, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 500, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5, redis_url: None, enable_autocomplete: false };
    let vespa_client = search_service::vespa::client::VespaClient::new(base.clone());
    let deploy_client = search_service::vespa::client::VespaDeployClient::new(base.clone());
    let schema: SearchSchema = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(cfg)
        .data(vespa_client)
        .data(deploy_client)
        .data(None::<Option<search_service::embeddings::EmbeddingsClient>>)
        .finish();

    // Issue mutation
    let gql = r#"mutation($app:String!,$tenant:String!,$docs:[JSON!]!){ upsertProducts(appId:$app, tenantId:$tenant, docs:$docs) }"#;
    let mut req = async_graphql::Request::new(gql);
    let docs_json = json!([
        {"id":"1","type":"product","name":"A","tenant_id":"tenant"},
        {"id":"2","type":"product","name":"B","tenant_id":"tenant"}
    ]);
    req = req.variables(async_graphql::Variables::from_json(json!({"app":"app","tenant":"tenant","docs": docs_json })));
    let resp = schema.execute(req).await;
    assert!(resp.errors.is_empty(), "bulk upsert errors: {:?}", resp.errors);
    // Confirm two feeds recorded
    let fed = fed_store.lock().unwrap();
    assert_eq!(fed.len(), 2, "expected 2 individual feed calls, got {:?}", fed.len());
    let names: Vec<String> = fed.iter().filter_map(|f| f.get("name").and_then(|v| v.as_str()).map(|s| s.to_string())).collect();
    assert!(names.contains(&"A".to_string()) && names.contains(&"B".to_string()));
}
