use search_service::vespa::client::VespaClient;
use search_service::error::SearchError;

#[tokio::test]
async fn feed_document_requires_id() {
    let client = VespaClient::new("http://localhost:0".into());
    let doc = serde_json::json!({"type":"product"});
    let err = client.feed_document("app", doc).await.expect_err("should fail without id");
    match err {
        SearchError::InvalidInput(msg) => assert!(msg.contains("document.id"), "message: {}", msg),
        other => panic!("unexpected error variant: {:?}", other),
    }
}
