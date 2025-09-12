use search_service::{config::Config, vespa::query::VespaQueryBuilder, models::*};

fn cfg() -> Config {
    Config { vespa_endpoint: "http://unused".into(), vespa_deploy_endpoint: "http://unused".into(), app_id: "app".into(), content_cluster_id: "app".into(), schema_version: "v1".into(), auto_deploy: false, default_tensor_dim: 8, default_geo_enabled: true, default_tenant_id: "tenant".into(), feed_batch_size: 10, feed_max_concurrency: 1, embeddings_service_url: None, enable_remote_embeddings: false, embeddings_use_msgpack: false, embeddings_text_model: None, embeddings_image_model: None, embeddings_timeout_ms: 500, bulk_allow_partial: true, bulk_fallback_single: false, partial_min_token_len: 2, partial_fields: vec!["name".into()], enable_ngram_fields: false, ngram_min_len: 3, hybrid_lexical_weight: 0.5, hybrid_vector_weight: 0.5 }
}

#[test]
fn builds_grouping_for_categorical_and_range_facets() {
    let qb = VespaQueryBuilder::new(cfg());
    let mut input = SearchInput::default();
    input.app_id = Some("app".into());
    input.facets = Some(vec![
        FacetConfig { field: "brand".into(), r#type: FacetType::Categorical, ..Default::default() },
        {
            let mut range_cfg = FacetConfig { field: "price".into(), r#type: FacetType::Range, ..Default::default() };
            range_cfg.range = Some(RangeFacetOptions { ranges: Some(vec![RangeInput { min:0.0, max:50.0, label: None }, RangeInput { min:50.0, max:100.0, label: None }]), ..Default::default() });
            range_cfg
        }
    ]);
    let built = qb.build(input).expect("ok");
    let yql = built.get("yql").and_then(|v| v.as_str()).unwrap();
    assert!(yql.contains("group(brand"), "categorical grouping present: {yql}");
    assert!(yql.contains("predefined(price"), "range grouping with predefined present: {yql}");
}

#[test]
fn weighted_query_included_without_text_query() {
    let qb = VespaQueryBuilder::new(cfg());
    let mut input = SearchInput::default();
    input.app_id = Some("app".into());
    input.weighted_query = Some(serde_json::json!({"nike":2, "adidas":1}));
    let built = qb.build(input).expect("ok");
    assert!(built.get("weightedQuery").is_some(), "weightedQuery param present");
    let yql = built.get("yql").and_then(|v| v.as_str()).unwrap();
    assert!(yql.contains("userInput('nike')") && yql.contains("userInput('adidas')"));
}

#[test]
fn vector_mode_without_embedding_does_not_add_nearest_neighbor() {
    let qb = VespaQueryBuilder::new(cfg());
    let mut input = SearchInput::default();
    input.app_id = Some("app".into());
    input.mode = Some(SearchMode::Vector);
    input.vector = Some(VectorOptions { embedding: None, ..Default::default() });
    let built = qb.build(input).expect("ok");
    let yql = built.get("yql").and_then(|v| v.as_str()).unwrap();
    assert!(!yql.contains("nearestNeighbor"), "no nearestNeighbor clause when embedding missing");
}
