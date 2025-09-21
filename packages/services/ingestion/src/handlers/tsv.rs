use crate::handlers::CsvHandler;
use crate::models::*;
use serde_json::Value;
use crate::config::Config;

pub struct TsvHandler {
    csv_handler: CsvHandler,
}

impl TsvHandler {
    pub fn new() -> Self { Self::with_config(None) }

    pub fn with_config(cfg: Option<&Config>) -> Self {
        Self { csv_handler: CsvHandler::with_config(cfg) }
    }

    pub async fn fetch_data(&self, url: &str, has_headers: bool, timeout_override: Option<std::time::Duration>) -> Result<Vec<Value>> {
        // TSV is just CSV with tab delimiter
        self.csv_handler.fetch_data(url, '\t', has_headers, timeout_override).await
    }
        // no additional changes; TSV uses CsvHandler which now logs UA
}
