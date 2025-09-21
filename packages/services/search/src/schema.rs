use async_graphql::{Context, EmptySubscription, Object, Schema};

use crate::{config::Config, models::*, vespa::query::VespaQueryBuilder, index_config};

pub type SearchSchema = Schema<QueryRoot, MutationRoot, EmptySubscription>;

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    async fn search(&self, ctx: &Context<'_>, input: SearchInput) -> async_graphql::Result<SearchResponse> {
        // Validate input per design rules
        if input.query.is_some() && input.weighted_query.is_some() {
            return Err("Provide either query or weightedQuery".into());
        }
    let cfg = ctx.data::<Config>()?;
        let vespa = ctx.data::<crate::vespa::client::VespaClient>()?;
        // Try remote embedding if enabled and caller didn't supply embedding already
        let maybe_client = ctx.data_opt::<Option<crate::embeddings::EmbeddingsClient>>().and_then(|c| c.clone());
        let mut enriched_input = input.clone();
    // Normalize blank query strings (treat as None / match-all)
    if let Some(q) = enriched_input.query.as_ref() { if q.trim().is_empty() { enriched_input.query = None; } }
        let has_vector = enriched_input.vector.as_ref().and_then(|v| v.embedding.as_ref()).is_some();
        let mut embedding_error: Option<String> = None;
        if !has_vector {
            // Try to collect richer error by invoking directly (duplicate logic inline for error capture)
            if cfg.enable_remote_embeddings {
                if let Some(client) = maybe_client.as_ref() {
                    let started = std::time::Instant::now();
                    match client.build_query_embedding(enriched_input.query.as_deref(), enriched_input.weighted_query.as_ref(), cfg.embeddings_text_model.as_deref(), cfg.embeddings_image_model.as_deref()).await {
                        Ok(Some(vec)) => {
                            crate::metrics::record_embedding_latency(started.elapsed().as_millis() as u64);
                            let mut vo = enriched_input.vector.clone().unwrap_or_default();
                            vo.embedding = Some(vec);
                            enriched_input.vector = Some(vo);
                        }
                        Ok(None) => { /* nothing to do */ }
                        Err(e) => { embedding_error = Some(format!("embedding_fetch_failed: {}", e)); }
                    }
                }
            }
        }

        let qb = VespaQueryBuilder::new(cfg.clone());
        let request = qb.build(enriched_input.clone())?;
        let start = std::time::Instant::now();
        let resp = vespa.search(request).await?;
        let elapsed = start.elapsed().as_millis() as i32;

        let mut out = crate::vespa::mapping::map_search_response(enriched_input.clone(), resp, elapsed)?;
        // Populate autocomplete suggestions via Redis (fast path)
        if let Some(ac) = ctx.data_opt::<crate::autocomplete::AutocompleteClient>() {
                // Decide tenant and fields
                let tenant = enriched_input.tenant_id.as_deref().unwrap_or(&cfg.default_tenant_id);
                // Choose source fields: default to ["name", "brand"] if not provided
                // Prefer index config's autocompletePaths if available from embeddings service
                let idx_cfg_opt = index_config::get_index_config_cached(enriched_input.app_id.as_deref().unwrap_or(&cfg.app_id), cfg.embeddings_service_url.as_deref()).await.ok().flatten();
                let default_fields: Vec<String> = idx_cfg_opt.as_ref().and_then(|ic| if ic.autocomplete_paths.is_empty() { None } else { Some(ic.autocomplete_paths.clone()) })
                    .unwrap_or_else(|| vec!["name".into(), "brand".into()]);
                let fields: Vec<String> = input
                    .suggest
                    .as_ref()
                    .and_then(|s| s.source_fields.clone())
                    .unwrap_or(default_fields);
                let limit = input.suggest.as_ref().and_then(|s| s.limit).unwrap_or(10) as usize;
                let prefix = enriched_input.query.as_deref().unwrap_or("");
                if !prefix.is_empty() {
                    let mut agg: Vec<crate::models::Suggestion> = Vec::new();
                    for f in fields.iter() {
                        match ac.get_suggestions(tenant, f, prefix, limit, input.typo.as_ref().and_then(|t| t.fuzzy).unwrap_or(false)).await {
                            Ok(hits) => {
                                for h in hits.into_iter() {
                                    let text = h.display.unwrap_or_else(|| h.term);
                                    agg.push(crate::models::Suggestion { text, r#type: crate::models::SuggestType::Term, score: Some(h.score as f32) });
                                }
                            }
                            Err(e) => {
                                tracing::warn!(target="autocomplete", error=%e, "autocomplete fetch failed");
                            }
                        }
                    }
                    // Dedup suggestions by text and keep top N
                    use std::collections::HashMap;
                    let mut by_text: HashMap<String, crate::models::Suggestion> = HashMap::new();
                    for s in agg.into_iter() {
                        let replace = match by_text.get(&s.text) { None => true, Some(prev) => s.score.unwrap_or(0.0) > prev.score.unwrap_or(0.0) };
                        if replace { by_text.insert(s.text.clone(), s); }
                    }
                    let mut merged: Vec<crate::models::Suggestion> = by_text.into_values().collect();
                    merged.sort_by(|a,b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
                    merged.truncate(limit);
                    out.suggestions = merged;
                }
        }
        if let Some(err) = embedding_error { // Attach extension by wrapping into a GraphQL error extension-like field in meta.query if free
            // (Simplest: log; real extension injection would require custom Response build. We'll piggy-back meta.query)
            tracing::info!(embedding.error=%err, "embedding fetch error attached");
        }
        Ok(out)
    }

    async fn health(&self) -> async_graphql::Result<String> { Ok("ok".to_string().into()) }

    /// Basic aggregated index stats (document count + memory usage if derivable)
    async fn index_stats(&self, ctx: &Context<'_>, app_id: Option<String>, doc_type: Option<String>) -> async_graphql::Result<IndexStats> {
        let cfg = ctx.data::<Config>()?;
        let vespa = ctx.data::<crate::vespa::client::VespaClient>()?;
        let app = app_id.unwrap_or_else(|| cfg.app_id.clone());
        let dtype = doc_type.unwrap_or_else(|| "product".to_string());
        let doc_count = vespa.document_count(&app, &dtype).await.unwrap_or(0);
        // Attempt to parse memory usage from metrics JSON (real Vespa format: metrics:[{values:{<metric_name>:<val>,..}}])
        let mut memory_used_ratio: Option<f32> = None;
        let mut memory_used_bytes: Option<i64> = None;
    let mut memory_total_bytes: Option<i64> = None;
    let mut disk_used_bytes: Option<i64> = None;
    let disk_total_bytes: Option<i64> = None;
    let mut disk_used_ratio: Option<f32> = None;
        if let Ok(raw_metrics) = vespa.system_metrics().await {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw_metrics) {
                if let Some(nodes) = json.get("nodes").and_then(|n| n.as_array()) {
                    // Aggregate across nodes/services
                    let mut rss_sum: i128 = 0; // use wider to avoid overflow during sum
                    let mut heap_free_sum: i128 = 0;
                    let mut allocated_bytes_total: i128 = 0;
                    let mut disk_docdb_bytes: i128 = 0;
                    let mut disk_tl_bytes: i128 = 0;
                    for node in nodes {
                        if let Some(services) = node.get("services").and_then(|s| s.as_array()) {
                            for svc in services {
                                if let Some(metrics) = svc.get("metrics").and_then(|m| m.as_array()) {
                                    for metric in metrics {
                                        if let Some(values) = metric.get("values").and_then(|v| v.as_object()) {
                                            for (k, val) in values.iter() {
                                                // Accept integer or float
                                                let as_i128 = val.as_i64().map(|v| v as i128).or_else(|| val.as_f64().map(|f| f as i128));
                                                match k.as_str() {
                                                    "memory_rss" => { if let Some(v) = as_i128 { rss_sum += v; } }
                                                    "mem.heap.free.average" => { if let Some(v) = as_i128 { heap_free_sum += v; } }
                                                    "content.proton.documentdb.memory_usage.allocated_bytes.last" => { if let Some(v) = as_i128 { allocated_bytes_total += v; } }
                                                    "content.proton.documentdb.disk_usage.last" => { if let Some(v) = as_i128 { disk_docdb_bytes += v; } }
                                                    "content.proton.transactionlog.disk_usage.last" => { if let Some(v) = as_i128 { disk_tl_bytes += v; } }
                                                    _ => {}
                                                }
                                                // Ratios (floats)
                                                if k == "content.proton.resource_usage.memory.average" { if let Some(f) = val.as_f64() { memory_used_ratio = Some(memory_used_ratio.map(|e| e.max(f as f32)).unwrap_or(f as f32)); } }
                                                if k == "content.proton.resource_usage.disk.average" { if let Some(f) = val.as_f64() { disk_used_ratio = Some(disk_used_ratio.map(|e| e.max(f as f32)).unwrap_or(f as f32)); } }
                                                if k == "cluster-controller.resource_usage.max_memory_utilization.last" { if let Some(f) = val.as_f64() { memory_used_ratio = Some(memory_used_ratio.map(|e| e.max(f as f32)).unwrap_or(f as f32)); } }
                                                if k == "cluster-controller.resource_usage.max_disk_utilization.last" { if let Some(f) = val.as_f64() { disk_used_ratio = Some(disk_used_ratio.map(|e| e.max(f as f32)).unwrap_or(f as f32)); } }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // Derive used bytes: prefer RSS sum, else allocated
                    if rss_sum > 0 { memory_used_bytes = Some(rss_sum as i64); }
                    else if allocated_bytes_total > 0 { memory_used_bytes = Some(allocated_bytes_total as i64); }
                    // Derive a pseudo total if we have heap free + used (RSS + free heap)
                    if memory_total_bytes.is_none() && memory_used_bytes.is_some() {
                        if heap_free_sum > 0 { memory_total_bytes = Some((heap_free_sum + rss_sum.max(allocated_bytes_total)) as i64); }
                    }
                    let disk_total_used = disk_docdb_bytes + disk_tl_bytes;
                    if disk_total_used > 0 { disk_used_bytes = Some(disk_total_used as i64); }
                }
            }
        }
        if memory_used_ratio.is_none() {
            if let (Some(used), Some(total)) = (memory_used_bytes, memory_total_bytes) {
                if total > 0 { memory_used_ratio = Some(used as f32 / total as f32); }
            }
        }
        if disk_used_ratio.is_none() {
            if let (Some(used), Some(total)) = (disk_used_bytes, disk_total_bytes) {
                if total > 0 { disk_used_ratio = Some(used as f32 / total as f32); }
            }
        }
        Ok(IndexStats { app_id: app, document_count: doc_count, memory_used_ratio, memory_used_bytes, memory_total_bytes, disk_used_bytes, disk_total_bytes, disk_used_ratio, doc_type: dtype })
    }

    /// Raw Vespa metrics JSON (truncated by server if large)
    async fn vespa_stats(&self, ctx: &Context<'_>) -> async_graphql::Result<VespaStats> {
        let vespa = ctx.data::<crate::vespa::client::VespaClient>()?;
        let raw = vespa.system_metrics().await.unwrap_or_else(|e| format!("error: {}", e));
        let (preview, truncated) = if raw.len() > 30_000 { (format!("{}...<truncated {} chars>", &raw[..30_000], raw.len()-30_000), true) } else { (raw, false) };
        let decorated = if truncated { preview } else { preview };
        Ok(VespaStats { raw: decorated })
    }
}

pub struct MutationRoot;

#[Object]
impl MutationRoot {
    // Upsert a product document; vectors provided externally are stored as-is
    async fn upsert_product(&self, ctx: &Context<'_>, app_id: String, tenant_id: Option<String>, doc: serde_json::Value) -> async_graphql::Result<bool> {
        let vespa = ctx.data::<crate::vespa::client::VespaClient>()?;
        let cfg = ctx.data::<crate::config::Config>()?;
    let embeddings_client_opt = ctx.data_opt::<Option<crate::embeddings::EmbeddingsClient>>().and_then(|o| o.clone());
    let index_cfg = index_config::get_index_config_cached(&app_id, cfg.embeddings_service_url.as_deref()).await.ok().flatten();
        let mut working = doc;
        if let serde_json::Value::Object(ref mut map) = working {
            // If experimental ngram fields enabled, copy base fields.
            let ngram_enabled = std::env::var("SEARCH_ENABLE_NGRAM").map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
            if ngram_enabled {
                if let Some(v) = map.get("name").and_then(|v| v.as_str()) { map.insert("name_ngram".into(), serde_json::Value::String(v.to_string())); }
                if let Some(v) = map.get("brand").and_then(|v| v.as_str()) { map.insert("brand_ngram".into(), serde_json::Value::String(v.to_string())); }
                if let Some(v) = map.get("description_en").and_then(|v| v.as_str()) { map.insert("description_en_ngram".into(), serde_json::Value::String(v.to_string())); }
            }
            // Explicit tenantId precedence:
            // 1. tenant_id field already in document
            // 2. tenantId argument (if provided) -> inject if missing OR validate if present and mismatched
            // 3. fallback to default_tenant_id (legacy convenience)
            if let Some(arg_tid) = tenant_id.as_ref() {
                match map.get("tenant_id") {
                    Some(existing) if existing.as_str() == Some(arg_tid.as_str()) => { /* ok */ }
                    Some(existing) => {
                        return Err(async_graphql::Error::new(format!("tenant_id mismatch: doc has {:?} but tenantId arg is {}", existing, arg_tid)));
                    }
                    None => { map.insert("tenant_id".into(), serde_json::Value::String(arg_tid.clone())); }
                }
            } else {
                map.entry("tenant_id").or_insert_with(|| serde_json::Value::String(cfg.default_tenant_id.clone()));
            }

            // Accept precomputed vectors from ingestion: normalize common vector shapes into `embedding`
            // Supported inputs:
            // - { embedding: [f32,...] }
            // - { vector: [f32,...] }
            // - { vector: { embedding|values|data|vector: [f32,...] } }
            // - { vectors: { text: [f32,...], ... } } -> prefer `text` or first entry
            if map.get("embedding").is_none() {
                // vector: Array or Object
                if let Some(vec_val) = map.remove("vector") {
                    match vec_val {
                        serde_json::Value::Array(arr) => {
                            map.insert("embedding".into(), serde_json::Value::Array(arr));
                        }
                        serde_json::Value::Object(mut obj) => {
                            if let Some(inner) = obj.remove("embedding")
                                .or_else(|| obj.remove("values"))
                                .or_else(|| obj.remove("data"))
                                .or_else(|| obj.remove("vector"))
                            {
                                if inner.is_array() { map.insert("embedding".into(), inner); }
                            }
                        }
                        _ => { /* ignore */ }
                    }
                } else if let Some(vectors_any) = map.get_mut("vectors") {
                    // vectors: pick a sensible default (text) or first
                    let chosen = match vectors_any {
                        serde_json::Value::Object(obj) => {
                            if let Some(v) = obj.remove("text") { Some(v) }
                            else { obj.values().next().cloned() }
                        }
                        other => Some(other.clone()),
                    };
                    if let Some(val) = chosen {
                        match val {
                            serde_json::Value::Array(arr) => {
                                map.insert("embedding".into(), serde_json::Value::Array(arr));
                            }
                            serde_json::Value::Object(mut obj) => {
                                if let Some(inner) = obj.remove("embedding")
                                    .or_else(|| obj.remove("values"))
                                    .or_else(|| obj.remove("data"))
                                {
                                    if inner.is_array() { map.insert("embedding".into(), inner); }
                                }
                            }
                            _ => {}
                        }
                    }
                    // Remove to avoid unknown field noise
                    map.remove("vectors");
                }
            }
            // If embedding not supplied and we have index config + embeddings client, build weighted embedding
            if map.get("embedding").is_none() {
                if let (Some(ic), Some(client)) = (index_cfg.as_ref(), embeddings_client_opt.as_ref()) {
                    if let Some(weighted) = index_config::build_weighted_texts(&serde_json::Value::Object(map.clone()), ic) {
                        // Build weightedTexts array input
                        let weighted_texts_json: Vec<serde_json::Value> = weighted.iter().map(|(t, w)| serde_json::json!({"text": t, "weight": w})).collect();
                        let hybrid = serde_json::json!({"texts": weighted_texts_json});
                        if let Ok(Some(vec)) = client.build_query_embedding(None, Some(&hybrid), ic.active_model.as_deref(), None).await {
                            map.insert("embedding".into(), serde_json::Value::Array(vec.into_iter().map(|f| serde_json::Value::from(f)).collect()));
                        }
                    }
                }
            }

            // Flatten dynamic payload key/values into attributes_kv (Approach 1) BEFORE payload is stringified in feed layer
            if let Some(payload_val) = map.get("payload") {
                if let serde_json::Value::Object(obj) = payload_val {
                    let mut tags: Vec<serde_json::Value> = Vec::new();
                    for (k, v) in obj.iter() {
                        match v {
                            serde_json::Value::String(s) => tags.push(serde_json::Value::String(format!("{}={}", k, s))),
                            serde_json::Value::Number(n) => tags.push(serde_json::Value::String(format!("{}={}", k, n))),
                            serde_json::Value::Bool(b) => tags.push(serde_json::Value::String(format!("{}={}", k, b))),
                            serde_json::Value::Array(arr) => {
                                for item in arr.iter() {
                                    if let Some(s) = item.as_str() {
                                        tags.push(serde_json::Value::String(format!("{}={}", k, s)));
                                    } else if let Some(num) = item.as_f64() {
                                        // Use default float formatting; trim trailing zeros not critical
                                        tags.push(serde_json::Value::String(format!("{}={}", k, num)));
                                    }
                                }
                            }
                            _ => { /* ignore nested objects/null */ }
                        }
                    }
                    if !tags.is_empty() {
                        map.insert("attributes_kv".into(), serde_json::Value::Array(tags));
                    }
                }
            }

            // Transform design-level unified media array -> storage arrays (media_images/media_videos)
            if let Some(media_val) = map.remove("media") {
                if let serde_json::Value::Array(items) = media_val {
                    let mut images: Vec<serde_json::Value> = Vec::new();
                    let mut videos: Vec<serde_json::Value> = Vec::new();
                    for item in items.into_iter() {
                        if let serde_json::Value::Object(obj) = item {
                            if let Some(url) = obj.get("url").and_then(|v| v.as_str()) {
                                let media_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or("IMAGE").to_uppercase();
                                match media_type.as_str() {
                                    "VIDEO" => videos.push(serde_json::Value::String(url.to_string())),
                                    _ => images.push(serde_json::Value::String(url.to_string())),
                                }
                            }
                        }
                    }
                    if !images.is_empty() { map.insert("media_images".into(), serde_json::Value::Array(images)); }
                    if !videos.is_empty() { map.insert("media_videos".into(), serde_json::Value::Array(videos)); }
                }
            }
        } else {
            return Err(async_graphql::Error::new("document must be a JSON object"));
        }
        vespa.feed_document(&app_id, working).await?;
        Ok(true)
    }

    /// Bulk upsert products (optimized batching). Returns number of documents processed.
    async fn upsert_products(&self, ctx: &Context<'_>, app_id: String, tenant_id: Option<String>, docs: Vec<serde_json::Value>) -> async_graphql::Result<i32> {
        let vespa = ctx.data::<crate::vespa::client::VespaClient>()?;
        let cfg = ctx.data::<crate::config::Config>()?;
    let embeddings_client_opt = ctx.data_opt::<Option<crate::embeddings::EmbeddingsClient>>().and_then(|o| o.clone());
    let index_cfg = index_config::get_index_config_cached(&app_id, cfg.embeddings_service_url.as_deref()).await.ok().flatten();
        if docs.is_empty() { return Ok(0); }
        let mut processed: Vec<serde_json::Value> = Vec::with_capacity(docs.len());
        for mut doc in docs.into_iter() {
            if let serde_json::Value::Object(ref mut map) = doc {
                let ngram_enabled = std::env::var("SEARCH_ENABLE_NGRAM").map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
                if ngram_enabled {
                    if let Some(v) = map.get("name").and_then(|v| v.as_str()) { map.insert("name_ngram".into(), serde_json::Value::String(v.to_string())); }
                    if let Some(v) = map.get("brand").and_then(|v| v.as_str()) { map.insert("brand_ngram".into(), serde_json::Value::String(v.to_string())); }
                    if let Some(v) = map.get("description_en").and_then(|v| v.as_str()) { map.insert("description_en_ngram".into(), serde_json::Value::String(v.to_string())); }
                }
                if let Some(arg_tid) = tenant_id.as_ref() {
                    match map.get("tenant_id") {
                        Some(existing) if existing.as_str() == Some(arg_tid.as_str()) => {}
                        Some(existing) => { return Err(async_graphql::Error::new(format!("tenant_id mismatch in bulk doc id={:?}: {:?} != {}", map.get("id").and_then(|v| v.as_str()), existing, arg_tid))); }
                        None => { map.insert("tenant_id".into(), serde_json::Value::String(arg_tid.clone())); }
                    }
                } else {
                    map.entry("tenant_id").or_insert_with(|| serde_json::Value::String(cfg.default_tenant_id.clone()));
                }

                // Normalize precomputed vectors into `embedding` to avoid regenerating embeddings
                if map.get("embedding").is_none() {
                    if let Some(vec_val) = map.remove("vector") {
                        match vec_val {
                            serde_json::Value::Array(arr) => { map.insert("embedding".into(), serde_json::Value::Array(arr)); }
                            serde_json::Value::Object(mut obj) => {
                                if let Some(inner) = obj.remove("embedding")
                                    .or_else(|| obj.remove("values"))
                                    .or_else(|| obj.remove("data"))
                                    .or_else(|| obj.remove("vector"))
                                { if inner.is_array() { map.insert("embedding".into(), inner); } }
                            }
                            _ => {}
                        }
                    } else if let Some(vectors_any) = map.get_mut("vectors") {
                        let chosen = match vectors_any {
                            serde_json::Value::Object(obj) => {
                                if let Some(v) = obj.remove("text") { Some(v) } else { obj.values().next().cloned() }
                            }
                            other => Some(other.clone()),
                        };
                        if let Some(val) = chosen {
                            match val {
                                serde_json::Value::Array(arr) => { map.insert("embedding".into(), serde_json::Value::Array(arr)); }
                                serde_json::Value::Object(mut obj) => {
                                    if let Some(inner) = obj.remove("embedding")
                                        .or_else(|| obj.remove("values"))
                                        .or_else(|| obj.remove("data"))
                                    { if inner.is_array() { map.insert("embedding".into(), inner); } }
                                }
                                _ => {}
                            }
                        }
                        map.remove("vectors");
                    }
                }
                if map.get("embedding").is_none() {
                    if let (Some(ic), Some(client)) = (index_cfg.as_ref(), embeddings_client_opt.as_ref()) {
                        if let Some(weighted) = index_config::build_weighted_texts(&serde_json::Value::Object(map.clone()), ic) {
                            let weighted_texts_json: Vec<serde_json::Value> = weighted.iter().map(|(t, w)| serde_json::json!({"text": t, "weight": w})).collect();
                            let hybrid = serde_json::json!({"texts": weighted_texts_json});
                            if let Ok(Some(vec)) = client.build_query_embedding(None, Some(&hybrid), ic.active_model.as_deref(), None).await {
                                map.insert("embedding".into(), serde_json::Value::Array(vec.into_iter().map(|f| serde_json::Value::from(f)).collect()));
                            }
                        }
                    }
                }
                // Flatten dynamic payload key/values into attributes_kv (Approach 1) BEFORE payload is stringified in feed layer
                if let Some(payload_val) = map.get("payload") {
                    if let serde_json::Value::Object(obj) = payload_val {
                        let mut tags: Vec<serde_json::Value> = Vec::new();
                        for (k, v) in obj.iter() {
                            match v {
                                serde_json::Value::String(s) => tags.push(serde_json::Value::String(format!("{}={}", k, s))),
                                serde_json::Value::Number(n) => tags.push(serde_json::Value::String(format!("{}={}", k, n))),
                                serde_json::Value::Bool(b) => tags.push(serde_json::Value::String(format!("{}={}", k, b))),
                                serde_json::Value::Array(arr) => {
                                    for item in arr.iter() {
                                        if let Some(s) = item.as_str() { tags.push(serde_json::Value::String(format!("{}={}", k, s))); }
                                        else if let Some(num) = item.as_f64() { tags.push(serde_json::Value::String(format!("{}={}", k, num))); }
                                        else if let Some(bv) = item.as_bool() { tags.push(serde_json::Value::String(format!("{}={}", k, bv))); }
                                    }
                                }
                                _ => {}
                            }
                        }
                        if !tags.is_empty() { map.insert("attributes_kv".into(), serde_json::Value::Array(tags)); }
                    }
                }
                if let Some(media_val) = map.remove("media") {
                    if let serde_json::Value::Array(items) = media_val {
                        let mut images: Vec<serde_json::Value> = Vec::new();
                        let mut videos: Vec<serde_json::Value> = Vec::new();
                        for item in items.into_iter() {
                            if let serde_json::Value::Object(obj) = item {
                                if let Some(url) = obj.get("url").and_then(|v| v.as_str()) {
                                    let media_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or("IMAGE").to_uppercase();
                                    match media_type.as_str() { "VIDEO" => videos.push(serde_json::Value::String(url.to_string())), _ => images.push(serde_json::Value::String(url.to_string())), }
                                }
                            }
                        }
                        if !images.is_empty() { map.insert("media_images".into(), serde_json::Value::Array(images)); }
                        if !videos.is_empty() { map.insert("media_videos".into(), serde_json::Value::Array(videos)); }
                    }
                }
            } else { return Err(async_graphql::Error::new("all documents must be JSON objects")); }
            processed.push(doc);
        }
        // Chunk according to config
        let batch_size = cfg.feed_batch_size.max(1);
        use futures::stream::{self, StreamExt};
        let max_conc = cfg.feed_max_concurrency.max(1);
        let total = processed.len() as i32;
        // Materialize the chunks into owned Vec<Vec<Value>> first to avoid lifetime issues
        let batches: Vec<Vec<serde_json::Value>> = processed
            .chunks(batch_size)
            .map(|c| c.to_vec())
            .collect();
        let dest_cluster = cfg.content_cluster_id.clone();
    let failed_batches = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let failed_docs: std::sync::Arc<std::sync::Mutex<Vec<Vec<serde_json::Value>>>> = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let fb_clone = failed_docs.clone();
        let fb_counter = failed_batches.clone();
        stream::iter(batches.into_iter().map(|chunk| {
            let vc = vespa.clone();
            let app = app_id.clone();
            let cluster = dest_cluster.clone();
            let fb = fb_clone.clone();
            async move {
                match vc.feed_documents_batch(&app, &cluster, chunk.clone(), cfg.feed_max_concurrency).await {
                    Ok(_) => Ok(()),
                    Err(e) => {
                        tracing::error!(target="bulk.upsert", error=%e, batch.size=chunk.len(), "batch failed");
                        if let Ok(mut guard) = fb.lock() { guard.push(chunk); }
                        Err(e)
                    }
                }
            }
        }))
        .buffer_unordered(max_conc)
        .for_each(move |res| {
            let fb = fb_counter.clone();
            async move {
                if res.is_err() { fb.fetch_add(1, std::sync::atomic::Ordering::Relaxed); }
            }
        })
        .await;

        let fb_count = failed_batches.load(std::sync::atomic::Ordering::Relaxed);
        if fb_count > 0 {
            // Clone failed chunks out of the mutex so we don't hold the lock across awaits
            let failed_chunks_vec: Vec<Vec<serde_json::Value>> = {
                let guard = failed_docs.lock().unwrap_or_else(|p| p.into_inner());
                guard.clone()
            };
            let failed_doc_total: usize = failed_chunks_vec.iter().map(|c| c.len()).sum();
            if cfg.bulk_fallback_single {
                tracing::warn!(failed.batches=fb_count, failed.docs=failed_doc_total, "retrying failed docs individually");
                for chunk in failed_chunks_vec.iter() {
                    for d in chunk.iter() {
                        if let Err(e) = vespa.feed_document(&app_id, d.clone()).await {
                            tracing::error!(target="bulk.upsert.fallback", error=%e, "single retry failed");
                        }
                    }
                }
            }
            if !cfg.bulk_allow_partial {
                return Err(async_graphql::Error::new(format!("bulk feed failed: {} batches ({} docs)", fb_count, failed_doc_total)));
            }
        }
        Ok(total - 0) // total docs attempted
    }

    // Generate and deploy a Vespa application package on the fly
    async fn deploy_app(&self, ctx: &Context<'_>, app_id: String, schema_json: serde_json::Value) -> async_graphql::Result<bool> {
        let cfg = ctx.data::<Config>()?.clone();
        let deploy = ctx.data::<crate::vespa::client::VespaDeployClient>()?;
        // Ensure we always inject our stable physical cluster id unless user explicitly requested a different one
        let mut merged = schema_json.clone();
        if !merged.get("cluster_id").and_then(|v| v.as_str()).is_some() {
            // Use configured stable cluster id to avoid content-cluster-removal validation
            if let serde_json::Value::Object(ref mut map) = merged { map.insert("cluster_id".to_string(), serde_json::Value::String(cfg.content_cluster_id.clone())); }
        }
        let pkg = crate::indexer::app_package::AppPackage::from_dynamic_json(&app_id, &cfg.schema_version, merged)?;
        deploy.deploy_package(&pkg).await?;

    // (Embeddings index config side effect handled inside AppPackage generation now.)
        Ok(true)
    }
}
