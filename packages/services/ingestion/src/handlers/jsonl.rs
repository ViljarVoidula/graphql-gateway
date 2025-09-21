use reqwest::Client;
use serde_json::Value;

use crate::models::*;
use crate::config::Config;
use reqwest::header::USER_AGENT;

pub struct JsonlHandler {
    client: Client,
}

impl JsonlHandler {
    pub fn new() -> Self { Self::with_config(None) }

    pub fn with_config(cfg: Option<&Config>) -> Self {
        let ua = cfg
            .map(|c| c.http_user_agent.as_str())
            .unwrap_or("ingestion-service/1.0");
        let timeout = cfg.map(|c| c.http_timeout_ms).unwrap_or(300_000);
        let client = Client::builder()
            .user_agent(ua)
            .timeout(std::time::Duration::from_millis(timeout))
            .build()
            .expect("Failed to create HTTP client");
        Self { client }
    }

    pub async fn fetch_data(&self, url: &str, timeout_override: Option<std::time::Duration>) -> Result<Vec<Value>> {
        let mut rb = self.client.get(url).header("Accept", "application/json, text/plain, */*");
        if let Some(dur) = timeout_override { rb = rb.timeout(dur); }
        if let Some(rb2) = rb.try_clone() {
            if let Ok(req) = rb2.build() {
                if let Some(ua) = req.headers().get(USER_AGENT) { if let Ok(ua_str) = ua.to_str() { tracing::debug!(user_agent = ua_str, url = url, "Downloading JSONL"); } } else { tracing::debug!(url = url, "Downloading JSONL without explicit User-Agent header"); }
            }
        }
        let response = rb.send().await?;
        let text = response.text().await?;

        let mut records = Vec::new();
        for line in text.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let record: Value = serde_json::from_str(line)?;
            records.push(record);
        }

        tracing::debug!(
            url = url,
            record_count = records.len(),
            "Parsed JSONL data"
        );

        Ok(records)
    }
}
