use std::collections::HashMap;

use axum::{routing::get, Router, http::StatusCode};
use axum::extract::Query;
use serde::Deserialize;
use serde_json::{json, Value};

use ingestion_service::handlers::api::{ApiHandler, PaginationConfig, PaginationType};
use ingestion_service::models::{AuthConfig, AuthType};

#[tokio::test]
async fn test_fetch_data_success_variants() {
    let app = Router::new()
        .route("/items", get(|| async { axum::Json(json!({"items": [{"id":"a"},{"id":"b"}]})) }))
        .route("/data", get(|| async { axum::Json(json!({"data": [{"id":"c"}]})) }))
        .route("/results", get(|| async { axum::Json(json!({"results": [{"id":"d"}]})) }))
        .route("/records", get(|| async { axum::Json(json!({"records": [{"id":"e"},{"id":"f"}]})) }))
        .route("/array", get(|| async { axum::Json(json!([{"id":"g"},{"id":"h"}])) }))
        .route("/object", get(|| async { axum::Json(json!({"id":"i"})) }));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let base = format!("http://{}", addr);

    let handler = ApiHandler::new_without_redis();

    for path in ["/items","/data","/results","/records","/array","/object"] {
        let url = format!("{}{}", base, path);
    let res = handler.fetch_data(&url, None, None, None).await.unwrap();
        assert!(!res.is_empty(), "{} should yield records", path);
    }
}

#[tokio::test]
async fn test_fetch_data_error_status() {
    let app = Router::new().route("/bad", get(|| async { (StatusCode::BAD_REQUEST, "oops") }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let base = format!("http://{}", addr);

    let handler = ApiHandler::new_without_redis();
    let err = handler.fetch_data(&format!("{}/bad", base), None, None, None).await.err().unwrap();
    let msg = format!("{}", err);
    assert!(msg.contains("API request failed"));
}

#[tokio::test]
async fn test_fetch_data_auth_bearer_basic_api_key() {
    let app = Router::new()
        .route("/auth/bearer", get(|headers: axum::http::HeaderMap| async move {
            match headers.get(axum::http::header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
                Some("Bearer secrettoken") => (StatusCode::OK, axum::Json(json!([{"ok":true}]))),
                _ => (StatusCode::UNAUTHORIZED, axum::Json(json!({"error":"unauth"}))),
            }
        }))
        .route("/auth/basic", get(|headers: axum::http::HeaderMap| async move {
            let ok = headers.get(axum::http::header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.starts_with("Basic "))
                .unwrap_or(false);
            if ok { (StatusCode::OK, axum::Json(json!([{"ok":true}]))) } else { (StatusCode::UNAUTHORIZED, axum::Json(json!({"error":"unauth"}))) }
        }))
        .route("/auth/api-key", get(|headers: axum::http::HeaderMap| async move {
            let ok = headers.get("X-API-Key").and_then(|v| v.to_str().ok()) == Some("k123");
            if ok { (StatusCode::OK, axum::Json(json!([{"ok":true}]))) } else { (StatusCode::UNAUTHORIZED, axum::Json(json!({"error":"unauth"}))) }
        }))
        .route("/auth/api-key-custom", get(|headers: axum::http::HeaderMap| async move {
            let ok = headers.get("X-My-Key").and_then(|v| v.to_str().ok()) == Some("v456");
            if ok { (StatusCode::OK, axum::Json(json!([{"ok":true}]))) } else { (StatusCode::UNAUTHORIZED, axum::Json(json!({"error":"unauth"}))) }
        }));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let base = format!("http://{}", addr);

    let handler = ApiHandler::new_without_redis();

    // Bearer
    let mut creds = HashMap::new();
    creds.insert("token".into(), "secrettoken".into());
    let auth = AuthConfig { auth_type: AuthType::Bearer, credentials: creds };
    handler.fetch_data(&format!("{}/auth/bearer", base), Some(&auth), None, None).await.unwrap();

    // Basic
    let mut creds = HashMap::new();
    creds.insert("username".into(), "u".into());
    creds.insert("password".into(), "p".into());
    let auth = AuthConfig { auth_type: AuthType::BasicAuth, credentials: creds };
    handler.fetch_data(&format!("{}/auth/basic", base), Some(&auth), None, None).await.unwrap();

    // API Key default header
    let mut creds = HashMap::new();
    creds.insert("api_key".into(), "k123".into());
    let auth = AuthConfig { auth_type: AuthType::ApiKey, credentials: creds };
    handler.fetch_data(&format!("{}/auth/api-key", base), Some(&auth), None, None).await.unwrap();

    // API Key custom header
    let mut creds = HashMap::new();
    creds.insert("api_key".into(), "v456".into());
    creds.insert("header_name".into(), "X-My-Key".into());
    let auth = AuthConfig { auth_type: AuthType::ApiKey, credentials: creds };
    handler.fetch_data(&format!("{}/auth/api-key-custom", base), Some(&auth), None, None).await.unwrap();
}

#[derive(Deserialize)]
struct PageQuery { page: Option<u32>, limit: Option<u32>, offset: Option<u32> }

#[tokio::test]
async fn test_fetch_paginated_data_page_and_offset() {
    let app = Router::new()
        .route("/paginate/page", get(|Query(q): Query<PageQuery>| async move {
            let page = q.page.unwrap_or(1);
            let limit = q.limit.unwrap_or(2);
            if page > 2 { return axum::Json(json!([])); }
            let mut items: Vec<Value> = Vec::new();
            for i in 0..limit { items.push(json!({"id": format!("p{}-{}", page, i)})); }
            axum::Json(json!({"items": items}))
        }))
        .route("/paginate/offset", get(|Query(q): Query<PageQuery>| async move {
            let offset = q.offset.unwrap_or(0);
            let limit = q.limit.unwrap_or(2);
            if offset >= 4 { return axum::Json(json!([])); }
            let mut items: Vec<Value> = Vec::new();
            for i in 0..limit { items.push(json!({"id": format!("o{}", offset + i)})); }
            axum::Json(json!({"data": items}))
        }));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let base = format!("http://{}", addr);

    let handler = ApiHandler::new_without_redis();

    // Page-based
    let cfg = PaginationConfig { pagination_type: PaginationType::Page, page_size: 2, max_pages: Some(2), cursor_field: None };
    let res = handler.fetch_paginated_data(&format!("{}/paginate/page", base), None, None, Some(&cfg)).await.unwrap();
    assert_eq!(res.len(), 4);

    // Offset-based
    let cfg = PaginationConfig { pagination_type: PaginationType::Offset, page_size: 2, max_pages: Some(2), cursor_field: None };
    let res = handler.fetch_paginated_data(&format!("{}/paginate/offset", base), None, None, Some(&cfg)).await.unwrap();
    assert_eq!(res.len(), 4);
}
