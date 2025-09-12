use std::io::Write;

use bytes::Bytes;
use serde_json::Value;
use zip::write::FileOptions;
use time::{Date, Duration as TimeDuration, OffsetDateTime};

use crate::error::Result;
// use crate::embeddings::{upsert_index_config, IndexConfig}; // replaced by direct GraphQL call

#[derive(Clone)]
pub struct AppPackage { pub zip_data: Bytes }

impl AppPackage {
  pub fn from_dynamic_json(app_id: &str, _schema_version: &str, json: Value) -> Result<Self> {
        // Expect json to include optional fields: schema_fields, tensor_dim, geo_enabled, summary_fields
      // Buffer created later from zip writer; declare at end to avoid unused assignment warning
      let buf: Vec<u8>;
      let mut generated_services_xml = String::new();
      let mut generated_hosts_xml = String::new();
      let mut generated_schema_string = String::new();
      // Capture values for embeddings config
      let mut captured_cluster_id = String::new();
      let mut captured_tensor_dim: i64 = 0;
      let mut captured_geo_enabled: bool = false;
    {
      let cursor = std::io::Cursor::new(Vec::<u8>::new());
      let mut zip = zip::ZipWriter::new(cursor);
            let opts = FileOptions::default();

      // services.xml - minimal content cluster with default endpoints (includes Document API)
            // IMPORTANT: Use a stable content cluster id (not the logical app_id) to avoid
            // triggering Vespa validation error `content-cluster-removal` on each new
            // logical application deployment. Multiple logical "apps" (namespaces)
            // are handled at the document namespace / schema level here; reusing a
            // single content cluster prevents unintended data loss warnings.
            // If you intentionally need separate physical clusters per logical app,
            // you'll need to generate distinct full application packages AND either
            // keep the old cluster id present or include a validation-overrides.xml
            // that allows content-cluster-removal (dangerous: data loss).
      // --- Dynamic knobs (experimental) ---
      // cluster_id           : overrides physical content cluster id (default stable "default-app")
      // nodes                : number of content nodes (default 1)
      // redundancy           : redundancy factor (default 1)
      // allow_* flags        : emit validation-overrides.xml acknowledging risky ops
      // stable_cluster flag  : schema JSON { "stable_cluster": bool } (default true)
      let stable_flag = json.get("stable_cluster").and_then(|v| v.as_bool()).unwrap_or(true);
      // Selection precedence for cluster id:
      // 1. schema JSON cluster_id
      // 2. env SEARCH_CONTENT_CLUSTER_ID
      // 3. stable_flag -> "default-app"
      // 4. fallback legacy app_id
      let env_cluster = std::env::var("SEARCH_CONTENT_CLUSTER_ID").ok();
      let cluster_id = if let Some(cid) = json.get("cluster_id").and_then(|v| v.as_str()) {
            cid
      } else if let Some(ec) = env_cluster.as_deref() { ec }
      else if stable_flag { "default-app" }
      else { app_id };
      captured_cluster_id = cluster_id.to_string();
      let nodes = json.get("nodes").and_then(|v| v.as_u64()).unwrap_or(1).clamp(1, 32) as usize; // arbitrary upper bound
      let redundancy = json.get("redundancy").and_then(|v| v.as_u64()).unwrap_or(1);

      // Build <nodes> section & corresponding hosts file.
      // Host aliases: node1, node2, ... Expect external orchestration to supply matching host names.
      let mut nodes_xml = String::new();
      let mut hosts_xml = String::new();
      hosts_xml.push_str("<hosts>\n");
      for i in 0..nodes {
        let alias = format!("node{}", i + 1);
        // For single-node docker-compose default we keep existing vespa-container hostname.
        // For >1 nodes we emit synthetic host names that user infra must map (e.g. via k8s).
        let host_name = if nodes == 1 { "vespa-container".to_string() } else { format!("vespa-content-{}", i + 1) };
        nodes_xml.push_str(&format!("      <node distribution-key='{}' hostalias='{}'/>\n", i, alias));
        hosts_xml.push_str(&format!("  <host name='{}'>\n    <alias>{}</alias>\n  </host>\n", host_name, alias));
      }
      hosts_xml.push_str("</hosts>");

      let services = format!(
        "<services version='1.0'>\n  <container id='default' version='1.0'>\n    <search/>\n    <document-api/>\n    <http>\n      <server id='default' port='8080' />\n    </http>\n  </container>\n  <content id='{cluster_id}' version='1.0'>\n    <redundancy>{redundancy}</redundancy>\n    <documents>\n      <document type='product' mode='index' />\n    </documents>\n    <nodes>\n{nodes_xml}    </nodes>\n  </content>\n</services>",
        cluster_id = cluster_id,
        redundancy = redundancy,
        nodes_xml = nodes_xml
      );
            zip.start_file("services.xml", opts)?;
            zip.write_all(services.as_bytes())?;
            generated_services_xml = services.clone();

            // hosts.xml - single host alias
      zip.start_file("hosts.xml", opts)?;
      zip.write_all(hosts_xml.as_bytes())?;
      generated_hosts_xml = hosts_xml.clone();

                  // Optional validation overrides (dangerous operations acknowledged explicitly)
                  // Flags (booleans) in schema JSON:
                  //   allow_cluster_removal        -> content-cluster-removal
                  //   allow_field_type_change      -> field-type-change
                  //   allow_document_type_removal  -> document-type-removal (future use)
                  // Optional: validation_overrides_until (string yyyy-mm-dd) default 2025-12-31
                  let mut allows: Vec<&str> = Vec::new();
                  if json.get("allow_cluster_removal").and_then(|v| v.as_bool()).unwrap_or(false) { allows.push("content-cluster-removal"); }
                  if json.get("allow_field_type_change").and_then(|v| v.as_bool()).unwrap_or(false) { allows.push("field-type-change"); }
                  if json.get("allow_document_type_removal").and_then(|v| v.as_bool()).unwrap_or(false) { allows.push("document-type-removal"); }
                        if !allows.is_empty() {
                              // Vespa permits at most 30 days in the future for <allow until='yyyy-mm-dd'>.
                              // We clamp user-provided date to now + 30 days to avoid INVALID_APPLICATION_PACKAGE errors.
                              let now_date = OffsetDateTime::now_utc().date();
                              let max_date = now_date + TimeDuration::days(30);
                              let until_raw = json.get("validation_overrides_until").and_then(|v| v.as_str());
                              let parsed = until_raw.and_then(|s| Date::parse(s, time::macros::format_description!("[year]-[month]-[day]")).ok());
                                          // If user didn't supply a date, we default to "today" (this matches the intent of
                                          // a very short-lived override like "+1 minute" but Vespa only allows day precision).
                                          // Provided dates still get clamped to now+30 days maximum.
                                          let chosen = match parsed {
                                                Some(d) if d <= max_date => d,
                                                Some(_) => max_date, // too far -> clamp
                                                None => now_date,     // missing -> today (shortest practical window)
                                          };
                              let until = format!("{}-{:02}-{:02}", chosen.year(), u8::from(chosen.month()), chosen.day());
                              let mut override_xml = String::from("<validation-overrides>\n");
                              for a in allows { override_xml.push_str(&format!("  <allow until='{}'>{}</allow>\n", until, a)); }
                        override_xml.push_str("</validation-overrides>");
                        zip.start_file("validation-overrides.xml", opts)?;
                        zip.write_all(override_xml.as_bytes())?;
                  }

            // schema - document + fieldset, with optional tensor+position
      let tensor_dim = json.get("tensor_dim").and_then(|v| v.as_i64()).unwrap_or(768);
            let geo_enabled = json.get("geo_enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            captured_tensor_dim = tensor_dim;
            captured_geo_enabled = geo_enabled;
            let mut schema = String::new();
                  schema.push_str(&format!(r#"schema product {{
      document product {{
            # Logical tenancy identifier
            field tenant_id type string {{ indexing: attribute | summary | index }}
            field id type string {{ indexing: attribute | summary }}
                  field name type string {{ indexing: summary | index }}
                  field brand type string {{ indexing: summary | index }}
            # English description text (full-text searchable)
            field description_en type string {{ indexing: summary | index }}
            field price type float {{ indexing: summary | attribute }}
            field image type string {{ indexing: summary }}
            field payload type string {{ indexing: summary | attribute }}
            # Dynamic arbitrary key=value tags flattened from payload for faceting (Approach 1)
            field attributes_kv type array<string> {{ indexing: summary | attribute }}
            # Media collections (stored as arrays of strings)
            field media_images type array<string> {{ indexing: summary | attribute }}
            field media_videos type array<string> {{ indexing: summary | attribute }}
            # Category taxonomy paths or leaf codes
            field categories type array<string> {{ indexing: summary | attribute | index }}
            # Engagement & ranking signals
            field views type int {{ indexing: summary | attribute }}
            field popularity type float {{ indexing: summary | attribute }}
            field priority type int {{ indexing: summary | attribute }}
            # Variations stored as raw JSON string (client can parse); alternative would be struct fieldset
            field variations type string {{ indexing: summary | attribute }}
            field embedding type tensor<float>(x[{dim}]) {{
                  indexing: attribute | summary
                  attribute {{
                        distance-metric: euclidean
                  }}
            }}
"#, dim = tensor_dim));
                        if json.get("enable_ngram_fields").and_then(|v| v.as_bool()).unwrap_or(std::env::var("SEARCH_ENABLE_NGRAM").map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false)) {
                              // Simple additional fields with ngram indexing for short/fuzzy matching (experimental)
                              schema.push_str("    field name_ngram type string { indexing: summary | index }\n");
                              schema.push_str("    field brand_ngram type string { indexing: summary | index }\n");
                              schema.push_str("    field description_en_ngram type string { indexing: summary | index }\n");
                        }
            if geo_enabled { schema.push_str("    field location type position { indexing: attribute }\n"); }

            // extra fields
            if let Some(fields) = json.get("schema_fields").and_then(|v| v.as_array()) {
                for f in fields {
                    if let (Some(name), Some(ftype), Some(indexing)) = (f.get("name").and_then(|v| v.as_str()), f.get("type").and_then(|v| v.as_str()), f.get("indexing").and_then(|v| v.as_str())) {
                        schema.push_str(&format!("    field {} type {} {{ indexing: {} }}\n", name, ftype, indexing));
                    }
                }
            }

      schema.push_str(
      "  }\n\n  fieldset default {\n    fields: tenant_id, id, name, brand, description_en, price, image, payload, attributes_kv, media_images, media_videos, categories, views, popularity, priority, variations\n  }\n\n  document-summary minimal {\n    summary tenant_id type string {}\n    summary id type string {}\n    summary name type string {}\n    summary price type float {}\n  }\n\n  document-summary basic {\n    summary tenant_id type string {}\n    summary id type string {}\n    summary name type string {}\n    summary brand type string {}\n    summary description_en type string {}\n    summary price type float {}\n    summary image type string {}\n  }\n\n  document-summary detailed {\n    summary tenant_id type string {}\n    summary id type string {}\n    summary name type string {}\n    summary brand type string {}\n    summary description_en type string {}\n    summary price type float {}\n    summary image type string {}\n    summary payload type string {}\n    summary attributes_kv type array<string> {}\n    summary media_images type array<string> {}\n    summary media_videos type array<string> {}\n    summary categories type array<string> {}\n    summary views type int {}\n    summary popularity type float {}\n    summary priority type int {}\n    summary variations type string {}\n  }\n\n  document-summary complete {\n    summary tenant_id type string {}\n    summary id type string {}\n    summary name type string {}\n    summary brand type string {}\n    summary description_en type string {}\n    summary price type float {}\n    summary image type string {}\n    summary payload type string {}\n    summary attributes_kv type array<string> {}\n    summary media_images type array<string> {}\n    summary media_videos type array<string> {}\n    summary categories type array<string> {}\n    summary views type int {}\n    summary popularity type float {}\n    summary priority type int {}\n    summary variations type string {}\n  }\n\n  rank-profile default inherits default {\n    inputs { query(query_vector) tensor<float>(x[DIM_PLACEHOLDER]) }\n  }\n\n  rank-profile vector_profile inherits default {\n    first-phase { expression: closeness(query_vector) }\n  }\n\n  rank-profile hybrid_profile inherits default {\n    inputs { query(lexical_weight) double query(vector_weight) double }\n    first-phase { expression: (query(lexical_weight) * nativeRank(name)) + (query(vector_weight) * closeness(query_vector)) }\n  }\n}\n"
      );
                  // Replace placeholder with actual dim
                  schema = schema.replace("DIM_PLACEHOLDER", &tensor_dim.to_string());
                  // Adjust rank profile expressions: fix closeness() argument order and remove deprecated nativeRank(name) usage
                        schema = schema
                              .replace("closeness(query_vector)", "closeness(embedding)")
                              .replace("closeness(embedding, query_vector)", "closeness(embedding)")
                              .replace("nativeRank(name)", "nativeRank");
            generated_schema_string = schema.clone();

            zip.start_file("schemas/product.sd", opts)?;
            zip.write_all(schema.as_bytes())?;

            let cursor = zip.finish()?;
            buf = cursor.into_inner();
        }

            // Side effect: fire-and-forget GraphQL call to embeddings service (always attempt with fallback URL)
            let base_url = std::env::var("EMBEDDINGS_SERVICE_URL").unwrap_or_else(|_| "http://localhost:9200".to_string());
            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                  let app_id_owned = app_id.to_string();
                  let cluster_id_owned = captured_cluster_id.clone();
                  // Default multi-field vectorization configuration
                  let vector_fields = vec![
                        serde_json::json!({
                              "name": "name",
                              "dimensions": captured_tensor_dim,
                              "weight": 0.5
                        }),
                        serde_json::json!({
                              "name": "brand",
                              "dimensions": captured_tensor_dim,
                              "weight": 0.2
                        }),
                        serde_json::json!({
                              "name": "description_en",
                              "dimensions": captured_tensor_dim,
                              "weight": 0.2
                        }),
                        serde_json::json!({
                              "name": "categories",
                              "dimensions": captured_tensor_dim,
                              "weight": 0.1
                        }),
                  ];
                  let tenant_id_default = std::env::var("DEFAULT_TENANT_ID").unwrap_or_else(|_| "saas".to_string());
                  let gql_body = serde_json::json!({
                        "query": "mutation Upsert($input: UpsertIndexConfigInput!) { upsertIndexConfig(input: $input) { id } }",
                        "variables": {"input": {
                              "applicationId": app_id_owned,
                              "tenantId": tenant_id_default,
                              "clusterId": cluster_id_owned,
                              "schema": generated_schema_string,
                              "servicesXml": generated_services_xml,
                              "hostsXml": generated_hosts_xml,
                              "vectorFields": vector_fields
                        }}
                  });
                  handle.spawn(async move {
                        let client = reqwest::Client::new();
                        let url = format!("{}/graphql", base_url.trim_end_matches('/'));
                        match client.post(url).json(&gql_body).send().await {
                              Ok(resp) => {
                                    if !resp.status().is_success() {
                                          tracing::warn!(status=?resp.status(), "embeddings upsertIndexConfig non-success status");
                                    } else {
                                          tracing::debug!("embeddings upsertIndexConfig success");
                                    }
                              }
                              Err(e) => tracing::warn!(error=%e, "failed to call embeddings upsertIndexConfig"),
                        }
                  });
            } else {
                  tracing::debug!("no tokio runtime present; skipping embeddings upsert side effect");
            }

        Ok(AppPackage { zip_data: Bytes::from(buf) })
    }
}
