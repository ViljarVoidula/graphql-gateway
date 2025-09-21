use reqwest::Client;
use serde_json::Value;
use quick_xml::Reader;
use quick_xml::events::Event;

use crate::models::*;
use crate::config::Config;
use reqwest::header::USER_AGENT;

pub struct XmlHandler {
    client: Client,
}

impl XmlHandler {
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

    pub async fn fetch_data(&self, url: &str, _root_element: &str, record_element: &str, timeout_override: Option<std::time::Duration>) -> Result<Vec<Value>> {
        let mut rb = self.client.get(url).header("Accept", "application/xml, text/xml, */*");
        if let Some(dur) = timeout_override { rb = rb.timeout(dur); }
        if let Some(rb2) = rb.try_clone() {
            if let Ok(req) = rb2.build() {
                if let Some(ua) = req.headers().get(USER_AGENT) { if let Ok(ua_str) = ua.to_str() { tracing::debug!(user_agent = ua_str, url = url, "Downloading XML"); } } else { tracing::debug!(url = url, "Downloading XML without explicit User-Agent header"); }
            }
        }
        let response = rb.send().await?;
        let text = response.text().await?;

        self.parse_xml(&text, record_element).await
    }

    async fn parse_xml(&self, xml_content: &str, record_element: &str) -> Result<Vec<Value>> {
        let mut reader = Reader::from_str(xml_content);
        let mut records = Vec::new();
        let mut buf = Vec::new();
        let mut current_record = None;
        let mut current_element = String::new();
        let mut current_text = String::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let name_bytes = e.name().as_ref().to_vec();
                    let name = std::str::from_utf8(&name_bytes)
                        .map_err(|e| IngestionError::XmlParsing(e.to_string()))?
                        .to_string();
                    
                    if name == record_element {
                        current_record = Some(serde_json::Map::new());
                    }
                    current_element = name;
                }
                Ok(Event::End(ref e)) => {
                    let name_bytes = e.name().as_ref().to_vec();
                    let name = std::str::from_utf8(&name_bytes)
                        .map_err(|e| IngestionError::XmlParsing(e.to_string()))?
                        .to_string();
                    
                    if name == record_element {
                        if let Some(record) = current_record.take() {
                            records.push(Value::Object(record));
                        }
                    } else if let Some(ref mut record) = current_record {
                        if !current_text.trim().is_empty() {
                            record.insert(current_element.clone(), Value::String(current_text.trim().to_string()));
                        }
                        current_text.clear();
                    }
                }
                Ok(Event::Text(e)) => {
                    current_text = e.unescape()
                        .map_err(|e| IngestionError::XmlParsing(e.to_string()))?
                        .to_string();
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(IngestionError::XmlParsing(e.to_string())),
                _ => {}
            }
            buf.clear();
        }

        tracing::debug!(
            record_element = record_element,
            record_count = records.len(),
            "Parsed XML data"
        );

        Ok(records)
    }
}
