use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

use crate::models::*;
use reqwest::header::USER_AGENT;
use crate::config::Config;

pub struct ApiHandler {
    client: Client,
}

impl ApiHandler {
    pub fn new() -> Self { Self::with_config(None) }

    pub fn with_config(cfg: Option<&Config>) -> Self {
        let timeout = cfg.map(|c| c.http_timeout_ms).unwrap_or(300_000);
        let ua = cfg
            .map(|c| c.http_user_agent.as_str())
            .unwrap_or("ingestion-service/1.0");

        let client = Client::builder()
            .timeout(Duration::from_millis(timeout))
            .user_agent(ua)
            .build()
            .expect("Failed to create HTTP client");
        Self { client }
    }

    // Backwards-compatible constructor used in tests; identical to new()
    #[allow(dead_code)]
    pub fn new_without_redis() -> Self {
        Self::new()
    }

    pub async fn fetch_data(
        &self,
        endpoint: &str,
        auth: Option<&AuthConfig>,
        headers: Option<&HashMap<String, String>>,
        timeout_override: Option<std::time::Duration>,
    ) -> Result<Vec<Value>> {
        let mut request_builder = self.client.get(endpoint);

        // Add authentication
        if let Some(auth_config) = auth {
            request_builder = self.add_auth(request_builder, auth_config)?;
        }

        // Add custom headers
        if let Some(custom_headers) = headers {
            for (key, value) in custom_headers {
                request_builder = request_builder.header(key, value);
            }
        }

        // Set default headers (User-Agent already set on client, but keep Accept here)
        request_builder = request_builder.header("Accept", "application/json");

        // Apply per-request timeout override if provided
        if let Some(dur) = timeout_override {
            request_builder = request_builder.timeout(dur);
        }

        // Debug log the final User-Agent being sent
        if let Some(rb) = request_builder.try_clone() {
            if let Ok(req) = rb.build() {
                if let Some(ua) = req.headers().get(USER_AGENT) {
                    if let Ok(ua_str) = ua.to_str() {
                        tracing::debug!(user_agent = ua_str, url = endpoint, "Sending API request");
                    }
                } else {
                    tracing::debug!(url = endpoint, "Sending API request without explicit User-Agent header (client default may apply)");
                }
            }
        }

    let response = request_builder.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let msg = format!("API request failed with status: {} body={} ", status, body);
            return Err(IngestionError::Sync(msg));
        }

        let body: Value = response.json().await?;
        self.extract_records(&body).await
    }

    fn add_auth(
        &self,
        request_builder: reqwest::RequestBuilder,
        auth_config: &AuthConfig,
    ) -> Result<reqwest::RequestBuilder> {
        match auth_config.auth_type {
            AuthType::Bearer => {
                if let Some(token) = auth_config.credentials.get("token") {
                    Ok(request_builder.bearer_auth(token))
                } else {
                    Err(IngestionError::Configuration("Bearer token not found".to_string()))
                }
            },
            AuthType::BasicAuth => {
                let username = auth_config.credentials.get("username")
                    .ok_or_else(|| IngestionError::Configuration("Basic auth username not found".to_string()))?;
                let password = auth_config.credentials.get("password")
                    .ok_or_else(|| IngestionError::Configuration("Basic auth password not found".to_string()))?;
                Ok(request_builder.basic_auth(username, Some(password)))
            },
            AuthType::ApiKey => {
                let api_key = auth_config.credentials.get("api_key")
                    .ok_or_else(|| IngestionError::Configuration("API key not found".to_string()))?;
                let header_name = auth_config
                    .credentials
                    .get("header_name")
                    .cloned()
                    .unwrap_or_else(|| "X-API-Key".to_string());
                Ok(request_builder.header(header_name, api_key))
            },
            AuthType::OAuth2 => {
                // OAuth2 implementation would require token refresh logic
                // For now, assume the token is already valid
                if let Some(token) = auth_config.credentials.get("access_token") {
                    Ok(request_builder.bearer_auth(token))
                } else {
                    Err(IngestionError::Configuration("OAuth2 access token not found".to_string()))
                }
            },
        }
    }

    async fn extract_records(&self, data: &Value) -> Result<Vec<Value>> {
        // Try common API response patterns
        let records = if let Some(items) = data.get("items").and_then(|v| v.as_array()) {
            // { "items": [...] }
            items.clone()
        } else if let Some(data_array) = data.get("data").and_then(|v| v.as_array()) {
            // { "data": [...] }
            data_array.clone()
        } else if let Some(results) = data.get("results").and_then(|v| v.as_array()) {
            // { "results": [...] }
            results.clone()
        } else if let Some(records) = data.get("records").and_then(|v| v.as_array()) {
            // { "records": [...] }
            records.clone()
        } else if data.is_array() {
            // Direct array response
            data.as_array().unwrap().clone()
        } else {
            // Single object response
            vec![data.clone()]
        };

        tracing::debug!(
            record_count = records.len(),
            "Extracted records from API response"
        );

        Ok(records)
    }

    // Handle paginated APIs
    #[allow(dead_code)]
    pub async fn fetch_paginated_data(
        &self,
        endpoint: &str,
        auth: Option<&AuthConfig>,
        headers: Option<&HashMap<String, String>>,
        pagination_config: Option<&PaginationConfig>,
    ) -> Result<Vec<Value>> {
        let mut all_records = Vec::new();
        let current_url = endpoint.to_string();
        let mut page = 1;

        loop {
            // Add pagination parameters
            let url_with_pagination = if let Some(config) = pagination_config {
                self.add_pagination_params(&current_url, page, config)
            } else {
                current_url.clone()
            };

            let batch_records = self.fetch_data(&url_with_pagination, auth, headers, None).await?;
            
            if batch_records.is_empty() {
                break;
            }

            all_records.extend(batch_records);

            // Check if we should continue pagination
            if let Some(config) = pagination_config {
                if let Some(max_pages) = config.max_pages {
                    if page >= max_pages {
                        break;
                    }
                }
                page += 1;
            } else {
                break; // No pagination config, single request only
            }
        }

        Ok(all_records)
    }

    #[allow(dead_code)]
    fn add_pagination_params(&self, base_url: &str, page: u32, config: &PaginationConfig) -> String {
        let separator = if base_url.contains('?') { "&" } else { "?" };
        
        match config.pagination_type {
            PaginationType::Page => {
                format!("{}{}page={}&limit={}", base_url, separator, page, config.page_size)
            },
            PaginationType::Offset => {
                let offset = (page - 1) * config.page_size;
                format!("{}{}offset={}&limit={}", base_url, separator, offset, config.page_size)
            },
            PaginationType::Cursor => {
                // Cursor-based pagination would need to track the cursor from previous responses
                // This is a simplified implementation
                format!("{}{}limit={}", base_url, separator, config.page_size)
            },
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PaginationConfig {
    pub pagination_type: PaginationType,
    pub page_size: u32,
    pub max_pages: Option<u32>,
    pub cursor_field: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum PaginationType {
    Page,    // ?page=1&limit=100
    Offset,  // ?offset=0&limit=100
    Cursor,  // ?cursor=xyz&limit=100
}
