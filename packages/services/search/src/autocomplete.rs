use redis::{aio::ConnectionManager, Value, FromRedisValue};

#[derive(Clone)]
pub struct AutocompleteClient {
    conn: ConnectionManager,
}

impl AutocompleteClient {
    pub async fn new(redis_url: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let conn = client.get_connection_manager().await?;
        Ok(Self { conn })
    }

    fn dict_key(tenant: &str, field: &str) -> String {
        format!("ac:dict:{}:{}", tenant, field)
    }

    pub async fn get_suggestions(&self, tenant: &str, field: &str, prefix: &str, limit: usize, fuzzy: bool) -> anyhow::Result<Vec<AutocompleteHit>> {
        let mut cmd = redis::cmd("FT.SUGGET");
        cmd.arg(Self::dict_key(tenant, field))
            .arg(prefix)
            .arg("WITHSCORES")
            .arg("WITHPAYLOADS")
            .arg("MAX")
            .arg(limit * 10); // fetch extra for dedup/filtering
        if fuzzy { cmd.arg("FUZZY"); }
        let mut conn = self.conn.clone();
        let val: Value = cmd.query_async(&mut conn).await?;
        let mut out = Vec::new();
        if let Value::Bulk(items) = val {
            let mut i = 0;
            while i + 2 < items.len() {
                let term: String = FromRedisValue::from_redis_value(&items[i])?;
                let score: f64 = FromRedisValue::from_redis_value(&items[i+1])?;
                let payload: Option<String> = match &items[i+2] { Value::Nil => None, v => Some(FromRedisValue::from_redis_value(v)?), };
                let mut hit = AutocompleteHit { term, score, display: None, alias_group_id: None, is_canonical: false };
                if let Some(p) = payload.as_ref() {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(p) {
                        hit.display = json.get("text").and_then(|v| v.as_str()).map(|s| s.to_string());
                        hit.alias_group_id = json.get("alias_group_id").and_then(|v| v.as_str()).map(|s| s.to_string());
                        hit.is_canonical = json.get("is_canonical").and_then(|v| v.as_bool()).unwrap_or(false);
                    }
                }
                out.push(hit);
                i += 3;
            }
        }
        // Dedup by alias_group_id if present
        use std::collections::HashMap;
        let mut best_by_group: HashMap<String, AutocompleteHit> = HashMap::new();
        let mut independents: Vec<AutocompleteHit> = Vec::new();
        for mut h in out.into_iter() {
            // small canonical boost on the fly
            if h.is_canonical { h.score *= 1.2; }
            if let Some(g) = h.alias_group_id.clone() {
                let replace = match best_by_group.get(&g) {
                    None => true,
                    Some(prev) => h.score > prev.score,
                };
                if replace { best_by_group.insert(g, h); }
            } else {
                independents.push(h);
            }
        }
        let mut merged: Vec<AutocompleteHit> = best_by_group.into_values().collect();
        merged.extend(independents.into_iter());
        // Sort by score desc and truncate
        merged.sort_by(|a,b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        merged.truncate(limit);
        Ok(merged)
    }
}

#[derive(Clone, Debug)]
pub struct AutocompleteHit {
    pub term: String,
    pub display: Option<String>,
    pub score: f64,
    pub alias_group_id: Option<String>,
    pub is_canonical: bool,
}
