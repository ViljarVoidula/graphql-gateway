use reqwest::Client;
use serde_json::Value;
use csv::ReaderBuilder;

use crate::models::*;
use crate::config::Config;
use reqwest::header::USER_AGENT;

pub struct CsvHandler {
    client: Client,
}

impl CsvHandler {
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

    pub async fn fetch_data(&self, url: &str, delimiter: char, has_headers: bool, timeout_override: Option<std::time::Duration>) -> Result<Vec<Value>> {
        // Log UA
        let mut rb = self.client.get(url).header("Accept", "text/csv, text/plain, */*");
        if let Some(dur) = timeout_override { rb = rb.timeout(dur); }
        if let Some(rb2) = rb.try_clone() {
            if let Ok(req) = rb2.build() {
                if let Some(ua) = req.headers().get(USER_AGENT) {
                    if let Ok(ua_str) = ua.to_str() { tracing::debug!(user_agent = ua_str, url = url, "Downloading CSV"); }
                } else { tracing::debug!(url = url, "Downloading CSV without explicit User-Agent header"); }
            }
        }
    let response = rb.send().await?;
        let text = response.text().await?;

        let mut reader = ReaderBuilder::new()
            .delimiter(delimiter as u8)
            .has_headers(has_headers)
            .from_reader(text.as_bytes());

        let mut records = Vec::new();
        let headers = if has_headers {
            reader.headers()?.iter().map(|h| h.to_string()).collect::<Vec<_>>()
        } else {
            // Generate generic column names
            let first_record = reader.records().next().transpose()?;
            if let Some(record) = first_record {
                (0..record.len()).map(|i| format!("column_{}", i)).collect()
            } else {
                return Ok(Vec::new());
            }
        };

        // Reset reader if we consumed a record to get headers
        if !has_headers {
            reader = ReaderBuilder::new()
                .delimiter(delimiter as u8)
                .has_headers(false)
                .from_reader(text.as_bytes());
        }

        for result in reader.records() {
            let record = result?;
            let mut json_record = serde_json::Map::new();
            
            for (i, field) in record.iter().enumerate() {
                if let Some(header) = headers.get(i) {
                    json_record.insert(header.clone(), Value::String(field.to_string()));
                }
            }
            
            records.push(Value::Object(json_record));
        }

        tracing::debug!(
            url = url,
            record_count = records.len(),
            "Parsed CSV data"
        );

        Ok(records)
    }
}
