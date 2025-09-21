use serde_json::Value;
use std::collections::{HashSet, HashMap};
use regex::Regex;

use crate::{error::{Result, SearchError}, models::*};

pub fn map_search_response(input: SearchInput, vespa: Value, elapsed_ms: i32) -> Result<SearchResponse> {
    let root = vespa.as_object().ok_or_else(|| SearchError::Vespa("invalid vespa response".into()))?;
    let children = root.get("root").and_then(|r| r.get("children")).and_then(|c| c.as_array()).cloned().unwrap_or_default();

    let mut results: Vec<ProductResult> = vec![];
    for h in children.iter() {
        // Skip grouping nodes (usually have id == "group")
        let is_group = h.get("id").and_then(|v| v.as_str()).map(|s| s == "group" || s.starts_with("grouplist")).unwrap_or(false);
        if is_group { continue; }
        if let Some(fields) = h.get("fields") {
            let id = fields.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let name = fields.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
            let brand = fields.get("brand").and_then(|v| v.as_str()).map(|s| s.to_string());
            let description_en = fields.get("description_en").and_then(|v| v.as_str()).map(|s| s.to_string());
            let price = fields.get("price").and_then(|v| v.as_f64()).map(|f| f as f32);
            let image = fields.get("image").and_then(|v| v.as_str()).map(|s| s.to_string());
            let score = h.get("relevance").and_then(|v| v.as_f64()).map(|f| f as f32);
            // Parse payload string into JSON if stored as stringified JSON in index
            let payload = match fields.get("payload") {
                Some(Value::String(s)) => {
                    match serde_json::from_str::<Value>(s) { Ok(v) => Some(v), Err(_) => Some(Value::String(s.clone())) }
                }
                Some(other) => Some(other.clone()),
                None => None,
            };
            // Apply payload.__select pruning if filters requested it
            let mut payload = payload;
            if let Some(filters_obj) = input.filters.as_ref().and_then(|f| f.as_object()) {
                if let Some(payload_filter) = filters_obj.get("payload") {
                    if let Some(pf_obj) = payload_filter.as_object() {
                        if let Some(sel) = pf_obj.get("__select").and_then(|v| v.as_array()) {
                            let allowed: std::collections::HashSet<String> = sel.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect();
                            if !allowed.is_empty() {
                                if let Some(Value::Object(mut pmap)) = payload.clone() {
                                    pmap.retain(|k,_| allowed.contains(k));
                                    payload = Some(Value::Object(pmap));
                                }
                            }
                        }
                    }
                }
            }
            let views = fields.get("views").and_then(|v| v.as_i64()).map(|v| v as i32);
            let popularity = fields.get("popularity").and_then(|v| v.as_f64()).map(|f| f as f32);
            let priority = fields.get("priority").and_then(|v| v.as_i64()).map(|v| v as i32);
            let categories = fields.get("categories").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect::<Vec<_>>());
            let category_path = categories.as_ref().and_then(|c| c.first()).cloned(); // placeholder: first category as path
            let breadcrumbs = category_path.as_ref().map(|path| {
                path.split('>').enumerate().map(|(i, seg)| Taxon { name: seg.to_string(), path: path.split('>').take(i+1).collect::<Vec<_>>().join(">"), level: i as i32 }).collect()
            });
            let media_images = fields.get("media_images").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect::<Vec<_>>()).unwrap_or_default();
            let media_videos = fields.get("media_videos").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect::<Vec<_>>()).unwrap_or_default();
            let mut media: Vec<MediaItem> = vec![];
            for (idx, url) in media_images.iter().enumerate() { media.push(MediaItem { id: format!("img{}", idx), url: url.clone(), r#type: "IMAGE".into(), hash: format!("{:x}", md5::compute(url)) }); }
            for (idx, url) in media_videos.iter().enumerate() { media.push(MediaItem { id: format!("vid{}", idx), url: url.clone(), r#type: "VIDEO".into(), hash: format!("{:x}", md5::compute(url)) }); }
            let media = if media.is_empty() { None } else { Some(media) };
            let variations_raw = fields.get("variations").and_then(|v| v.as_str());
            let variations = variations_raw.and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok()).and_then(|val| val.as_array().map(|arr| {
                arr.iter().map(|item| {
                    // Attempt to parse variation payload if it's a stringified JSON
                    let var_payload = match item.get("payload") {
                        Some(Value::String(ps)) => serde_json::from_str::<Value>(ps).unwrap_or(Value::String(ps.clone())),
                        Some(v) => v.clone(),
                        None => Value::Null,
                    };
                    VariationResult {
                        id: item.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        sku: item.get("sku").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        name: item.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        price: item.get("price").and_then(|v| v.as_f64()).map(|f| f as f32),
                        price_discounted: item.get("price_discounted").and_then(|v| v.as_f64()).map(|f| f as f32),
                        image: item.get("image").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        payload: if var_payload.is_null() { None } else { Some(var_payload) },
                    }
                }).collect::<Vec<_>>()
            }));

            // Vector feature extraction: when ranking.listFeatures=true, Vespa returns summaryfeatures map.
            // We look for common distance feature keys. Vespa naming usually resembles
            // 'distance(product.embedding, query_vector)' or 'closeness(name)'. We'll normalize to a pseudo vector score.
            let mut vector_component: Option<f32> = None;
            let mut lexical_component: Option<f32> = None;
            if let Some(feats) = h.get("summaryfeatures").and_then(|v| v.as_object()) {
                // NOTE: This relies on ranking.listFeatures=true being set for Vector/Hybrid modes in query builder.
                // If future rank-profiles rename the feature key, extend the matching logic below.
                // Try direct distance(...) key first
                if let Some(dist_val) = feats.get("distance(product.embedding,query_vector)").or_else(|| feats.get("distance(product.embedding, query_vector)")) {
                    if let Some(d) = dist_val.as_f64() { vector_component = Some(d as f32); }
                } else {
                    // Fallback: search any key containing 'distance' & 'query_vector'
                    for (k,vv) in feats.iter() {
                        if k.contains("distance") && k.contains("query_vector") { if let Some(d) = vv.as_f64() { vector_component = Some(d as f32); break; } }
                    }
                }
            }
            // Convert distance to similarity (simple 1/(1+d)) if present
            if lexical_component.is_none() {
                if let Some(feats) = h.get("summaryfeatures").and_then(|v| v.as_object()) {
                    if let Some(nr) = feats.get("nativeRank(name)").and_then(|v| v.as_f64()) { lexical_component = Some(nr as f32); }
                }
            }
            let vector_similarity = vector_component.map(|d| 1.0_f32 / (1.0_f32 + d));
            let score_breakdown = if score.is_some() || vector_similarity.is_some() || lexical_component.is_some() {
                Some(ScoreBreakdown { lexical: lexical_component, vector: vector_similarity, recency: None, popularity: None, boosts: None, final_score: score })
            } else { None };
            results.push(ProductResult {
                id,
                name,
                brand,
                description_en,
                price,
                price_discounted: None,
                image,
                url: None,
                payload,
                views,
                popularity,
                priority,
                category_path,
                breadcrumbs,
                parent_id: None,
                is_parent: None,
                selected_variant_id: None,
                variations,
                media,
                categories,
                distance_meters: None,
                score,
                score_breakdown,
                highlights: None,
            });
        }
    }

    // pagination and meta
    let total = root.get("root").and_then(|r| r.get("fields")).and_then(|f| f.get("totalCount")).and_then(|v| v.as_i64()).unwrap_or(results.len() as i64) as i32;
    let limit = input.pagination.as_ref().and_then(|p| p.limit).unwrap_or(20);
    let offset = input.pagination.as_ref().and_then(|p| p.offset).unwrap_or(0);

    let pagination = PaginationResponse { has_more: (offset + limit) < total, total, offset, limit, cursor: None, next_cursor: None };
    let meta = SearchMeta { query: input.query.clone(), execution_time: elapsed_ms, total_results: total, language: input.language.clone().unwrap_or_else(|| "en".into()) };

    // Lookup facet config by field for type-aware mapping
    let mut facet_type_lookup: HashMap<String, FacetType> = HashMap::new();
    let mut facet_config_lookup: HashMap<String, FacetConfig> = HashMap::new();
    if let Some(cfgs) = input.facets.as_ref() {
        for fc in cfgs.iter() {
            facet_type_lookup.insert(fc.field.clone(), fc.r#type.clone());
            facet_config_lookup.insert(fc.field.clone(), fc.clone());
        }
    }

    // Pre-compute requested range facet fields (authoritative over heuristics)
    let mut requested_range: HashSet<String> = HashSet::new();
    if let Some(req) = input.facets.as_ref() {
        for fc in req.iter() { if matches!(fc.r#type, crate::models::FacetType::Range) { requested_range.insert(fc.field.clone()); } }
    }

    // Extract filters object for selection detection
    let filters_obj = input.filters.as_ref().and_then(|f| f.as_object());

    // Facets mapping (parse Vespa grouping from root.children)
    let mut facets: Vec<crate::models::FacetResultUnion> = vec![];
    // Helper: recursively collect grouplist nodes
    fn collect_group_lists<'a>(node: &'a Value, out: &mut Vec<&'a Value>) {
        if let Some(id) = node.get("id").and_then(|v| v.as_str()) {
            if id.starts_with("grouplist:") || id.starts_with("group:predefined(") || id.contains("predefined(") {
                out.push(node);
            }
        }
        if let Some(children) = node.get("children").and_then(|c| c.as_array()) {
            for ch in children { collect_group_lists(ch, out); }
        }
    }
    let mut all_group_lists: Vec<&Value> = vec![];
    collect_group_lists(root.get("root").unwrap_or(&vespa), &mut all_group_lists);
    for list_node in all_group_lists.iter() {
        // Derive facet field from the grouplist node itself
        let mut field = list_node.get("label").and_then(|v| v.as_str()).map(|s| s.to_string())
            .or_else(|| list_node.get("id").and_then(|v| v.as_str()).and_then(|s| s.strip_prefix("grouplist:").map(|x| x.to_string())))
            .or_else(|| list_node.get("id").and_then(|v| v.as_str()).and_then(|s| {
                // id may look like group:predefined(price, bucket(...))
                if let Some(start) = s.find("predefined(") { let rest = &s[start + "predefined(".len()..]; if let Some(end) = rest.find(')') { let inside=&rest[..end]; return inside.split(',').next().map(|x| x.trim().to_string()); }
                }
                None
            }))
            .unwrap_or_default();
        if field.ends_with("_facet") { field = field.trim_end_matches("_facet").to_string(); }
        // Reverse alias sanitization: attempt to map underscore form back to dotted original
        if facet_config_lookup.get(&field).is_none() {
            let dotted = field.replace('_', ".");
            if facet_config_lookup.get(&dotted).is_some() { field = dotted; } else {
                if let Some((orig, _)) = facet_config_lookup.iter().find(|(k, _)| k.replace('.', "_") == field) { field = orig.clone(); }
            }
        }
        if field.is_empty() { continue; }
    // Label: prefer config label override if present
    let label = facet_config_lookup.get(&field).and_then(|fc| fc.label.clone()).unwrap_or_else(|| field.clone());
        let groups = list_node.get("children").and_then(|c| c.as_array()).cloned().unwrap_or_default();
        if groups.is_empty() {
            // If user requested a range facet for this field but Vespa returned no children, seed from config immediately
            if requested_range.contains(&field) {
                if let Some(req_facets) = input.facets.as_ref() {
                    if let Some(cfg) = req_facets.iter().find(|fc| fc.field == field) {
                        if let Some(rng_cfg) = cfg.range.as_ref() { if let Some(ranges) = rng_cfg.ranges.as_ref() {
                            let mut buckets = Vec::new();
                            for r in ranges { buckets.push(crate::models::RangeBucket { min: r.min, max: r.max, count: 0, selected: false, label: r.label.clone() }); }
                            facets.push(crate::models::FacetResultUnion::Range(crate::models::RangeFacetResult { field: field.clone(), label: label.clone(), min: None, max: None, buckets: Some(buckets), has_selection: false }));
                            continue; // processed this facet
                        }}
                    }
                }
            }
            continue;
        }
        let bucket_re = Regex::new(r"bucket\(([-0-9\.]+) *, *([-0-9\.]+)\)").ok();
        let looks_range = requested_range.contains(&field) || groups.iter().all(|g| {
            g.get("value").and_then(|x| x.as_str()).map(|s| bucket_re.as_ref().map(|r| r.is_match(s)).unwrap_or(false)).unwrap_or(false)
        });
        if looks_range {
            let mut buckets = vec![];
            // Build map of (min,max)->label from requested config (if any)
            let mut label_lookup: Vec<(f32,f32,String)> = Vec::new();
            if let Some(req_facets) = input.facets.as_ref() {
                if let Some(cfg) = req_facets.iter().find(|fc| fc.field == field) {
                    if let Some(rng_cfg) = cfg.range.as_ref() {
                        if let Some(ranges) = rng_cfg.ranges.as_ref() {
                            for r in ranges {
                                if let Some(lbl) = r.label.as_ref() { label_lookup.push((r.min, r.max, lbl.clone())); }
                            }
                        }
                    }
                }
            }
            for g in groups.iter() {
                tracing::debug!(target:"facet_map_raw_child", parent=%field, raw_child=%g);
                // Prefer explicit value, else fall back to id (e.g. group:bucket(0, 50))
                let raw_val = g.get("value").and_then(|x| x.as_str())
                    .or_else(|| g.get("id").and_then(|v| v.as_str()).and_then(|s| s.split_once(':').map(|(_, r)| r)));
                if let Some(raw) = raw_val { if let Some(re) = &bucket_re { if let Some(caps) = re.captures(raw) {
                    if let (Some(a), Some(b)) = (
                        caps.get(1).and_then(|m| m.as_str().parse::<f32>().ok()),
                        caps.get(2).and_then(|m| m.as_str().parse::<f32>().ok())
                    ) {
                        let count_val = g.get("count")
                            .or_else(|| g.get("fields").and_then(|f| f.get("count()")))
                            .or_else(|| g.get("fields").and_then(|f| f.get("count")));
                        let count = count_val.and_then(|x| x.as_i64()).unwrap_or(0) as i32;
                        let label = label_lookup.iter().find(|(mi,ma,_)| (*mi - a).abs() < f32::EPSILON && (*ma - b).abs() < f32::EPSILON).map(|(_,_,l)| l.clone());
                        buckets.push(crate::models::RangeBucket { min: a, max: b, count, selected: false, label });
                        continue;
                    }
                }}}
                // Alternative from/to fields
                if let Some(fobj) = g.get("fields") { if let (Some(a), Some(b)) = (fobj.get("from").and_then(|x| x.as_f64()), fobj.get("to").and_then(|x| x.as_f64())) {
                    let count = fobj.get("count()")
                        .and_then(|x| x.as_i64())
                        .or_else(|| fobj.get("count").and_then(|x| x.as_i64()))
                        .unwrap_or(0) as i32;
                    let label = label_lookup.iter().find(|(mi,ma,_)| (*mi - a as f32).abs() < f32::EPSILON && (*ma - b as f32).abs() < f32::EPSILON).map(|(_,_,l)| l.clone());
                    buckets.push(crate::models::RangeBucket { min: a as f32, max: b as f32, count, selected: false, label });
                }}
            }
            if !buckets.is_empty() {
                if let Some(req) = input.facets.as_ref() { if !req.iter().any(|fc| fc.field == field) { continue; } }
                tracing::debug!(target:"facet_map", facet_field=%field, kind="range", bucket_count=buckets.len());
                // Determine selection from filters
                let mut has_sel = false;
                if let Some(fobj) = filters_obj.and_then(|fo| fo.get(&field)) {
                    if let Some(o) = fobj.as_object() {
                        let gte = o.get("__gte").and_then(|v| v.as_f64()).map(|f| f as f32);
                        let lte = o.get("__lte").and_then(|v| v.as_f64()).map(|f| f as f32);
                        if gte.is_some() || lte.is_some() {
                            for b in buckets.iter_mut() {
                                let lower_ok = gte.map(|g| b.min >= g).unwrap_or(true);
                                let upper_ok = lte.map(|l| b.max <= l).unwrap_or(true);
                                if lower_ok && upper_ok { b.selected = true; has_sel = true; }
                            }
                        }
                    }
                }
                facets.push(crate::models::FacetResultUnion::Range(crate::models::RangeFacetResult { field, label, min: None, max: None, buckets: Some(buckets), has_selection: has_sel }));
            } else if requested_range.contains(&field) {
                if let Some(req_facets) = input.facets.as_ref() {
                    if let Some(cfg) = req_facets.iter().find(|fc| fc.field == field) {
                        if let Some(rng_cfg) = cfg.range.as_ref() {
                            if let Some(ranges) = rng_cfg.ranges.as_ref() {
                                let mut buckets: Vec<crate::models::RangeBucket> = Vec::new();
                                for r in ranges { buckets.push(crate::models::RangeBucket { min: r.min, max: r.max, count: 0, selected: false, label: r.label.clone() }); }
                                tracing::warn!(target:"facet_map", facet_field=%field, kind="range_fallback_seeded", bucket_count=buckets.len(), msg="Seeded empty buckets");
                                facets.push(crate::models::FacetResultUnion::Range(crate::models::RangeFacetResult { field, label, min: None, max: None, buckets: Some(buckets), has_selection: false }));
                                continue;
                            }
                        }
                    }
                }
            }
        } else {
            // Categorical / Boolean facet
            let mut values = vec![];
            for g in groups.iter() {
                tracing::debug!(target:"facet_map_raw_child", parent=%field, raw_child=%g);
                let raw_val = g.get("value")
                    .and_then(|x| x.as_str())
                    .or_else(|| g.get("fields").and_then(|f| f.get("value")).and_then(|x| x.as_str()))
                    .or_else(|| g.get("label").and_then(|x| x.as_str()))
                    .unwrap_or("");
                let count_val = g.get("count")
                    .or_else(|| g.get("fields").and_then(|f| f.get("count()")))
                    .or_else(|| g.get("fields").and_then(|f| f.get("count")));
                let count = count_val.and_then(|x| x.as_i64()).unwrap_or(0) as i32;
                values.push(crate::models::FacetValue { value: raw_val.to_string(), count, selected: false });
            }
            if !values.is_empty() {
                if let Some(req) = input.facets.as_ref() { if !req.iter().any(|fc| fc.field == field) { continue; } }
                // If this logical facet was on payload.<key>, filter and transform key=value tokens from attributes_kv
                if field.starts_with("payload.") {
                    if let Some(stripped) = field.strip_prefix("payload.") {
                        let mut filtered: Vec<crate::models::FacetValue> = Vec::new();
                        for v in values.into_iter() {
                            if let Some(eq_idx) = v.value.find('=') {
                                let (k, val) = v.value.split_at(eq_idx);
                                if k == stripped {
                                    let actual_val = &val[1..]; // skip '='
                                    filtered.push(crate::models::FacetValue { value: actual_val.to_string(), count: v.count, selected: false });
                                }
                            }
                        }
                        values = filtered;
                    }
                }
                // Determine facet type (Boolean vs Categorical)
                // Determine selection from filters for categorical/boolean
                let mut has_sel = false;
                if let Some(fv) = filters_obj.and_then(|fo| fo.get(&field)) {
                    if fv.is_string() {
                        let target = fv.as_str().unwrap();
                        for val in values.iter_mut() { if val.value == target { val.selected = true; has_sel = true; } }
                    } else if let Some(arr) = fv.as_array() { // implicit IN
                        for val in values.iter_mut() { if arr.iter().any(|x| x.as_str() == Some(&val.value)) { val.selected = true; has_sel = true; } }
                    } else if let Some(obj) = fv.as_object() { // {__in:[..]}
                        if let Some(list) = obj.get("__in").and_then(|v| v.as_array()) {
                            for val in values.iter_mut() { if list.iter().any(|x| x.as_str() == Some(&val.value)) { val.selected = true; has_sel = true; } }
                        }
                    }
                }
                match facet_type_lookup.get(&field) {
                    Some(FacetType::Boolean) => {
                        tracing::debug!(target:"facet_map", facet_field=%field, kind="boolean", value_count=values.len(), has_selection=%has_sel);
                        facets.push(crate::models::FacetResultUnion::Boolean(crate::models::BooleanFacetResult { field, label, values, has_selection: has_sel }));
                    }
                    _ => {
                        tracing::debug!(target:"facet_map", facet_field=%field, kind="categorical", value_count=values.len(), has_selection=%has_sel);
                        facets.push(crate::models::FacetResultUnion::Categorical(crate::models::CategoricalFacetResult { field, label, values, has_selection: has_sel }));
                    }
                }
            }
        }
    }

    // Build hierarchy facets (service-side) for any configured Hierarchy facet not already present.
    if let Some(cfgs) = input.facets.as_ref() {
        for fc in cfgs.iter().filter(|f| matches!(f.r#type, FacetType::Hierarchy)) {
            if facets.iter().any(|fct| match fct { FacetResultUnion::Hierarchy(h) => h.field == fc.field, _ => false }) { continue; }
            // Generic tree nodes
            #[derive(Default)]
            struct HierNode { count: i32, children: HashMap<String, HierNode> }
            let mut root_map: HashMap<String, HierNode> = HashMap::new();
            let separator = ">"; // TODO: read from fc.hierarchy options when implemented
            for r in results.iter() {
                if let Some(path) = r.category_path.as_ref() {
                    let parts: Vec<&str> = path.split(separator).filter(|s| !s.is_empty()).collect();
                    if parts.is_empty() { continue; }
                    let mut cursor = &mut root_map;
                    for part in parts.iter() {
                        let entry = cursor.entry((*part).to_string()).or_insert_with(HierNode::default);
                        entry.count += 1;
                        cursor = &mut entry.children;
                    }
                }
            }
            fn build_nodes(map: &HashMap<String, HierNode>, level: i32, prefix: &str, out: &mut Vec<HierarchyNode>) {
                for (name, node) in map.iter() {
                    let path = if prefix.is_empty() { name.clone() } else { format!("{}>{}", prefix, name) };
                    let mut children_vec: Vec<HierarchyNode> = Vec::new();
                    if !node.children.is_empty() { build_nodes(&node.children, level + 1, &path, &mut children_vec); }
                    out.push(HierarchyNode { value: name.clone(), count: node.count, level, path, selected: false, children: if children_vec.is_empty() { None } else { Some(children_vec) } });
                }
            }
            let mut top_nodes: Vec<HierarchyNode> = Vec::new();
            build_nodes(&root_map, 0, "", &mut top_nodes);
            if !top_nodes.is_empty() {
                // Future: detect selectedPath from taxonomy options
                facets.push(FacetResultUnion::Hierarchy(HierarchyFacetResult { field: fc.field.clone(), label: fc.label.clone().unwrap_or_else(|| fc.field.clone()), nodes: top_nodes, has_selection: false }));
            }
        }
    }

    // Suggestions retired from Vespa mapping; will be populated by Redis autocomplete in resolver.
    let suggestions = vec![];

    // Fallback: enrich range facet counts from result set if Vespa returned zeros
    if !facets.is_empty() {
        // Collect prices once
        let mut prices: Vec<f32> = Vec::new();
        for r in results.iter() { if let Some(p) = r.price { prices.push(p); } }
        if !prices.is_empty() {
            for facet in facets.iter_mut() {
                if let crate::models::FacetResultUnion::Range(rf) = facet {
                    if let Some(buckets) = rf.buckets.as_mut() {
                        if !buckets.is_empty() && buckets.iter().all(|b| b.count == 0) {
                            for b in buckets.iter_mut() {
                                b.count = prices.iter().filter(|p| **p >= b.min && **p < b.max).count() as i32;
                            }
                            tracing::warn!(target:"facet_map", facet_field=%rf.field, kind="range_postprocess_counts", note="Filled counts from results");
                        }
                    }
                }
            }
        }
    }

    Ok(SearchResponse { results, pagination, facets, suggestions, meta })
}
