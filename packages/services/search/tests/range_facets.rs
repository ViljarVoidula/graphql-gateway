use search_service::models::{SearchInput, FacetConfig, FacetType, RangeFacetOptions, RangeInput};
use search_service::vespa::mapping::map_search_response;
use serde_json::json;

// Helper to build input with a price range facet
fn range_input() -> SearchInput {
    let mut input = SearchInput::default();
    input.app_id = Some("app".into());
    let mut cfg = FacetConfig { field: "price".into(), r#type: FacetType::Range, ..Default::default() };
    cfg.range = Some(RangeFacetOptions { ranges: Some(vec![
        RangeInput { min:0.0, max:50.0, label: Some("Budget".into()) },
        RangeInput { min:50.0, max:100.0, label: Some("Mid".into()) }
    ]), ..Default::default() });
    input.facets = Some(vec![cfg]);
    input
}

#[test]
fn maps_range_facet_with_bucket_counts_from_grouping() {
    // Simulate Vespa returning grouping buckets with counts
    let vespa = json!({
        "root": {
            "fields": {"totalCount": 3},
            "children": [
                {"id":"hit","relevance":1.0,"fields":{"id":"1","price": 10.0}},
                {"id":"hit","relevance":1.0,"fields":{"id":"2","price": 55.0}},
                {"id":"group", "children": [
                    {"id":"grouplist:price", "label":"price", "children": [
                        {"id":"group:bucket(0, 50)", "value":"bucket(0, 50)", "fields":{"count": 7}},
                        {"id":"group:bucket(50, 100)", "value":"bucket(50, 100)", "fields":{"count": 4}}
                    ]}
                ]}
            ]
        }
    });
    let input = range_input();
    let resp = map_search_response(input, vespa, 1).expect("ok");
    assert_eq!(resp.facets.len(), 1);
    let range = match &resp.facets[0] { search_service::models::FacetResultUnion::Range(r) => r, _ => panic!("expected range facet") };
    let buckets = range.buckets.as_ref().expect("buckets");
    assert_eq!(buckets.len(), 2);
    // Labels should be filled from input config
    assert_eq!(buckets[0].label.as_deref(), Some("Budget"));
    assert_eq!(buckets[1].label.as_deref(), Some("Mid"));
    assert_eq!(buckets[0].min, 0.0);
    assert_eq!(buckets[0].max, 50.0);
    assert_eq!(buckets[1].min, 50.0);
    assert_eq!(buckets[1].max, 100.0);
}

#[test]
fn fills_range_bucket_counts_from_results_when_zero() {
    // Vespa returns buckets but all counts 0 -> our post-process should compute based on result prices
    let vespa = json!({
        "root": {
            "fields": {"totalCount": 3},
            "children": [
                {"id":"hit","relevance":1.0,"fields":{"id":"1","price": 10.0}},
                {"id":"hit","relevance":1.0,"fields":{"id":"2","price": 55.0}},
                {"id":"hit","relevance":1.0,"fields":{"id":"3","price": 60.0}},
                {"id":"group", "children": [
                    {"id":"grouplist:price", "label":"price", "children": [
                        {"id":"group:bucket(0, 50)", "value":"bucket(0, 50)", "fields":{"count": 0}},
                        {"id":"group:bucket(50, 100)", "value":"bucket(50, 100)", "fields":{"count": 0}}
                    ]}
                ]}
            ]
        }
    });
    let input = range_input();
    let resp = map_search_response(input, vespa, 1).expect("ok");
    let range = match &resp.facets[0] { search_service::models::FacetResultUnion::Range(r) => r, _ => panic!("expected range facet") };
    let buckets = range.buckets.as_ref().unwrap();
    // Post-process counts should be 1 in first (10.0) and 2 in second (55,60)
    assert_eq!(buckets[0].count, 1);
    assert_eq!(buckets[1].count, 2);
}

#[test]
fn seeds_range_buckets_with_empty_group_node() {
    // Provide an empty grouplist:price node so mapper recognizes facet then seeds from config
    let vespa = json!({
        "root": {
            "fields": {"totalCount": 2},
            "children": [
                {"id":"hit","relevance":1.0,"fields":{"id":"1","price": 10.0}},
                {"id":"hit","relevance":1.0,"fields":{"id":"2","price": 70.0}},
                {"id":"group", "children": [ {"id":"grouplist:price", "label":"price", "children": [] } ]}
            ]
        }
    });
    let input = range_input();
    let resp = map_search_response(input, vespa, 1).expect("ok");
    assert_eq!(resp.facets.len(), 1, "range facet present");
    let range = match &resp.facets[0] { search_service::models::FacetResultUnion::Range(r) => r, _ => panic!("expected range facet") };
    let buckets = range.buckets.as_ref().unwrap();
    assert_eq!(buckets.len(), 2, "seeded buckets");
    assert_eq!(buckets[0].label.as_deref(), Some("Budget"));
    assert_eq!(buckets[1].label.as_deref(), Some("Mid"));
    // Post-process fills counts: first bucket (10), second bucket (70)
    assert_eq!(buckets[0].count, 1);
    assert_eq!(buckets[1].count, 1);
}
