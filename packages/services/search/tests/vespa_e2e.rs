use std::time::Duration;

use async_graphql::EmptySubscription;
use async_graphql::Schema;
use search_service::{config::Config, schema::{QueryRoot, MutationRoot, SearchSchema}};
use serde_json::json;
use testcontainers::{runners::AsyncRunner, GenericImage};

#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn e2e_vespa_deploy_feed_search() {
    // Start Vespa container
    use testcontainers::core::ContainerPort;
    let image = GenericImage::new("vespaengine/vespa", "8.578.22")
        .with_exposed_port(ContainerPort::Tcp(8080))
        .with_exposed_port(ContainerPort::Tcp(19071))
        .with_wait_for(testcontainers::core::WaitFor::seconds(15));
    let container = image.start().await.expect("start container");

    // Testcontainers typically maps to localhost
    let host = "127.0.0.1";
    let http_port = container.get_host_port_ipv4(8080).await.expect("map http port");
    let deploy_port = container.get_host_port_ipv4(19071).await.expect("map deploy port");
    let base_http = format!("http://{}:{}", host, http_port);
    let base_deploy = format!("http://{}:{}", host, deploy_port);

    // Config and clients
    let cfg = Config { vespa_endpoint: base_http.clone(), vespa_deploy_endpoint: base_deploy.clone(), app_id: "demo-app".into(), content_cluster_id: "demo-app".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 1, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 1000, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5, redis_url: None, enable_autocomplete: false };
    let vespa_client = search_service::vespa::client::VespaClient::new(base_http);
    let deploy_client = search_service::vespa::client::VespaDeployClient::new(base_deploy);

    let schema: SearchSchema = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(cfg)
        .data(vespa_client)
        .data(deploy_client)
        .finish();

    // Deploy app
    let mut request = async_graphql::Request::new("mutation($app:String!,$schema:JSON!){ deployApp(appId:$app, schemaJson:$schema) }");
    let vars = async_graphql::Variables::from_json(json!({
        "app": "demo-app",
        "schema": {"tensor_dim":8, "geo_enabled": true}
    }));
    request = request.variables(vars);
    let _ = tokio::time::timeout(Duration::from_secs(120), schema.execute(request)).await.expect("deploy timed out");

    // Feed one doc
    let mut feed = async_graphql::Request::new("mutation($app:String!,$doc:JSON!){ upsertProduct(appId:$app, doc:$doc) }");
    let vars = async_graphql::Variables::from_json(json!({
        "app": "demo-app",
        "doc": {
            "id":"sku-1","type":"product","name":"Rolex Submariner","brand":"Rolex","price":9999.0,
            "payload": {"material":"steel"},
            "embedding":[0.1,0.2,0.3,0.4,0.1,0.2,0.3,0.4]
        }
    }));
    feed = feed.variables(vars);
    let _ = tokio::time::timeout(Duration::from_secs(30), schema.execute(feed)).await.expect("feed timed out");

    // Query
    let mut q = async_graphql::Request::new("query($i:SearchInput!){ search(input:$i){ meta{ totalResults } results{ id } } }");
    let vars = async_graphql::Variables::from_json(json!({
        "i": {"appId":"demo-app","query":"rolex","pagination":{"limit":5}}
    }));
    q = q.variables(vars);
    let resp = tokio::time::timeout(Duration::from_secs(60), schema.execute(q)).await.expect("search timed out");
    assert!(resp.errors.is_empty(), "no GraphQL errors: {:?}", resp.errors);
}
