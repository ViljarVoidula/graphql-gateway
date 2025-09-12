use search_service::{models::{SearchInput}, vespa::mapping::map_search_response};
use serde_json::json;

#[test]
fn maps_suggestions() {
    let vespa = json!({
        "root": {
            "fields": {"totalCount": 0},
            "children": []
        },
        "suggestions": [
            {"text": "nike", "score": 0.9},
            {"text": "nikes", "score": 0.5}
        ]
    });
    let mut input = SearchInput::default();
    input.app_id = Some("app".into());
    let resp = map_search_response(input, vespa, 3).expect("ok");
    assert_eq!(resp.suggestions.len(), 2);
    assert_eq!(resp.suggestions[0].text, "nike");
}
