use async_graphql::{Schema, EmptySubscription};
use search_service::{schema::{QueryRoot, MutationRoot, SearchSchema}, config::Config};
use serde_json::json;
use tokio::sync::oneshot;
use axum::{Router, routing::post, extract::State};
use std::net::SocketAddr;

#[derive(Clone)]
struct MockState;

async fn mock_search(State(_): State<MockState>) -> axum::Json<serde_json::Value> {
    axum::Json(json!({
        "root": {
            "fields": {"totalCount": 2},
            "children": [
                {"id":"hit","relevance":1.0, "fields": {"id":"1","name":"A","brand":"Nike","price":10.5,"payload":"{}"}},
                {"id":"hit","relevance":0.9, "fields": {"id":"2","name":"B","brand":"Adidas","price":20.0,"payload":"{}"}},
                {"id":"group","children":[
                    {"id":"grouplist:brand","label":"brand","children":[
                        {"value":"Nike","fields":{"count":12}},
                        {"value":"Adidas","fields":{"count":5}}
                    ]}
                ]}
            ]
        },
        "suggestions": [ {"text":"nike","score":0.9} ]
    }))
}

async fn mock_feed() -> axum::Json<serde_json::Value> { axum::Json(json!({})) }

#[tokio::test]
async fn graphql_search_resolver_maps_results_and_facets() {
    // Start mock Vespa server
    async fn mock_deploy() -> axum::Json<serde_json::Value> { axum::Json(json!({"message":"ok"})) }

    let app = Router::new()
        .route("/search/", post(mock_search))
        .route("/application/v2/tenant/default/prepareandactivate", post(mock_deploy))
        // catch-all for document feed endpoint shape (wildcard capture syntax in axum 0.8)
        .route("/document/v1/{*rest}", post(mock_feed))
        .with_state(MockState);
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127,0,0,1], 0))).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = oneshot::channel();
    tokio::spawn(async move { tx.send(()).ok(); axum::serve(listener, app).await.unwrap(); });
    rx.await.ok();

    let base = format!("http://{}:{}", addr.ip(), addr.port());
    let cfg = Config { vespa_endpoint: base.clone(), vespa_deploy_endpoint: base.clone(), app_id: "app".into(), content_cluster_id: "app".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 1, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 500, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5, redis_url: None, enable_autocomplete: false };
    let vespa_client = search_service::vespa::client::VespaClient::new(base.clone());
    let deploy_client = search_service::vespa::client::VespaDeployClient::new(base.clone());
    let schema: SearchSchema = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(cfg)
        .data(vespa_client)
        .data(deploy_client)
        .data(None::<Option<search_service::embeddings::EmbeddingsClient>>)
        .finish();

    // 1. Deploy app (covers deployApp mutation)
    let mut deploy_req = async_graphql::Request::new("mutation($app:String!,$schema:JSON!){ deployApp(appId:$app, schemaJson:$schema) }");
    deploy_req = deploy_req.variables(async_graphql::Variables::from_json(json!({
        "app": "app", "schema": {"tensor_dim":8, "geo_enabled": true}
    })));
    let deploy_resp = schema.execute(deploy_req).await;
    assert!(deploy_resp.errors.is_empty(), "deploy errors: {:?}", deploy_resp.errors);

    // 2. Upsert product (covers upsertProduct mutation)
    let mut upsert_req = async_graphql::Request::new("mutation($app:String!,$tenant:String!,$doc:JSON!){ upsertProduct(appId:$app, tenantId:$tenant, doc:$doc) }");
    upsert_req = upsert_req.variables(async_graphql::Variables::from_json(json!({
    "app":"app",
    "tenant":"tenant",
        "doc": {"id":"1","type":"product","name":"A","brand":"Nike","price":10.5,"payload":{"k":"v"},"embedding":[0.1,0.2,0.3] }
    })));
    let upsert_resp = schema.execute(upsert_req).await;
    assert!(upsert_resp.errors.is_empty(), "upsert errors: {:?}", upsert_resp.errors);

    // 3. Search query (covers search resolver incl facets + suggestions)
    let gql = r#"query($i:SearchInput!){ search(input:$i){ results{ id name brand } facets{ ... on CategoricalFacetResult { field values { value count } } } suggestions{ text } meta{ totalResults } } }"#;
    let mut req = async_graphql::Request::new(gql);
    req = req.variables(async_graphql::Variables::from_json(json!({
        "i": {"appId":"app","query":"nike","facets":[{"field":"brand","type":"CATEGORICAL"}],"pagination":{"limit":10}}
    })));
    let resp = schema.execute(req).await;
    assert!(resp.errors.is_empty(), "unexpected errors: {:?}", resp.errors);
    let data = resp.data.into_json().unwrap();
    let search = data.get("search").unwrap();
    assert_eq!(search.get("results").unwrap().as_array().unwrap().len(), 2);
    assert_eq!(search.get("facets").unwrap().as_array().unwrap().len(), 1);
    assert_eq!(search["meta"]["totalResults"].as_i64(), Some(2));
    if let Some(first) = search["suggestions"].as_array().and_then(|a| a.get(0)) {
        assert_eq!(first["text"], "nike");
    }
}
