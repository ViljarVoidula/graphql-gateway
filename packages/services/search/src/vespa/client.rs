use reqwest::Client;
use tracing::Level;

use crate::error::{Result, SearchError};

#[derive(Clone)]
pub struct VespaClient {
    base_url: String,
    http: Client,
}

impl VespaClient {
    pub fn new(base_url: String) -> Self {
        Self { base_url, http: Client::new() }
    }

    fn should_log_full() -> bool { std::env::var("VESPA_LOG_FULL").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false) }

    fn truncate_body(body: &str) -> (String, bool) {
        if Self::should_log_full() { return (body.to_string(), false); }
        const LIMIT: usize = 2_000; // 2KB preview
        if body.len() > LIMIT {
            (format!("{}…<truncated {} chars>", &body[..LIMIT], body.len() - LIMIT), true)
        } else { (body.to_string(), false) }
    }

    fn parse_error_body(body: &str) -> (Vec<String>, Vec<String>) {
        // Try to parse common Vespa error structures
        let mut codes: Vec<String> = Vec::new();
        let mut messages: Vec<String> = Vec::new();
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
            // search errors: { root: { errors: [ { code, message }, ... ] } }
            if let Some(arr) = json
                .get("root")
                .and_then(|r| r.get("errors"))
                .and_then(|e| e.as_array())
            {
                for e in arr { if let Some(msg) = e.get("message").and_then(|m| m.as_str()) { messages.push(msg.to_string()); } if let Some(c) = e.get("code") { codes.push(c.to_string()); } }
            }
            // feed/deploy: could be { message, details|detail } or top-level errors
            if messages.is_empty() { if let Some(m) = json.get("message").and_then(|m| m.as_str()) { messages.push(m.to_string()); } }
            if messages.is_empty() { if let Some(m) = json.get("error").and_then(|m| m.as_str()) { messages.push(m.to_string()); } }
            if codes.is_empty() { if let Some(c) = json.get("code") { codes.push(c.to_string()); } }
        }
        (codes, messages)
    }

    pub async fn search(&self, req: serde_json::Value) -> Result<serde_json::Value> {
        let url = format!("{}/search/", self.base_url.trim_end_matches('/'));
        let resp = self.http.post(&url).json(&req).send().await?;
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            let (codes, messages) = Self::parse_error_body(&body);
            let (preview, truncated) = Self::truncate_body(&body);
            tracing::event!(
                Level::ERROR,
                target = "vespa.search",
                http.status = %status,
                error.codes = ?codes,
                error.messages = ?messages,
                body.truncated = truncated,
                body.preview = preview,
                // capture minimal request shape
                req.keys = ?req.as_object().map(|o| o.keys().cloned().collect::<Vec<_>>()),
                "vespa search failed"
            );
            return Err(SearchError::Vespa(format!("search failed ({}): {}", status, messages.first().cloned().unwrap_or(body))));
        }
        match serde_json::from_str::<serde_json::Value>(&body) {
            Ok(json) => Ok(json),
            Err(e) => Err(SearchError::Vespa(format!(
                "invalid JSON from Vespa ({}): {}\nbody: {}",
                status, e, body
            ))),
        }
    }

    pub async fn feed_document(&self, app_id: &str, doc: serde_json::Value) -> Result<()> {
        // Assuming doc contains an id and optional type; feed via document/v1 API with {"fields":{...}}
        let id = doc
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| SearchError::InvalidInput("document.id required".into()))?;
        let doc_type = doc.get("type").and_then(|v| v.as_str()).unwrap_or("product");
        let url = format!(
            "{}/document/v1/{}/{}/docid/{}",
            self.base_url.trim_end_matches('/'),
            app_id,
            doc_type,
            urlencoding::encode(id)
        );

        let mut obj = doc
            .as_object()
            .cloned()
            .ok_or_else(|| SearchError::InvalidInput("document must be a JSON object".into()))?;
        obj.remove("type");
    // tenant_id must already be provided by caller; do not auto-inject to avoid accidental mis-scoping
        if let Some(payload_val) = obj.get_mut("payload") { if !payload_val.is_string() { *payload_val = serde_json::Value::String(payload_val.to_string()); } }
        // L2-normalize embedding vector if present (cosine/ angular optimized)
        if let Some(embedding_val) = obj.get_mut("embedding") {
            if let Some(arr) = embedding_val.as_array() {
                let mut nums: Vec<f64> = Vec::with_capacity(arr.len());
                let mut sum_sq: f64 = 0.0;
                for v in arr { if let Some(f) = v.as_f64() { nums.push(f); sum_sq += f * f; } }
                if nums.len() == arr.len() && sum_sq > 0.0 {
                    let norm = sum_sq.sqrt();
                    // Only adjust if not already ~unit
                    if (norm - 1.0).abs() > 1e-4 {
                        let normalized: Vec<serde_json::Value> = nums.into_iter().map(|x| (x / norm) as f32).map(|f| serde_json::Value::from(f)).collect();
                        *embedding_val = serde_json::Value::Array(normalized);
                    }
                }
            }
        }
        let body = serde_json::json!({ "fields": serde_json::Value::Object(obj) });
        let resp = self.http.post(&url).json(&body).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            let (codes, messages) = Self::parse_error_body(&err_body);
            let (preview, truncated) = Self::truncate_body(&err_body);
            tracing::event!(
                Level::ERROR,
                target = "vespa.feed",
                http.status = %status,
                app_id = %app_id,
                doc.id = %id,
                error.codes = ?codes,
                error.messages = ?messages,
                body.truncated = truncated,
                body.preview = preview,
                "vespa feed failed"
            );
            return Err(SearchError::Vespa(format!("feed failed: {}", messages.first().cloned().unwrap_or(preview))));
        }
        Ok(())
    }

    /// Fetch document count for given app & document type (default product) using visit API with grouping summary endpoint
    pub async fn document_count(&self, _app_id: &str, doc_type: &str) -> Result<i64> {
        // Use /document/v1/<app>/<type>/docid/ (no direct count API) -> fallback to search API select count(*)
    let yql = format!("select * from sources {} where true limit 0;", doc_type);
        let url = format!("{}/search/?yql={}&hits=0&summary=count", self.base_url.trim_end_matches('/'), urlencoding::encode(&yql));
        let resp = self.http.get(&url).send().await?;
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() { return Err(SearchError::Vespa(format!("count query failed: {} {}", status, body))); }
        let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| SearchError::Vespa(format!("invalid count json: {}", e)))?;
        let total = json.get("root").and_then(|r| r.get("fields")).and_then(|f| f.get("totalCount")).and_then(|v| v.as_i64()).unwrap_or(0);
        Ok(total)
    }

    /// Fetch raw system metrics from /metrics/v2/values (can be large). Caller may truncate.
    pub async fn system_metrics(&self) -> Result<String> {
        let url = format!("{}/metrics/v2/values", self.base_url.trim_end_matches('/'));
        let resp = self.http.get(&url).send().await?;
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() { return Err(SearchError::Vespa(format!("metrics fetch failed: {}", status))); }
        Ok(body)
    }

    /// Feed multiple documents using Vespa's JSON Lines feed API in a single POST to /document/v1/.
    /// Each line is a JSON object like: {"put":"id:<namespace>:<doctype>::<docid>", "fields":{...}}
    async fn feed_documents_jsonl(&self, app_id: &str, destination_cluster: &str, docs: Vec<serde_json::Value>) -> Result<()> {
        if docs.is_empty() { return Ok(()); }
        // Build JSONL string
        let mut body = String::new();
        let mut total: usize = 0;
        for mut doc in docs.into_iter() {
            let id = doc
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| SearchError::InvalidInput("document.id required".into()))?;
            let doc_type = doc.get("type").and_then(|v| v.as_str()).unwrap_or("product");
            // Prepare fields: clone object, drop type, stringify payload if needed, normalize embedding
            let mut obj = doc
                .as_object()
                .cloned()
                .ok_or_else(|| SearchError::InvalidInput("document must be a JSON object".into()))?;
            obj.remove("type");
            if let Some(payload_val) = obj.get_mut("payload") {
                if !payload_val.is_string() {
                    *payload_val = serde_json::Value::String(payload_val.to_string());
                }
            }
            if let Some(embedding_val) = obj.get_mut("embedding") {
                if let Some(arr) = embedding_val.as_array() {
                    let mut nums: Vec<f64> = Vec::with_capacity(arr.len());
                    let mut sum_sq: f64 = 0.0;
                    for v in arr { if let Some(f) = v.as_f64() { nums.push(f); sum_sq += f * f; } }
                    if nums.len() == arr.len() && sum_sq > 0.0 {
                        let norm = sum_sq.sqrt();
                        if (norm - 1.0).abs() > 1e-4 {
                            let normalized: Vec<serde_json::Value> = nums.into_iter().map(|x| (x / norm) as f32).map(serde_json::Value::from).collect();
                            *embedding_val = serde_json::Value::Array(normalized);
                        }
                    }
                }
            }
            let full_id = format!("id:{}:{}::{}", app_id, doc_type, id);
            let line_obj = serde_json::json!({
                "put": full_id,
                "fields": serde_json::Value::Object(obj)
            });
            body.push_str(&line_obj.to_string());
            body.push('\n');
            total += 1;
        }

        // Best-effort warning if destinationCluster looks wrong (common mistake: using app_id instead of content cluster id)
        if destination_cluster == app_id {
            tracing::event!(
                Level::DEBUG,
                target="vespa.feed.jsonl",
                app_id=%app_id,
                dest.cluster=%destination_cluster,
                "destinationCluster equals app_id (ok if content id matches services.xml)"
            );
        }

        let url = format!(
            "{}/document/v1/?destinationCluster={}",
            self.base_url.trim_end_matches('/'),
            urlencoding::encode(destination_cluster)
        );
        let resp = self.http
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await?;
        let status = resp.status();
        let resp_text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            let (codes, messages) = Self::parse_error_body(&resp_text);
            let (preview, truncated) = Self::truncate_body(&resp_text);
            tracing::event!(
                Level::ERROR,
                target = "vespa.feed.jsonl",
                http.status = %status,
                app_id = %app_id,
                dest.cluster = %destination_cluster,
                error.codes = ?codes,
                error.messages = ?messages,
                body.truncated = truncated,
                body.preview = preview,
                "vespa JSONL feed failed"
            );
            return Err(SearchError::Vespa(format!("jsonl feed failed: {}", messages.first().cloned().unwrap_or(preview))));
        }

        // Parse per-line results; Vespa can return HTTP 200 with per-line failures
        let mut ok = 0usize;
        let mut failures: Vec<String> = Vec::new();
        for line in resp_text.lines().map(str::trim).filter(|l| !l.is_empty()) {
            match serde_json::from_str::<serde_json::Value>(line) {
                Ok(v) => {
                    // Heuristics based on common fields
                    let msg = v.get("message").and_then(|m| m.as_str()).unwrap_or("");
                    let status_str = v.get("status").and_then(|s| s.as_str()).unwrap_or("");
                    let status_num = v.get("status").and_then(|s| s.as_i64());
                    let line_id = v.get("id").and_then(|m| m.as_str()).unwrap_or("").to_string();
                    // Some responses may include "code"/"errors" or error text in message
                    let has_errors_arr = v.get("errors").and_then(|e| e.as_array()).map(|a| !a.is_empty()).unwrap_or(false);
                    let mut is_ok = msg.eq_ignore_ascii_case("ok")
                        || msg.eq_ignore_ascii_case("processed")
                        || status_str.eq_ignore_ascii_case("ok")
                        || status_str.eq_ignore_ascii_case("success");
                    if !is_ok {
                        if let Some(code) = status_num { if (200..300).contains(&(code as i64)) { is_ok = true; } }
                    }
                    // Some feeds include type: "error" for failures
                    let is_error_type = v.get("type").and_then(|t| t.as_str()).map(|s| s.eq_ignore_ascii_case("error")).unwrap_or(false);
                    if has_errors_arr {
                        failures.push(format!("{}: {}", line_id, msg));
                    } else if is_ok {
                        ok += 1;
                    } else {
                        let ml = msg.to_ascii_lowercase();
                        if status_str.eq_ignore_ascii_case("failed")
                            || ml.contains("fail")
                            || ml.contains("error")
                            || ml.contains("exception")
                            || ml.contains("rejected")
                            || is_error_type
                        {
                            failures.push(format!("{}: {}", line_id, msg));
                        } else {
                            // Unknown/empty message: assume success to avoid false negatives
                            ok += 1;
                        }
                    }
                }
                Err(_) => {
                    failures.push(format!("invalid response line: {}", line));
                }
            }
        }

        if !failures.is_empty() || ok != total {
            let failed_count = if failures.is_empty() { total.saturating_sub(ok) } else { failures.len() };
            let summary = format!("jsonl feed partial failure: {} ok, {} failed of {}", ok, failed_count, total);
            tracing::event!(
                Level::ERROR,
                target="vespa.feed.jsonl",
                app_id=%app_id,
                dest.cluster=%destination_cluster,
                ok=%ok,
                failed=%failed_count,
                failures=?failures,
                "{}",
                summary
            );
            return Err(SearchError::Vespa(format!("{}; first error: {}", summary, failures.get(0).cloned().unwrap_or_default())));
        }

        tracing::event!(Level::INFO, target="vespa.feed.jsonl", app_id=%app_id, dest.cluster=%destination_cluster, docs=ok, "bulk feed ok");
        Ok(())
    }

    /// Feed multiple documents using Vespa's bulk API. Prefer JSONL feed endpoint; fall back to per-document if needed.
    pub async fn feed_documents_batch(&self, app_id: &str, destination_cluster: &str, docs: Vec<serde_json::Value>, max_conc: usize) -> Result<()> {
        if docs.is_empty() { return Ok(()); }
        // First try JSONL feed for the entire batch
        match self.feed_documents_jsonl(app_id, destination_cluster, docs.clone()).await {
            Ok(_) => Ok(()),
            Err(e) => {
                tracing::event!(Level::WARN, target="vespa.feed.batch", app_id=%app_id, dest.cluster=%destination_cluster, error=%e, "jsonl feed failed; falling back to per-document");
                // Fallback: feed documents individually with retry (legacy path)
                use futures::stream::{self, StreamExt};
                let total = docs.len();
                let successes = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
                let failures = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
                let s_clone = successes.clone();
                let f_clone = failures.clone();
                stream::iter(docs.into_iter().map(|doc| {
                    let client = self.clone();
                    let app = app_id.to_string();
                    let succ = s_clone.clone();
                    let fail = f_clone.clone();
                    async move {
                        let id_dbg = doc.get("id").and_then(|v| v.as_str()).unwrap_or("<missing>");
                        const MAX_ATTEMPTS: usize = 3;
                        let mut attempt = 0;
                        loop {
                            let res = client.feed_document(&app, doc.clone()).await;
                            match res {
                                Ok(_) => {
                                    tracing::event!(Level::DEBUG, target="vespa.feed.batch.doc", app_id=%app, doc.id=%id_dbg, dest.cluster=%destination_cluster, attempt=attempt+1, status="ok");
                                    succ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                    crate::metrics::record_batch_doc_success();
                                    break;
                                }
                                Err(e) => {
                                    attempt += 1;
                                    crate::metrics::record_batch_doc_failure();
                                    if attempt >= MAX_ATTEMPTS {
                                        tracing::event!(Level::ERROR, target="vespa.feed.batch.doc", app_id=%app, doc.id=%id_dbg, attempts=attempt, error=%e, "batch doc feed failed (give up)");
                                        fail.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                                        crate::metrics::record_batch_giveup();
                                        break;
                                    } else {
                                        tracing::event!(Level::WARN, target="vespa.feed.batch.doc", app_id=%app, doc.id=%id_dbg, attempt=attempt, error=%e, "retrying doc feed");
                                        crate::metrics::record_batch_retry();
                                        let backoff_ms = 50u64 * (1u64 << (attempt as u64 - 1));
                                        tokio::time::sleep(std::time::Duration::from_millis(backoff_ms.min(800))).await;
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                }))
                .buffer_unordered(max_conc.max(1))
                .for_each(|_| async {})
                .await;

                let ok = successes.load(std::sync::atomic::Ordering::Relaxed);
                let fail = failures.load(std::sync::atomic::Ordering::Relaxed);
                if fail > 0 {
                    return Err(SearchError::Vespa(format!("batch feed partial failure: {} succeeded, {} failed of {}", ok, fail, total)));
                }
                Ok(())
            }
        }
    }
}

#[derive(Clone)]
pub struct VespaDeployClient { base_url: String, http: Client }

impl VespaDeployClient {
    pub fn new(base_url: String) -> Self { Self { base_url, http: Client::new() } }

    pub async fn deploy_package(&self, pkg: &crate::indexer::app_package::AppPackage) -> Result<()> {
        let url = format!("{}/application/v2/tenant/default/prepareandactivate", self.base_url.trim_end_matches('/'));
        let body = pkg.zip_data.clone();
        let resp = self.http.post(&url)
            .header("Content-Type", "application/zip")
            .body(body)
            .send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            let (codes, messages) = VespaClient::parse_error_body(&err_body);
            let (preview, truncated) = VespaClient::truncate_body(&err_body);
            tracing::event!(
                Level::ERROR,
                target = "vespa.deploy",
                http.status = %status,
                error.codes = ?codes,
                error.messages = ?messages,
                body.truncated = truncated,
                body.preview = preview,
                "vespa deploy failed"
            );
            return Err(SearchError::Vespa(format!("deploy failed: {}", messages.first().cloned().unwrap_or(preview))));
        }
        Ok(())
    }

}
