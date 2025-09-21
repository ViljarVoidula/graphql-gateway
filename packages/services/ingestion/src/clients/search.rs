use reqwest::{Client, StatusCode};
use serde_json::Value;
use crate::models::*;

#[derive(Clone)]
pub struct SearchServiceClient {
    client: Client,
    base_url: String,
    user_agent: String,
    max_retries: u32,
    base_backoff_ms: u64,
}

impl SearchServiceClient {
    pub fn new(base_url: String, timeout_ms: u64, user_agent: String, max_retries: u32, base_backoff_ms: u64) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_millis(timeout_ms))
            .connect_timeout(std::time::Duration::from_millis(timeout_ms.min(10_000)))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url,
            user_agent,
            max_retries,
            base_backoff_ms,
        }
    }

    // Deprecated: index config is served by the embeddings service, not the search service.
    // Kept for compatibility; always returns an error to steer callers to use EmbeddingsServiceClient::get_index_config
    pub async fn get_index_config(&self, _app_id: &str) -> Result<(Vec<(String, f32)>, Option<u32>)> {
        Err(IngestionError::Sync("get_index_config moved: use embeddings_client.get_index_config".into()))
    }

    pub async fn upsert_products_batch(
        &self,
        app_id: &str,
        tenant_id: Option<&str>,
        documents: Vec<Value>,
    ) -> Result<()> {
        let mutation = r#"
            mutation UpsertProducts($appId: String!, $tenantId: String, $docs: [JSON!]!) {
                upsertProducts(appId: $appId, tenantId: $tenantId, docs: $docs)
            }
        "#;

        let variables = serde_json::json!({
            "appId": app_id,
            "tenantId": tenant_id,
            "docs": documents
        });

        let body = serde_json::json!({
            "query": mutation,
            "variables": variables
        });

        // Simple bounded exponential backoff retry loop
        let url = format!("{}/graphql", self.base_url);
        let mut attempt: u32 = 0;
        loop {
            tracing::info!(app_id = %app_id, tenant = ?tenant_id, docs = documents.len(), attempt = attempt+1, "search upsert: sending request");
            let resp_res = self.client
                .post(&url)
                .header("Content-Type", "application/json")
                .header("User-Agent", &self.user_agent)
                .json(&body)
                .send()
                .await;

            match resp_res {
                Ok(response) => {
                    if response.status().is_success() {
                        let result: Value = response.json().await?;
                        // Check for GraphQL errors
                        if let Some(errors) = result.get("errors") {
                            return Err(IngestionError::Sync(format!(
                                "Search service GraphQL errors: {}",
                                errors
                            )));
                        }
                        tracing::info!(app_id = %app_id, tenant = ?tenant_id, document_count = documents.len(), "search upsert: success");
                        break;
                    }

                    let status = response.status();
                    let text = response.text().await.unwrap_or_default();
                    tracing::warn!(status = %status, body_preview = %text.chars().take(200).collect::<String>(), "search upsert: non-success response");
                    let transient = status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS;
                    if transient && attempt < self.max_retries {
                        let backoff = self.base_backoff_ms.saturating_mul(1u64 << attempt);
                        tracing::warn!(status = %status, attempt = attempt+1, backoff_ms = backoff, "search upsert transient error; retrying");
                        tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
                        attempt += 1;
                        continue;
                    }
                    let msg = format!("Search service error: status={} body={}", status, text);
                    return Err(IngestionError::Sync(msg));
                }
                Err(e) => {
                    if attempt < self.max_retries {
                        let backoff = self.base_backoff_ms.saturating_mul(1u64 << attempt);
                        tracing::warn!(error = %e, attempt = attempt+1, backoff_ms = backoff, "search upsert request error; retrying");
                        tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(IngestionError::Sync(format!("Search request error: {}", e)));
                }
            }
        }

        // success path already parsed JSON
        let result: Value = serde_json::json!({"data":"ok"});
        
        // Check for GraphQL errors
        if let Some(errors) = result.get("errors") {
            return Err(IngestionError::Sync(format!(
                "Search service GraphQL errors: {}",
                errors
            )));
        }

        tracing::info!(app_id = %app_id, tenant = ?tenant_id, document_count = documents.len(), "search upsert: done");

        Ok(())
    }

    pub async fn delete_products_batch(
        &self,
        app_id: &str,
        tenant_id: Option<&str>,
        document_ids: Vec<&str>,
    ) -> Result<()> {
        // This would implement batch deletion - placeholder for now
        tracing::info!(
            app_id = app_id,
            tenant_id = ?tenant_id,
            document_count = document_ids.len(),
            "Batch delete operation (placeholder)"
        );
        Ok(())
    }

}
