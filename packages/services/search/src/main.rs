use std::net::SocketAddr;

use async_graphql::{EmptySubscription, Schema};
use axum::{response::{Html, IntoResponse}, routing::get, Router, Extension, http::{StatusCode, HeaderMap}};
use axum::body::Bytes;
use tracing_subscriber::{fmt, EnvFilter};
use tower_http::trace::{TraceLayer, DefaultOnRequest, DefaultOnResponse};
use axum::http::Request;

mod config;
mod error;
mod models;
mod schema;
mod vespa;
mod indexer;
mod metrics;
mod embeddings;
mod index_config;
mod autocomplete;

use crate::schema::{MutationRoot, QueryRoot, SearchSchema};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Logging
    let filter = EnvFilter::from_default_env().add_directive("info".parse().unwrap());
    // Structured JSON logs (switch to pretty if you prefer human-readable)
    fmt()
        .with_env_filter(filter)
        .json()
        .flatten_event(true)
        .with_current_span(true)
        .with_span_list(true)
        .init();

    let cfg = config::Config::from_env();
    tracing::info!(
        vespa_endpoint = %cfg.vespa_endpoint,
        vespa_deploy_endpoint = %cfg.vespa_deploy_endpoint,
        app_id = %cfg.app_id,
        "loaded config"
    );

    let vespa_client = vespa::client::VespaClient::new(cfg.vespa_endpoint.clone());
    let deploy_client = vespa::client::VespaDeployClient::new(cfg.vespa_deploy_endpoint.clone());

    let embeddings_client: Option<embeddings::EmbeddingsClient> = cfg.embeddings_service_url.clone().map(|url| {
        embeddings::EmbeddingsClient::new(url, cfg.embeddings_use_msgpack, cfg.embeddings_timeout_ms)
    });

    let mut schema_builder = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(cfg.clone())
        .data(vespa_client.clone())
        .data(deploy_client.clone())
        .data(embeddings_client.clone());

    // Optional: Redis autocomplete client (enabled if REDIS_URL is provided)
    if let Some(url) = cfg.redis_url.as_ref() {
        match autocomplete::AutocompleteClient::new(url).await {
            Ok(client) => {
                schema_builder = schema_builder.data(client);
                tracing::info!("autocomplete: enabled via Redis");
            }
            Err(e) => {
                tracing::error!(error=%e, "failed to init Redis autocomplete client; autocomplete disabled");
            }
        }
    }
    let schema: SearchSchema = schema_builder.finish();

    // Optionally auto-deploy an application package on startup (idempotent for simple use-case)
    if cfg.auto_deploy {
        let deploy_client_clone = deploy_client.clone();
        let cfg_clone = cfg.clone();
        tokio::spawn(async move {
            let app_id = cfg_clone.app_id.clone();
            let tensor_dim = cfg_clone.default_tensor_dim;
            let geo_enabled = cfg_clone.default_geo_enabled;
            tracing::info!(app_id=%app_id, "auto-deploy: starting");
            let pkg_json = serde_json::json!({
                "tensor_dim": tensor_dim,
                "geo_enabled": geo_enabled,
                // Pass explicit cluster id for stability (avoid accidental cluster id changes)
                "cluster_id": cfg_clone.content_cluster_id
            });
            match crate::indexer::app_package::AppPackage::from_dynamic_json(&app_id, &cfg_clone.schema_version, pkg_json) {
                Ok(pkg) => {
                    for attempt in 1..=10 {
                        match deploy_client_clone.deploy_package(&pkg).await {
                            Ok(_) => { tracing::info!(attempt, app_id=%app_id, "auto-deploy: success"); break; },
                            Err(e) => {
                                tracing::warn!(error=%e, attempt, "auto-deploy: deploy failed, retrying");
                                tokio::time::sleep(std::time::Duration::from_secs(6)).await;
                            }
                        }
                    }
                }
                Err(e) => tracing::error!(error=%e, "auto-deploy: failed to build package"),
            }
        });
    }

    // Expose the GraphQL endpoint (queries & mutations) and the playground on the same /graphql path.
    async fn graphql_playground() -> Html<String> {
        Html(async_graphql::http::playground_source(
            async_graphql::http::GraphQLPlaygroundConfig::new("/graphql"),
        ))
    }

    // Manual GraphQL POST handler to surface parse errors (returns standard GraphQL JSON)
    async fn graphql_post(Extension(schema): Extension<SearchSchema>, headers: HeaderMap, body: Bytes) -> (StatusCode, axum::response::Response) {
        let req_id = nanoid::nanoid!(10);
        let started = std::time::Instant::now();
        let raw = String::from_utf8_lossy(&body);
        // Parse outer JSON
        let json: serde_json::Value = match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(target="graphql.parse", req.id=%req_id, error=%e, body.preview=%raw.chars().take(200).collect::<String>(), "invalid request JSON");
                let resp = async_graphql::Response::from_errors(vec![async_graphql::ServerError::new("invalid JSON body", None)]);
                return (StatusCode::BAD_REQUEST, axum::Json(resp).into_response());
            }
        };
        let query = json.get("query").and_then(|v| v.as_str());
        if query.is_none() {
            tracing::error!(target="graphql.parse", req.id=%req_id, "missing query field");
            let resp = async_graphql::Response::from_errors(vec![async_graphql::ServerError::new("missing 'query' field", None)]);
            return (StatusCode::BAD_REQUEST, axum::Json(resp).into_response());
        }
        let op_name = json.get("operationName").and_then(|v| v.as_str()).map(|s| s.to_string());
        let vars = json.get("variables").cloned().unwrap_or(serde_json::Value::Null);
        let mut gql_req = async_graphql::Request::new(query.unwrap().to_string())
            .variables(async_graphql::Variables::from_json(vars));
        if let Some(op) = op_name.clone() { gql_req = gql_req.operation_name(op); }
    let resp = schema.execute(gql_req).await;
        let took_ms = started.elapsed().as_millis();
        if !resp.errors.is_empty() {
            for err in &resp.errors {
                let locs: Vec<String> = err.locations.iter().map(|l| format!("{}:{}", l.line, l.column)).collect();
                let path = err.path.iter().map(|seg| match seg { async_graphql::PathSegment::Field(n) => n.clone(), async_graphql::PathSegment::Index(i) => i.to_string() }).collect::<Vec<_>>();
                tracing::error!(target="graphql.exec", req.id=%req_id, took.ms=took_ms as u64, op.name=?op_name, error.message=%err.message, error.path=?path, error.locations=?locs, error.extensions=?err.extensions, "graphql request failed");
            }
        } else {
            tracing::info!(target="graphql.exec", req.id=%req_id, took.ms=took_ms as u64, op.name=?op_name, "graphql request ok");
        }
        // If client signals msgpack support
        let wants_msgpack = headers.get("x-msgpack-enabled").and_then(|v| v.to_str().ok()).map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
        if wants_msgpack {
            match rmp_serde::to_vec_named(&resp) {
                Ok(bin) => {
                    let mut response = axum::response::Response::new(bin.into());
                    *response.status_mut() = StatusCode::OK;
                    response.headers_mut().insert(axum::http::header::CONTENT_TYPE, axum::http::HeaderValue::from_static("application/x-msgpack"));
                    return (StatusCode::OK, response)
                }
                Err(e) => {
                    tracing::error!(error=%e, "failed to encode msgpack response");
                }
            }
        }
        (StatusCode::OK, axum::Json(resp).into_response())
    }

    // Simple metrics endpoint (JSON) to surface embedding latency histogram
    async fn metrics_handler() -> (StatusCode, String) {
        let json = crate::metrics::export_metrics_json();
        let body = serde_json::to_string(&json).unwrap_or_else(|_| "{}".to_string());
        (StatusCode::OK, body)
    }

    let app = Router::new()
        .route(
            "/graphql",
            get(graphql_playground).post(graphql_post),
        )
        .route("/metrics", get(metrics_handler))
        .layer(Extension(schema))
        .layer(
            TraceLayer::new_for_http()
                .on_request(DefaultOnRequest::new().level(tracing::Level::INFO))
                .on_response(DefaultOnResponse::new().level(tracing::Level::INFO))
                .make_span_with(|req: &Request<_>| {
                    let id = nanoid::nanoid!(8);
                    tracing::info_span!(
                        "http.request",
                        req.id = %id,
                        http.method = %req.method(),
                        http.path = %req.uri().path(),
                        user_agent = req.headers().get("user-agent").and_then(|v| v.to_str().ok()),
                    )
                }),
        );

    let addr: SocketAddr = "0.0.0.0:8088".parse().unwrap();
    tracing::info!("search-service listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
