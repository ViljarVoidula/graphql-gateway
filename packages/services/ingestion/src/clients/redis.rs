use redis::aio::ConnectionManager;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use crate::models::*;

#[derive(Clone)]
pub struct RedisClient {
    conn: ConnectionManager,
    supports_redisearch: Arc<AtomicBool>,
}

impl RedisClient {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)
            .map_err(|e| IngestionError::Configuration(format!("Invalid Redis URL: {}", e)))?;
        
        let conn = client.get_connection_manager().await?;
        let supports_redisearch = Arc::new(AtomicBool::new(true));
        Ok(Self { conn, supports_redisearch })
    }

    pub async fn add_autocomplete_terms(&self, field_key: &str, terms: &[String]) -> Result<()> {
        // If RediSearch is not supported, use fallback immediately
        if !self.supports_redisearch.load(Ordering::Relaxed) {
            return self.add_autocomplete_terms_fallback(field_key, terms).await;
        }

        let mut conn = self.conn.clone();
        // Try RediSearch FT.SUGADD; on unknown command, flip flag and fallback
        for term in terms {
            let score = self.calculate_term_score(term);
            let payload = serde_json::json!({
                "text": term,
                "is_canonical": true,
                "source": "ingestion"
            }).to_string();
            let res: std::result::Result<i32, redis::RedisError> = redis::cmd("FT.SUGADD")
                .arg(field_key)
                .arg(term)
                .arg(score)
                .arg("PAYLOAD")
                .arg(&payload)
                .query_async(&mut conn)
                .await;
            if let Err(e) = res {
                let msg = e.to_string();
                if msg.contains("unknown command") && msg.contains("FT.SUGADD") {
                    // Switch to fallback mode and retry all terms via fallback
                    self.supports_redisearch.store(false, Ordering::Relaxed);
                    tracing::warn!(key = field_key, "RediSearch not available; falling back to ZSET-based autocomplete");
                    return self.add_autocomplete_terms_fallback(field_key, terms).await;
                } else {
                    return Err(IngestionError::Redis(e));
                }
            }
        }

        tracing::debug!(
            field_key = field_key,
            term_count = terms.len(),
            "Added autocomplete terms"
        );

        Ok(())
    }

    pub async fn remove_autocomplete_terms(&self, field_key: &str, terms: &[String]) -> Result<()> {
        if !self.supports_redisearch.load(Ordering::Relaxed) {
            return self.remove_autocomplete_terms_fallback(field_key, terms).await;
        }

        let mut conn = self.conn.clone();
        for term in terms {
            let res: std::result::Result<bool, redis::RedisError> = redis::cmd("FT.SUGDEL")
                .arg(field_key)
                .arg(term)
                .query_async(&mut conn)
                .await;
            if let Err(e) = res {
                let msg = e.to_string();
                if msg.contains("unknown command") && msg.contains("FT.SUGDEL") {
                    self.supports_redisearch.store(false, Ordering::Relaxed);
                    tracing::warn!(key = field_key, "RediSearch not available; removing via fallback store");
                    return self.remove_autocomplete_terms_fallback(field_key, terms).await;
                } else {
                    return Err(IngestionError::Redis(e));
                }
            }
        }

        tracing::debug!(
            field_key = field_key,
            term_count = terms.len(),
            "Removed autocomplete terms"
        );

        Ok(())
    }

    fn calculate_term_score(&self, term: &str) -> f64 {
        // Simple scoring based on term length and frequency patterns
        // In a real implementation, this might use actual usage statistics
        let base_score = 1.0;
        let length_factor = (term.len() as f64 / 10.0).min(2.0); // Favor longer terms up to a point
        base_score + length_factor
    }

    // Fallback storage using ZSET and HASH per field_key
    // Keys: ZSET at fallback_z:{field_key}, HASH at fallback_p:{field_key}
    async fn add_autocomplete_terms_fallback(&self, field_key: &str, terms: &[String]) -> Result<()> {
        let zkey = format!("fallback_z:{}", field_key);
        let pkey = format!("fallback_p:{}", field_key);
        let mut pipe = redis::pipe();
        pipe.atomic();
        for term in terms {
            let score = self.calculate_term_score(term);
            let payload = serde_json::json!({
                "text": term,
                "is_canonical": true,
                "source": "ingestion"
            }).to_string();
            pipe.cmd("ZADD").arg(&zkey).arg(score).arg(term).ignore();
            pipe.cmd("HSET").arg(&pkey).arg(term).arg(&payload).ignore();
        }
        let mut conn = self.conn.clone();
    pipe.query_async::<_, ()>(&mut conn).await.map_err(IngestionError::Redis)?;
        tracing::debug!(field_key = field_key, term_count = terms.len(), "Added autocomplete terms (fallback)");
        Ok(())
    }

    async fn remove_autocomplete_terms_fallback(&self, field_key: &str, terms: &[String]) -> Result<()> {
        let zkey = format!("fallback_z:{}", field_key);
        let pkey = format!("fallback_p:{}", field_key);
        let mut pipe = redis::pipe();
        pipe.atomic();
        for term in terms {
            pipe.cmd("ZREM").arg(&zkey).arg(term).ignore();
            pipe.cmd("HDEL").arg(&pkey).arg(term).ignore();
        }
        let mut conn = self.conn.clone();
    pipe.query_async::<_, ()>(&mut conn).await.map_err(IngestionError::Redis)?;
        tracing::debug!(field_key = field_key, term_count = terms.len(), "Removed autocomplete terms (fallback)");
        Ok(())
    }
}
