use async_trait::async_trait;
use mongodb::Database;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Represents a single migration that can be applied or rolled back
#[async_trait]
pub trait Migration: Send + Sync {
    /// Unique version number for this migration
    fn version(&self) -> u32;
    
    /// Human-readable description of what this migration does
    fn description(&self) -> &str;
    
    /// Apply the migration (forward)
    async fn up(&self, db: &Database) -> Result<()>;
    
    /// Rollback the migration (backward)
    async fn down(&self, db: &Database) -> Result<()>;
    
    /// Optional: Validate that the migration can be safely applied
    async fn validate(&self, _db: &Database) -> Result<()> {
        Ok(())
    }
    
    /// Optional: Estimate the time this migration might take
    fn estimated_duration(&self) -> Option<std::time::Duration> {
        None
    }
    
    /// Optional: Whether this migration requires a backup before running
    fn requires_backup(&self) -> bool {
        false
    }
}

/// Migration execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationResult {
    pub version: u32,
    pub description: String,
    pub executed_at: DateTime<Utc>,
    pub duration_ms: u64,
    pub success: bool,
    pub error_message: Option<String>,
}

/// Migration execution options
#[derive(Debug, Clone)]
pub struct MigrationOptions {
    pub dry_run: bool,
    pub force: bool,
    pub backup_before: bool,
    pub chunk_size: Option<usize>,
    pub timeout: Option<std::time::Duration>,
}

impl Default for MigrationOptions {
    fn default() -> Self {
        Self {
            dry_run: false,
            force: false,
            backup_before: false,
            chunk_size: Some(1000),
            timeout: Some(std::time::Duration::from_secs(300)), // 5 minutes
        }
    }
}

/// Migration status
#[derive(Debug, Clone, PartialEq)]
pub enum MigrationStatus {
    Pending,
    Applied,
    Failed,
    RolledBack,
}

impl MigrationResult {
    /// Create a successful migration result
    pub fn success(
        version: u32,
        description: String,
        executed_at: DateTime<Utc>,
        duration_ms: u64,
    ) -> Self {
        Self {
            version,
            description,
            executed_at,
            duration_ms,
            success: true,
            error_message: None,
        }
    }

    /// Create a failed migration result
    pub fn failure(
        version: u32,
        description: String,
        executed_at: DateTime<Utc>,
        duration_ms: u64,
        error: String,
    ) -> Self {
        Self {
            version,
            description,
            executed_at,
            duration_ms,
            success: false,
            error_message: Some(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_migration_result_success() {
        let now = Utc::now();
        let result = MigrationResult::success(1, "Test migration".to_string(), now, 100);
        
        assert_eq!(result.version, 1);
        assert_eq!(result.description, "Test migration");
        assert_eq!(result.duration_ms, 100);
        assert!(result.success);
        assert!(result.error_message.is_none());
    }

    #[test]
    fn test_migration_result_failure() {
        let now = Utc::now();
        let result = MigrationResult::failure(
            1, 
            "Test migration".to_string(), 
            now, 
            50, 
            "Something went wrong".to_string()
        );
        
        assert_eq!(result.version, 1);
        assert_eq!(result.description, "Test migration");
        assert_eq!(result.duration_ms, 50);
        assert!(!result.success);
        assert_eq!(result.error_message, Some("Something went wrong".to_string()));
    }

    #[test]
    fn test_migration_options_default() {
        let options = MigrationOptions::default();
        
        assert!(!options.dry_run);
        assert!(!options.force);
        assert!(!options.backup_before);
        assert_eq!(options.chunk_size, Some(1000));
        assert_eq!(options.timeout, Some(std::time::Duration::from_secs(300)));
    }
}
