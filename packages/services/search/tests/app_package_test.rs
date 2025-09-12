use search_service::indexer::app_package::AppPackage;
use std::io::Read;

#[test]
fn app_package_builds_and_contains_expected_schema() {
    let json = serde_json::json!({
        "tensor_dim": 16,
        "geo_enabled": false,
        "schema_fields": [
            {"name":"color","type":"string","indexing":"attribute | summary"}
        ]
    });
    let pkg = AppPackage::from_dynamic_json("shop", "v1", json).expect("package");
    // Basic sanity: zip data non-empty
    assert!(pkg.zip_data.len() > 100); // arbitrary minimal size

    // Unzip and read schemas/product.sd
    let reader = std::io::Cursor::new(pkg.zip_data.to_vec());
    let mut zip = zip::ZipArchive::new(reader).expect("zip open");
    let mut file = zip.by_name("schemas/product.sd").expect("product.sd present");
    let mut contents = String::new();
    file.read_to_string(&mut contents).expect("read schema");

    assert!(contents.contains("field color type string"), "custom field missing: {contents}");
    assert!(!contents.contains("field location type position"), "location field should be omitted");
    assert!(contents.contains("tensor<float>(x[16])"), "tensor dim not applied");
}
