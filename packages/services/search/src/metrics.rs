use std::sync::Mutex;
use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicU64, Ordering};

// Very lightweight histogram buckets (ms) for embedding latency
static EMBEDDING_LATENCY_BUCKETS: &[u64] = &[10, 25, 50, 75, 100, 150, 250, 400, 600, 1000, 1500, 2500];

#[derive(Default, Debug, Clone)]
pub struct Histogram { pub buckets: Vec<u64>, pub counts: Vec<u64>, pub sum: u128, pub total: u64 }

impl Histogram {
    pub fn new(buckets: &[u64]) -> Self { Self { buckets: buckets.to_vec(), counts: vec![0; buckets.len()+1], sum: 0, total: 0 } }
    pub fn record(&mut self, v_ms: u64) { self.total += 1; self.sum += v_ms as u128; for (i, b) in self.buckets.iter().enumerate() { if v_ms <= *b { self.counts[i]+=1; return; } } *self.counts.last_mut().unwrap() +=1; }
}

pub static EMBEDDING_LATENCY: Lazy<Mutex<Histogram>> = Lazy::new(|| Mutex::new(Histogram::new(EMBEDDING_LATENCY_BUCKETS)));

// Batch feed counters
pub static BATCH_DOC_SUCCESS: Lazy<AtomicU64> = Lazy::new(|| AtomicU64::new(0));
pub static BATCH_DOC_FAILURE: Lazy<AtomicU64> = Lazy::new(|| AtomicU64::new(0));
pub static BATCH_RETRIES: Lazy<AtomicU64> = Lazy::new(|| AtomicU64::new(0));
pub static BATCH_GIVEUPS: Lazy<AtomicU64> = Lazy::new(|| AtomicU64::new(0));

pub fn record_embedding_latency(ms: u64) { if let Ok(mut h) = EMBEDDING_LATENCY.lock() { h.record(ms); } }
pub fn record_batch_doc_success() { BATCH_DOC_SUCCESS.fetch_add(1, Ordering::Relaxed); }
pub fn record_batch_doc_failure() { BATCH_DOC_FAILURE.fetch_add(1, Ordering::Relaxed); }
pub fn record_batch_retry() { BATCH_RETRIES.fetch_add(1, Ordering::Relaxed); }
pub fn record_batch_giveup() { BATCH_GIVEUPS.fetch_add(1, Ordering::Relaxed); }

pub fn export_metrics_json() -> serde_json::Value {
    let h = EMBEDDING_LATENCY.lock().ok();
    serde_json::json!({
        "embedding_latency_ms": h.map(|hh| serde_json::json!({
            "buckets": hh.buckets,
            "counts": hh.counts,
            "sum_ms": hh.sum,
            "total": hh.total,
        })).unwrap_or(serde_json::json!(null)),
        "batch_feed": {
            "doc_success": BATCH_DOC_SUCCESS.load(Ordering::Relaxed),
            "doc_failure": BATCH_DOC_FAILURE.load(Ordering::Relaxed),
            "retries": BATCH_RETRIES.load(Ordering::Relaxed),
            "giveups": BATCH_GIVEUPS.load(Ordering::Relaxed)
        }
    })
}
