use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;
use crate::models::*;

#[derive(Clone)]
pub struct EmbeddingsServiceClient {
    client: Client,
    base_url: String,
}

impl EmbeddingsServiceClient {
    pub fn new(base_url: String, timeout_ms: u64) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_millis(timeout_ms))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url,
        }
    }

    /// Fetch index configuration (vector fields and optional dimension hint) from the embeddings service
    pub async fn get_index_config(
        &self,
        app_id: &str,
    ) -> Result<(Vec<(String, f32)>, Option<u32>)> {
        let query = r#"
            query IndexConfig($applicationId: String!) {
              indexConfig(applicationId: $applicationId) {
                tenantId
                vectorFields {
                  dimensions
                  name
                  weight
                }
              }
            }
        "#;

        let variables = serde_json::json!({
            "applicationId": app_id,
        });

        let body = serde_json::json!({
            "query": query,
            "variables": variables,
        });

        let url = format!("{}/graphql", self.base_url);
        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(IngestionError::Sync(format!("Index config error: status={} body={}", status, text)));
        }

        let result: serde_json::Value = response.json().await?;
        if let Some(errors) = result.get("errors") {
            return Err(IngestionError::Sync(format!(
                "Index config GraphQL errors: {}",
                errors
            )));
        }

        let mut fields_with_weights: Vec<(String, f32)> = Vec::new();
        let mut dimension_hint: Option<u32> = None;
        if let Some(vfs) = result
            .get("data")
            .and_then(|d| d.get("indexConfig"))
            .and_then(|ic| ic.get("vectorFields"))
            .and_then(|vf| vf.as_array())
        {
            for vf in vfs {
                if let Some(name) = vf.get("name").and_then(|n| n.as_str()) {
                    let weight = vf.get("weight").and_then(|w| w.as_f64()).unwrap_or(1.0) as f32;
                    if let Some(dim) = vf.get("dimensions").and_then(|d| d.as_u64()) {
                        if dimension_hint.is_none() && dim > 0 { dimension_hint = Some(dim as u32); }
                    }
                    fields_with_weights.push((name.to_string(), weight));
                }
            }
        }

        Ok((fields_with_weights, dimension_hint))
    }

    pub async fn generate_embedding_for_fields(
        &self,
        document: &Value,
        fields: &[String],
        weights: Option<&HashMap<String, f32>>,
    ) -> Result<Option<Vec<f64>>> {
        // Extract and combine text from specified fields
        let mut texts = Vec::new();
        let mut field_weights = Vec::new();

        for field_name in fields {
            if let Some(value) = document.get(field_name) {
                if let Some(text) = value.as_str() {
                    if !text.trim().is_empty() {
                        texts.push(text);
                        let weight = weights
                            .and_then(|w| w.get(field_name))
                            .copied()
                            .unwrap_or(1.0);
                        field_weights.push(weight);
                    }
                }
            }
        }

        if texts.is_empty() {
            return Ok(None);
        }

        // Build weighted texts for embedding generation
        let weighted_texts: Vec<Value> = texts.iter()
            .zip(field_weights.iter())
            .map(|(text, weight)| serde_json::json!({
                "text": text,
                "weight": weight
            }))
            .collect();

        let mutation = r#"
            mutation BuildQueryEmbedding($input: QueryEmbeddingInput!) {
                buildQueryEmbedding(input: $input) {
                    vector
                    dimension
                }
            }
        "#;

        let variables = serde_json::json!({
            "input": {
                "weightedTexts": weighted_texts,
                "strategy": "WEIGHTED_SUM",
                "normalize": true
            }
        });

        let body = serde_json::json!({
            "query": mutation,
            "variables": variables
        });

        let response = self.client
            .post(&format!("{}/graphql", self.base_url))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            let msg = format!("Embeddings service error: status={} body={}", status, error_text);
            return Err(IngestionError::Sync(msg));
        }

        let result: Value = response.json().await?;
        
        // Check for GraphQL errors
        if let Some(errors) = result.get("errors") {
            return Err(IngestionError::Sync(format!(
                "Embeddings service GraphQL errors: {}",
                errors
            )));
        }

        // Extract embedding vector
        if let Some(data) = result.get("data") {
            if let Some(embedding_result) = data.get("buildQueryEmbedding") {
                if let Some(vector) = embedding_result.get("vector") {
                    if let Some(vector_array) = vector.as_array() {
                        let embedding: Vec<f64> = vector_array
                            .iter()
                            .filter_map(|v| v.as_f64())
                            .collect();
                        
                        if !embedding.is_empty() {
                            tracing::info!(
                                fields = ?fields,
                                dimension = embedding.len(),
                                "Generated embedding for fields"
                            );
                            return Ok(Some(embedding));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// Fetch autocompletePaths from index configuration. Falls back to empty vec if not present.
    pub async fn get_autocomplete_paths(&self, app_id: &str) -> Result<Vec<String>> {
        let query = r#"
            query IndexConfigAutocomplete($applicationId: String!) {
              indexConfig(applicationId: $applicationId) {
                autocompletePaths
              }
            }
        "#;

        let variables = serde_json::json!({ "applicationId": app_id });
        let body = serde_json::json!({ "query": query, "variables": variables });
        let url = format!("{}/graphql", self.base_url);
        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(IngestionError::Sync(format!("Index config error: status={} body={}", status, text)));
        }

        let result: serde_json::Value = response.json().await?;
        if let Some(errors) = result.get("errors") {
            return Err(IngestionError::Sync(format!(
                "Index config GraphQL errors: {}",
                errors
            )));
        }

        let paths: Vec<String> = result
            .get("data")
            .and_then(|d| d.get("indexConfig"))
            .and_then(|ic| ic.get("autocompletePaths"))
            .and_then(|ap| ap.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        Ok(paths)
    }

    // health_check removed; not used by current features
}
