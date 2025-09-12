use reqwest::Client;
use serde_json::json;

#[tokio::test]
async fn smoke_health() {
    // This assumes the server is running separately; skip if not reachable
    let client = Client::new();
    if let Ok(res) = client.post("http://localhost:8088/graphql")
        .json(&json!({"query":"{ health }"}))
        .send().await {
        assert!(res.status().is_success());
    }
}
