use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;

use crate::error::{Result, SearchError};

#[derive(Clone, Debug)]
pub struct VectorFieldConfig {
    pub name: String,
    pub weight: f32,
    pub dimensions: i32,
}

#[derive(Clone, Debug)]
pub struct IndexConfig {
    pub id: String,
    pub tenant_id: String,
    pub cluster_id: String,
    pub application_id: String,
    pub active_model: Option<String>,
    pub vector_fields: Vec<VectorFieldConfig>,
    pub autocomplete_paths: Vec<String>,
}

#[derive(Clone)]
struct Cached { fetched_at: Instant, config: IndexConfig }

static CACHE: Lazy<Mutex<HashMap<String, Cached>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const TTL: Duration = Duration::from_secs(600); // 10 minutes

/// Fetch (or return cached) IndexConfig for given application id.
/// Returns Ok(None) if remote embeddings service URL is not configured.
pub async fn get_index_config_cached(app_id: &str, base_url_opt: Option<&str>) -> Result<Option<IndexConfig>> {
    let base_url = if let Some(b) = base_url_opt { b } else { return Ok(None); };
    {
        let guard = CACHE.lock().unwrap();
        if let Some(entry) = guard.get(app_id) {
            if entry.fetched_at.elapsed() < TTL { return Ok(Some(entry.config.clone())); }
        }
    }
    // Need to fetch fresh
    let query = r#"query GetIndexConfig($applicationId: String!) { indexConfig(applicationId: $applicationId) { id tenantId clusterId applicationId activeModel vectorFields { name weight dimensions } autocompletePaths } }"#;
    let body = serde_json::json!({
        "query": query,
        "variables": {"applicationId": app_id}
    });
    let client = reqwest::Client::new();
    let url = format!("{}/graphql", base_url.trim_end_matches('/'));
    let resp = client.post(url).json(&body).send().await.map_err(|e| SearchError::Other(format!("indexConfig fetch failed: {e}")))?;
    if !resp.status().is_success() { return Err(SearchError::Other(format!("indexConfig fetch http {}", resp.status())).into()); }
    let json: serde_json::Value = resp.json().await.map_err(|e| SearchError::Other(format!("indexConfig json decode failed: {e}")))?;
    let idx = json.get("data").and_then(|d| d.get("indexConfig"));
    if idx.is_none() { return Err(SearchError::Other("indexConfig missing in response".into()).into()); }
    let idx = idx.unwrap();
    let vector_fields: Vec<VectorFieldConfig> = idx.get("vectorFields").and_then(|v| v.as_array()).unwrap_or(&Vec::new())
        .iter()
        .filter_map(|vf| {
            Some(VectorFieldConfig { 
                name: vf.get("name")?.as_str()?.to_string(),
                weight: vf.get("weight").and_then(|w| w.as_f64()).unwrap_or(1.0) as f32,
                dimensions: vf.get("dimensions").and_then(|d| d.as_i64()).unwrap_or(768) as i32,
            })
        }).collect();
    let autocomplete_paths: Vec<String> = idx.get("autocompletePaths").and_then(|v| v.as_array()).unwrap_or(&Vec::new())
        .iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
    let cfg = IndexConfig { 
        id: idx.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        tenant_id: idx.get("tenantId").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        cluster_id: idx.get("clusterId").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        application_id: idx.get("applicationId").and_then(|v| v.as_str()).unwrap_or_else(|| app_id).to_string(),
        active_model: idx.get("activeModel").and_then(|v| v.as_str()).map(|s| s.to_string()),
        vector_fields,
        autocomplete_paths,
    };
    {
        let mut guard = CACHE.lock().unwrap();
        guard.insert(app_id.to_string(), Cached { fetched_at: Instant::now(), config: cfg.clone() });
    }
    Ok(Some(cfg))
}

/// Build weighted texts array from a document JSON using the config's vector fields.
/// Returns None if no texts could be extracted.
pub fn build_weighted_texts(doc: &serde_json::Value, cfg: &IndexConfig) -> Option<Vec<(String, f32)>> {
    let mut out: Vec<(String, f32)> = Vec::new();
    for vf in &cfg.vector_fields {
        if let Some(val) = doc.get(&vf.name) {
            if let Some(s) = val.as_str() { if !s.is_empty() { out.push((s.to_string(), vf.weight)); continue; } }
            else if let Some(arr) = val.as_array() {
                let mut parts: Vec<String> = Vec::new();
                for item in arr.iter() { if let Some(s) = item.as_str() { parts.push(s.to_string()); } }
                if !parts.is_empty() { out.push((parts.join(" "), vf.weight)); }
            }
        }
    }
    if out.is_empty() { None } else { Some(out) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_build_weighted_texts() {
        let cfg = IndexConfig { id: "1".into(), tenant_id: "t".into(), cluster_id: "c".into(), application_id: "a".into(), active_model: None, vector_fields: vec![
            VectorFieldConfig { name: "name".into(), weight: 0.5, dimensions: 10 },
            VectorFieldConfig { name: "categories".into(), weight: 0.5, dimensions: 10 }
        ], autocomplete_paths: vec![] };
        let doc = serde_json::json!({"name": "Cool Shoe", "categories": ["shoe","sport"], "other": "x"});
        let wt = build_weighted_texts(&doc, &cfg).unwrap();
        assert_eq!(wt.len(), 2);
        assert!(wt.iter().any(|(t, w)| t.contains("Cool Shoe") && (*w - 0.5).abs()<1e-6));
        assert!(wt.iter().any(|(t, _)| t.contains("shoe sport")));
    }
}
