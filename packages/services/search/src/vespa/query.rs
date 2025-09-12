use serde_json::{json, Value};

use crate::{config::Config, error::Result, models::*};

pub struct VespaQueryBuilder { cfg: Config }

impl VespaQueryBuilder {
    pub fn new(cfg: Config) -> Self { Self { cfg } }

    pub fn build(&self, input: SearchInput) -> Result<Value> {
    let mode = input.mode.unwrap_or(SearchMode::Hybrid);
        let limit = input.pagination.as_ref().and_then(|p| p.limit).unwrap_or(20);
        let offset = input.pagination.as_ref().and_then(|p| p.offset).unwrap_or(0);

    // Build YQL base
    let mut _has_text_query = false;
    // Use 'contains' for string attribute filtering to avoid numeric item expression parsing errors
    let _cfg_app = self.cfg.app_id.clone();
    let tenant_filter_val = if let Some(tid) = input.tenant_id.as_ref().filter(|s| !s.is_empty()) {
        tid.as_str()
    } else if let Some(app) = input.app_id.as_ref().filter(|s| !s.is_empty()) {
        app.as_str()
    } else { self.cfg.default_tenant_id.as_str() };
    let safe_tenant = tenant_filter_val.replace('"', "\"").replace("'", "");
    let mut yql_parts: Vec<String> = vec![format!("tenant_id contains \"{}\"", safe_tenant)];

    // Collect additional WHERE clauses derived from dynamic payload.* filters (translated to attributes_kv contains "key=value")
    let mut payload_filter_clauses: Vec<String> = Vec::new();
    let mut generic_filter_clauses: Vec<String> = Vec::new();
    let mut sanitized_filters: Option<serde_json::Value> = input.filters.clone();
    if let Some(sf) = sanitized_filters.as_mut() {
        if let Some(obj) = sf.as_object_mut() {
            let keys: Vec<String> = obj.keys().cloned().collect();
            for k in keys.iter() {
                // Handle payload.__select operator container (filters: { "payload": { "__select": [..] } })
                if k == "payload" {
                    if let Some(sel_container) = obj.get(k) {
                        if let Some(sel_obj) = sel_container.as_object() {
                            if sel_obj.get("__select").is_some() {
                                // Remove entire payload key so Vespa doesn't see unknown field
                                obj.remove(k);
                                continue; // move to next key
                            }
                        }
                    }
                }
                if let Some(stripped) = k.strip_prefix("payload.") {
                    if let Some(v) = obj.get(k) {
                        match v {
                            serde_json::Value::String(s) => {
                                payload_filter_clauses.push(format!("attributes_kv contains \"{}={}\"", stripped, s.replace('"', "")));
                            }
                            serde_json::Value::Array(arr) => {
                                let mut ors: Vec<String> = Vec::new();
                                for item in arr.iter() { if let Some(s) = item.as_str() { ors.push(format!("attributes_kv contains \"{}={}\"", stripped, s.replace('"', ""))); } }
                                if !ors.is_empty() { payload_filter_clauses.push(format!("({})", ors.join(" OR "))); }
                            }
                            serde_json::Value::Object(m) => {
                                // Support legacy $in and new __in
                                let in_arr_opt = m.get("__in").or_else(|| m.get("$in"));
                                if let Some(in_arr) = in_arr_opt.and_then(|x| x.as_array()) {
                                    let mut ors: Vec<String> = Vec::new();
                                    for item in in_arr.iter() { if let Some(s) = item.as_str() { ors.push(format!("attributes_kv contains \"{}={}\"", stripped, s.replace('"', ""))); } }
                                    if !ors.is_empty() { payload_filter_clauses.push(format!("({})", ors.join(" OR "))); }
                                } else if m.get("__gte").is_some() || m.get("__lte").is_some() || m.get("$gte").is_some() || m.get("$lte").is_some() {
                                    // Numeric range simulation: since values are stringified, we cannot do numeric comparison directly.
                                    // Strategy: we can't efficiently range filter within attributes_kv tags; log a warning via comment.
                                    // For now treat as equality fallback if both bounds equal.
                                    let gte = m.get("__gte").or_else(|| m.get("$gte")).and_then(|x| x.as_f64());
                                    let lte = m.get("__lte").or_else(|| m.get("$lte")).and_then(|x| x.as_f64());
                                    if gte.is_some() && lte.is_some() && (gte == lte) {
                                        let val = gte.unwrap();
                                        payload_filter_clauses.push(format!("attributes_kv contains \"{}={}\"", stripped, val));
                                    } else {
                                        // TODO: true numeric range over dynamic payload requires dedicated numeric top-level field
                                    }
                                }
                            }
                            _ => { /* ignore unsupported types */ }
                        }
                    }
                    // Remove original payload.* filter key so Vespa doesn't attempt to parse unknown field in filter param
                    obj.remove(k);
                }
            }
            // Drop filters object if now empty
            // After removing payload.* keys, build generic filter clauses for remaining fields
            let remaining_keys: Vec<String> = obj.keys().cloned().collect();
            for rk in remaining_keys.iter() {
                if let Some(val) = obj.get(rk) {
                    match val {
                        serde_json::Value::String(s) => {
                            generic_filter_clauses.push(format!("{} contains \"{}\"", rk, s.replace('"', "")));
                        }
                        serde_json::Value::Number(n) => {
                            if let Some(f) = n.as_f64() { generic_filter_clauses.push(format!("{} == {}", rk, f)); }
                        }
                        serde_json::Value::Bool(b) => {
                            generic_filter_clauses.push(format!("{} contains \"{}\"", rk, b));
                        }
                        serde_json::Value::Array(arr) => {
                            let mut ors: Vec<String> = Vec::new();
                            for item in arr.iter() {
                                if let Some(s) = item.as_str() { ors.push(format!("{} contains \"{}\"", rk, s.replace('"', ""))); }
                                else if let Some(num) = item.as_f64() { ors.push(format!("{} == {}", rk, num)); }
                            }
                            if !ors.is_empty() { generic_filter_clauses.push(format!("({})", ors.join(" OR "))); }
                        }
                        serde_json::Value::Object(m) => {
                            let mut parts: Vec<String> = Vec::new();
                            let gte_v = m.get("__gte").or_else(|| m.get("$gte")).and_then(|x| x.as_f64());
                            let lte_v = m.get("__lte").or_else(|| m.get("$lte")).and_then(|x| x.as_f64());
                            if let Some(gte) = gte_v { parts.push(format!("{} >= {}", rk, gte)); }
                            if let Some(lte) = lte_v { parts.push(format!("{} <= {}", rk, lte)); }
                            let eq_v = m.get("__eq").or_else(|| m.get("$eq"));
                            if let Some(eq) = eq_v { if let Some(f) = eq.as_f64() { parts.push(format!("{} == {}", rk, f)); } else if let Some(s) = eq.as_str() { parts.push(format!("{} contains \"{}\"", rk, s.replace('"', ""))); } }
                            let in_arr_opt = m.get("__in").or_else(|| m.get("$in"));
                            if let Some(in_arr) = in_arr_opt.and_then(|x| x.as_array()) {
                                let mut ors: Vec<String> = Vec::new();
                                for item in in_arr.iter() {
                                    if let Some(f) = item.as_f64() { ors.push(format!("{} == {}", rk, f)); }
                                    else if let Some(s) = item.as_str() { ors.push(format!("{} contains \"{}\"", rk, s.replace('"', ""))); }
                                }
                                if !ors.is_empty() { parts.push(format!("({})", ors.join(" OR "))); }
                            }
                            if !parts.is_empty() { generic_filter_clauses.push(parts.join(" AND ")); }
                        }
                        _ => {}
                    }
                }
            }
            if obj.is_empty() { sanitized_filters = None; } // only if everything was payload.*
        }
    }
    // Only include userInput when query has non-whitespace content.
    if let Some(qref) = input.query.as_ref() {
        if !qref.trim().is_empty() {
            _has_text_query = true;
            yql_parts.push("userInput(@q)".to_string());
            // Partial / short token support: for very short queries (<=2 chars) Vespa's default analysis
            // with userInput may under-match. We add lightweight OR wildcard clauses over key text fields.
            // NOTE: This is a pragmatic approach until a custom linguistics/gram setup is introduced.
            let trimmed = qref.trim();
            if trimmed.len() <= self.cfg.partial_min_token_len { // configured short token threshold
                let esc = trimmed.replace('"', "");
                let mut wildcards: Vec<String> = Vec::new();
                for f in self.cfg.partial_fields.iter() {
                    // If ngram fields enabled, prefer *_ngram field to leverage ngram indexing
                    if self.cfg.enable_ngram_fields { wildcards.push(format!("{}_ngram contains \"{}\"", f, esc)); }
                    // Always keep a prefix fallback for recall
                    wildcards.push(format!("{f} contains \"{}*\"", esc));
                }
                if !wildcards.is_empty() {
                    yql_parts.push(format!("({})", wildcards.join(" OR ")));
                }
            } else {
                // Basic fuzzy expansion (very conservative): if caller enabled typo.fuzzy OR query has no spaces and length<=5
                // append OR variants with single char wildcard at end to simulate prefix tolerance.
                if let Some(typo) = input.typo.as_ref() { if typo.fuzzy.unwrap_or(false) { if !trimmed.contains(' ') && trimmed.len() <= 5 { let esc = trimmed.replace('"', ""); yql_parts.push(format!("(name contains \"{}*\" OR brand contains \"{}*\")", esc, esc)); } } }
            }
        }
    }
        if let Some(weighted) = &input.weighted_query {
            // naive mapping: concat terms with weights as rank features
            if weighted.is_object() {
                let obj = weighted.as_object().unwrap();
                let terms: Vec<String> = obj.iter().map(|(term, _w)| format!("userInput('{}')", term.replace("'", " "))).collect();
                if !terms.is_empty() { yql_parts.push(format!("({})", terms.join(" OR "))); }
            }
        }

    let base_select = format!("select * from sources * where {}", yql_parts.join(" AND "));

    // nearestNeighbor for vector mode
    let nn_clause = if matches!(mode, SearchMode::Vector | SearchMode::Hybrid) {
            if let Some(v) = &input.vector { if v.embedding.is_some() {
                let field = v.embedding_field.clone().unwrap_or_else(|| "embedding".to_string());
                // Respect caller-provided top_k override else fallback to page limit.
                let target_hits = v.top_k.unwrap_or(limit).max(1);
                Some(format!("({{targetHits:{}}}nearestNeighbor({}, query_vector))", target_hits, field))
            } else { None } }
            else { None }
        } else { None };

        let where_clause = match nn_clause { Some(nn) => format!("{} AND {}", base_select, nn), None => base_select };

        // prepare parameters
    let mut params = json!({ "yql": where_clause, "offset": offset, "hits": limit });
    if matches!(mode, SearchMode::Vector | SearchMode::Hybrid) {
        params["ranking.listFeatures"] = json!(true);
    }
    match mode {
        SearchMode::Vector => { params["ranking.profile"] = json!("vector_profile"); },
        SearchMode::Hybrid => {
            params["ranking.profile"] = json!("hybrid_profile");
            params["ranking.features.query(lexical_weight)"] = json!(self.cfg.hybrid_lexical_weight);
            params["ranking.features.query(vector_weight)"] = json!(self.cfg.hybrid_vector_weight);
        },
        SearchMode::Lexical => { /* default profile */ }
    }
    if let Some(q) = input.query {
        if !q.trim().is_empty() {
            params["q"] = json!(q);
        }
    }

        // inject query_vector if provided
        if let Some(v) = input.vector.as_ref().and_then(|v| v.embedding.clone()) {
            params["ranking.features.query(query_vector)"] = json!(v);
        }

        // weighted query boosts -> ranking.features or query params (simplified)
        if let Some(weighted) = &input.weighted_query {
            if weighted.is_object() {
                params["weightedQuery"] = weighted.clone();
            }
        }

        // filters -> filter query
        if let Some(filters) = sanitized_filters {
            params["filter"] = json!(filters);
        }

        // typo/suggestions toggles (placeholders; downstream handler to interpret)
        if let Some(typo) = &input.typo { params["typo"] = json!(typo); }
        if let Some(suggest) = &input.suggest { params["suggest"] = json!(suggest); }

        // Build grouping YQL pipe for facets
        if let Some(facets) = &input.facets {
            if !facets.is_empty() {
                let mut pipes: Vec<String> = vec![];
                // Increase tracelevel so Vespa returns grouping debug info
                params["tracelevel"] = json!(2);
                for f in facets {
                    // Sanitize alias (dots not allowed in alias identifiers)
                    let alias_base = f.field.replace('.', "_");
                    let alias = format!("{}_facet", alias_base);
                    // Translate logical facet on payload.<key> into grouping on attributes_kv and post-process later.
                    let physical_field = if f.field.starts_with("payload.") { "attributes_kv" } else { f.field.as_str() };
                    match f.r#type {
                        FacetType::Categorical | FacetType::Boolean => {
                            let limit = f.categorical.as_ref().and_then(|c| c.limit).unwrap_or(10);
                            // Vespa grouping syntax: all(group(field) max(N) each(output(count())))
                            pipes.push(format!("all(group({}) max({}) each(output(count())) as({}))", physical_field, limit, alias));
                        }
                        FacetType::Range => {
                            if let Some(ranges) = f.range.as_ref().and_then(|r| r.ranges.clone()) {
                                let specs: Vec<String> = ranges
                                    .into_iter()
                                    .map(|ri| format!("bucket({}, {})", ri.min, ri.max))
                                    .collect();
                                let bucket_count = specs.len();
                                // Add max(bucket_count) to be explicit
                                pipes.push(format!("all(group(predefined({}, {})) max({}) each(output(count())) as({}))", physical_field, specs.join(","), bucket_count, alias));
                            }
                        }
                        FacetType::DateRange => {
                            // Simplified: treat as categorical on a date bucketized field; customize as needed
                            pipes.push(format!("all(group({}) each(output(count())) as({}))", physical_field, alias));
                        }
                        FacetType::Hierarchy => {
                            // Split by separator and group by first segment; deeper levels require post-processing
                            pipes.push(format!("all(group({}) each(output(count())) as({}))", physical_field, alias));
                        }
                    }
                }
                if !pipes.is_empty() {
                    let yql_with_grouping = format!("{} | {}", params["yql"].as_str().unwrap_or(""), pipes.join(" | "));
                    params["yql"] = json!(yql_with_grouping);
                }
            }
        }

    // Append any derived payload.* filter clauses to the WHERE
    let mut combined_extra: Vec<String> = Vec::new();
    combined_extra.extend(payload_filter_clauses.into_iter());
    combined_extra.extend(generic_filter_clauses.into_iter());
    if !combined_extra.is_empty() {
    let current_yql = params["yql"].as_str().unwrap_or("").to_string();
        // current_yql starts with select * from sources * where <cond>
        // We simply add AND (...) at end before potential grouping pipe
        if let Some(idx) = current_yql.find(" | ") { // grouping present
            let (base, rest) = current_yql.split_at(idx);
            let augmented = format!("{} AND ({}){}", base, combined_extra.join(" AND "), rest);
            params["yql"] = json!(augmented);
        } else {
            let augmented = format!("{} AND ({})", current_yql, combined_extra.join(" AND "));
            params["yql"] = json!(augmented);
        }
    }

    // Debug log YQL (temporary; could gate behind config flag)
    tracing::debug!(target: "vespa_query", yql = %params["yql"], "Built Vespa YQL");

        // Field selection preset -> summary class hint (custom mapping)
        if let Some(fields) = &input.fields {
            if let Some(preset) = fields.preset {
                let summary = match preset {
                    FieldPreset::Minimal => "minimal",
                    FieldPreset::Basic => "basic",
                    FieldPreset::Detailed => "detailed",
                    FieldPreset::Complete => "complete",
                };
                params["summary"] = json!(summary);
                params["summary.features"] = json!("[summary]" );
            }
        }

        // If client didn't specify a preset or explicit field selection, default to the richest
        // summary so GraphQL can fulfill requested fields consistently across modes.
        if params.get("summary").is_none() {
            params["summary"] = json!("complete");
            // Request summary features explicitly to encourage Vespa to materialize all summary fields.
            params["summary.features"] = json!("[summary]");
        }

        Ok(params)
    }
}
