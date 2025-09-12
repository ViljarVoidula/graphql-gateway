use search_service::{models::{SearchInput, FacetConfig, FacetType}, vespa::mapping::map_search_response};
use serde_json::json;

#[test]
fn maps_categorical_facets_from_grouping() {
    let vespa = json!({
        "root": {
            "fields": {"totalCount": 2},
            "children": [
                {"id":"hit","relevance": 1.0, "fields": {"id": "1", "name": "A"}},
                {"id":"group", "children": [
                    {"id": "grouplist:brand", "label": "brand", "children": [
                        {"value": "Nike", "fields": {"count": 12}},
                        {"value": "Adidas", "fields": {"count": 5}}
                    ]},
                    {"id": "grouplist:is_on_sale", "label": "is_on_sale", "children": [
                        {"value": "true", "fields": {"count": 7}},
                        {"value": "false", "fields": {"count": 93}}
                    ]}
                ]}
            ]
        }
    });

    let mut input = SearchInput::default();
    input.app_id = Some("app".into());
    input.facets = Some(vec![FacetConfig{ field: "brand".into(), r#type: FacetType::Categorical, ..Default::default() }]);

    let resp = map_search_response(input, vespa, 5).expect("ok");
    assert_eq!(resp.facets.len(), 1, "only configured facet should be mapped");
}
