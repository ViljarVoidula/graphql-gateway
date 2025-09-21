use search_service::{models::{SearchInput, SearchMode, VectorOptions, PaginationInput, FieldSelection, FieldPreset}, vespa::query::VespaQueryBuilder, config::Config};

#[test]
fn builds_vector_query_with_embedding() {
    let cfg = Config { vespa_endpoint: "http://x".into(), vespa_deploy_endpoint: "http://x".into(), app_id: "a".into(), content_cluster_id: "a".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 1, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 1000, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5, redis_url: None, enable_autocomplete: false };
    let qb = VespaQueryBuilder::new(cfg);
    let mut input = SearchInput::default();
    input.app_id = Some("a".into());
    input.mode = Some(SearchMode::Vector);
    input.vector = Some(VectorOptions { embedding: Some(vec![0.1,0.2,0.3]), ..Default::default() });
    input.pagination = Some(PaginationInput { limit: Some(5), offset: Some(0), ..Default::default() });
    let built = qb.build(input).expect("ok");
    assert!(built.get("ranking.features.query(query_vector)").is_some(), "query vector injected");
    assert_eq!(built.get("hits").and_then(|v| v.as_i64()).unwrap(), 5);
}

#[test]
fn applies_field_selection_summary() {
    let cfg = Config { vespa_endpoint: "http://x".into(), vespa_deploy_endpoint: "http://x".into(), app_id: "a".into(), content_cluster_id: "a".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 1, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 1000, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5, redis_url: None, enable_autocomplete: false };
    let qb = VespaQueryBuilder::new(cfg);
    let mut input = SearchInput::default();
    input.app_id = Some("a".into());
    input.fields = Some(FieldSelection { preset: Some(FieldPreset::Basic), ..Default::default() });
    let built = qb.build(input).expect("ok");
    assert_eq!(built.get("summary").and_then(|v| v.as_str()), Some("basic"));
}

#[test]
fn empty_query_omitted_from_yql() {
    let cfg = Config { vespa_endpoint: "http://x".into(), vespa_deploy_endpoint: "http://x".into(), app_id: "a".into(), content_cluster_id: "a".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 1, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 1000, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5, redis_url: None, enable_autocomplete: false };
    let qb = VespaQueryBuilder::new(cfg);
    let mut input = SearchInput::default();
    input.app_id = Some("a".into());
    input.query = Some("".into());
    let built = qb.build(input).expect("ok");
    let yql = built.get("yql").and_then(|v| v.as_str()).unwrap();
    assert!(!yql.contains("userInput(@q)"), "should not include userInput clause for blank query: {yql}");
    assert!(built.get("q").is_none(), "blank query should not set q param");
}
