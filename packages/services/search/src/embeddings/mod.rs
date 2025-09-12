// (no external derives needed now)

use crate::{error::{Result, SearchError}, metrics};

/// Lightweight client for the embeddings service GraphQL endpoint.
#[derive(Clone)]
pub struct EmbeddingsClient {
    base_url: String,
    use_msgpack: bool,
    http: reqwest::Client,
}

impl EmbeddingsClient {
    pub fn new(base_url: String, use_msgpack: bool, timeout_ms: u64) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(timeout_ms))
            .build()
            .expect("failed to build http client");
    Self { base_url, use_msgpack, http }
    }

    pub async fn build_query_embedding(
        &self,
        query: Option<&str>,
        weighted_query: Option<&serde_json::Value>,
        text_model: Option<&str>,
        image_model: Option<&str>,
    ) -> Result<Option<Vec<f32>>> {
        // Convert weighted_query JSON of shape { term: weight } into terms array expected by service.
        // Also handle future richer hybrid spec: { terms: {t: w}, texts: [{text, weight}], images: [{url, weight}] }
        let mut terms_array: Vec<serde_json::Value> = Vec::new();
        let mut weighted_texts: Vec<serde_json::Value> = Vec::new();
        let mut weighted_images: Vec<serde_json::Value> = Vec::new();
        if let Some(wq) = weighted_query {
            if let Some(obj) = wq.as_object() {
                // Heuristic: if keys like "terms", "texts", "images" present treat accordingly.
                if obj.get("terms").is_some() || obj.get("texts").is_some() || obj.get("images").is_some() {
                    if let Some(terms) = obj.get("terms").and_then(|v| v.as_object()) {
                        for (term, wt) in terms.iter() { if let Some(wf) = wt.as_f64() { terms_array.push(json_term(term, wf as f32)); } }
                    }
                    if let Some(texts) = obj.get("texts").and_then(|v| v.as_array()) {
                        for t in texts.iter() { if let (Some(txt), Some(w)) = (t.get("text").and_then(|x| x.as_str()), t.get("weight").and_then(|x| x.as_f64())) { weighted_texts.push(json_text(txt, w as f32)); } }
                    }
                    if let Some(images) = obj.get("images").and_then(|v| v.as_array()) {
                        for i in images.iter() { if let (Some(url), Some(w)) = (i.get("imageUrl").or_else(|| i.get("url")).and_then(|x| x.as_str()), i.get("weight").and_then(|x| x.as_f64())) { weighted_images.push(json_image(url, w as f32)); } }
                    }
                } else {
                    for (term, wt) in obj.iter() { if let Some(wf) = wt.as_f64() { terms_array.push(json_term(term, wf as f32)); } }
                }
            }
        }
        // If only plain query string provided, treat as single weighted text with weight 1.0
        if terms_array.is_empty() && weighted_texts.is_empty() && query.is_some() {
            if let Some(q) = query { weighted_texts.push(json_text(q, 1.0)); }
        }
        if terms_array.is_empty() && weighted_texts.is_empty() && weighted_images.is_empty() { return Ok(None); }
        let mut input_obj = serde_json::json!({});
        if !terms_array.is_empty() { input_obj["terms"] = serde_json::Value::Array(terms_array); }
        if !weighted_texts.is_empty() { input_obj["weightedTexts"] = serde_json::Value::Array(weighted_texts); }
        if !weighted_images.is_empty() { input_obj["weightedImages"] = serde_json::Value::Array(weighted_images); }
        if let Some(tm) = text_model { input_obj["textModelName"] = serde_json::Value::String(tm.to_string()); }
        if let Some(im) = image_model { input_obj["imageModelName"] = serde_json::Value::String(im.to_string()); }

        let query_str = "mutation Build($input: QueryEmbeddingInput!) { buildQueryEmbedding(input: $input) { dimension vector strategy } }";
        let body = serde_json::json!({"query": query_str, "variables": {"input": input_obj}});
        let mut req = self.http.post(format!("{}/graphql", self.base_url.trim_end_matches('/'))).json(&body);
        if self.use_msgpack { req = req.header("x-msgpack-enabled", "1"); }
    let started = std::time::Instant::now();
    let resp = req.send().await?;
    let took = started.elapsed().as_millis() as u64;
    metrics::record_embedding_latency(took);
        if !resp.status().is_success() { return Err(SearchError::Other(format!("embeddings service error: {}", resp.status()))); }
        // If msgpack used, content-type is application/x-msgpack else JSON.
        let vector: Option<Vec<f32>> = if self.use_msgpack {
            let bytes = resp.bytes().await?;
            match rmp_serde::from_slice::<serde_json::Value>(&bytes) {
                Ok(v) => extract_vector(&v),
                Err(e) => { tracing::warn!(error=%e, "failed to decode msgpack response"); None }
            }
        } else {
            let json: serde_json::Value = resp.json().await?;
            extract_vector(&json)
        };
        Ok(vector)
    }
}

fn json_term(term: &str, weight: f32) -> serde_json::Value { serde_json::json!({"term": term, "weight": weight}) }
fn json_text(text: &str, weight: f32) -> serde_json::Value { serde_json::json!({"text": text, "weight": weight}) }
fn json_image(image_url: &str, weight: f32) -> serde_json::Value { serde_json::json!({"imageUrl": image_url, "weight": weight}) }

fn extract_vector(root: &serde_json::Value) -> Option<Vec<f32>> {
    // Accept either { data: { buildQueryEmbedding: { vector: [...] }}} or flattened variations
    if let Some(obj) = root.as_object() {
        if let Some(data) = obj.get("data") { return extract_vector(data); }
        if let Some(inner) = obj.get("buildQueryEmbedding") { return extract_vector(inner); }
        if let Some(vec_val) = obj.get("vector") {
            if let Some(arr) = vec_val.as_array() {
                return Some(arr.iter().filter_map(|v| v.as_f64()).map(|f| f as f32).collect());
            }
        }
    }
    None
}