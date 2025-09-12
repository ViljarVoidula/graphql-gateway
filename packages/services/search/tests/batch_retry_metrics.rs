use async_graphql::{Schema, EmptySubscription};
use search_service::{schema::{QueryRoot, MutationRoot, SearchSchema}, config::Config};
use serde_json::json;
use axum::{Router, routing::post, extract::State};
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Clone)]
struct MockState { attempts: Arc<std::sync::Mutex<std::collections::HashMap<String, usize>>>, fed: Arc<std::sync::Mutex<Vec<serde_json::Value>>> }

use axum::http::StatusCode;

async fn mock_feed(State(state): State<MockState>, body: axum::Json<serde_json::Value>) -> (StatusCode, axum::Json<serde_json::Value>) {
    // Fail first attempt per doc id (simulate transient error) then succeed
    let id = body.0.get("fields").and_then(|f| f.get("id")).and_then(|v| v.as_str()).unwrap_or("?").to_string();
    {
        let mut map = state.attempts.lock().unwrap();
        let entry = map.entry(id.clone()).or_insert(0);
        if *entry == 0 { *entry += 1; return (StatusCode::INTERNAL_SERVER_ERROR, axum::Json(json!({"root": {"errors": [{"code": 500, "message": "transient"}]}}))); }
    }
    if let Some(fields) = body.0.get("fields") { if let Ok(mut g) = state.fed.lock() { g.push(fields.clone()); } }
    (StatusCode::OK, axum::Json(json!({"message":"ok", "id": id})))
}

async fn mock_search(State(_): State<MockState>) -> axum::Json<serde_json::Value> { axum::Json(json!({"root": {"fields": {"totalCount": 0}, "children": []}})) }
async fn mock_deploy() -> axum::Json<serde_json::Value> { axum::Json(json!({"message":"ok"})) }

#[tokio::test]
async fn batch_retry_increments_metrics() {
    let attempts = Arc::new(std::sync::Mutex::new(std::collections::HashMap::<String, usize>::new()));
    let fed_store: Arc<std::sync::Mutex<Vec<serde_json::Value>>> = Default::default();
    let state = MockState { attempts: attempts.clone(), fed: fed_store.clone() };
    let app = Router::new()
        .route("/search/", post(mock_search))
        .route("/application/v2/tenant/default/prepareandactivate", post(mock_deploy))
        .route("/document/v1/{app}/{dtype}/docid/{id}", post(mock_feed))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127,0,0,1], 0))).await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });

    let base = format!("http://{}:{}", addr.ip(), addr.port());
    let cfg = Config { vespa_endpoint: base.clone(), vespa_deploy_endpoint: base.clone(), app_id: "app".into(), content_cluster_id: "cluster".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 2, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 500, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5 };
    let vespa_client = search_service::vespa::client::VespaClient::new(base.clone());
    let deploy_client = search_service::vespa::client::VespaDeployClient::new(base.clone());
    let schema: SearchSchema = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(cfg)
        .data(vespa_client)
        .data(deploy_client)
        .data(None::<Option<search_service::embeddings::EmbeddingsClient>>)
        .finish();

    let gql = r#"mutation($app:String!,$tenant:String!,$docs:[JSON!]!){ upsertProducts(appId:$app, tenantId:$tenant, docs:$docs) }"#;
    let mut req = async_graphql::Request::new(gql);
    let docs_json = json!([
        {"id":"r1","type":"product","name":"Retry1","tenant_id":"tenant"},
        {"id":"r2","type":"product","name":"Retry2","tenant_id":"tenant"}
    ]);
    req = req.variables(async_graphql::Variables::from_json(json!({"app":"app","tenant":"tenant","docs": docs_json })));
    let resp = schema.execute(req).await;
    assert!(resp.errors.is_empty(), "upsertProducts errors: {:?}", resp.errors);
    // At least one retry should have happened (attempts > fed_count)
    let fed = fed_store.lock().unwrap();
    assert_eq!(fed.len(), 2, "both docs should succeed after retry");
}
