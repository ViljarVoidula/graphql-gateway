use std::time::Instant;
use mongodb::Database;
use anyhow::{Result, anyhow};
use chrono::Utc;

use crate::{
    Migration, MigrationOptions, MigrationResult, MigrationConfig,
    MigrationRegistry, VersionTracker, MigrationPlan, PlanType
};

/// Executes migrations against the database
pub struct MigrationRunner {
    database: Database,
    registry: MigrationRegistry,
    version_tracker: VersionTracker,
    config: MigrationConfig,
}

impl MigrationRunner {
    /// Create a new migration runner with default configuration
    pub fn new(database: Database, registry: MigrationRegistry) -> Self {
        let config = MigrationConfig::default();
        let version_tracker = VersionTracker::new(&database, &config);
        Self {
            database,
            registry,
            version_tracker,
            config,
        }
    }

    /// Create a new migration runner with custom configuration
    pub fn with_config(database: Database, registry: MigrationRegistry, config: MigrationConfig) -> Self {
        let version_tracker = VersionTracker::new(&database, &config);
        Self {
            database,
            registry,
            version_tracker,
            config,
        }
    }

    /// Create a builder for configuring the migration runner
    pub fn builder() -> MigrationRunnerBuilder {
        MigrationRunnerBuilder::new()
    }

    /// Initialize the migration system
    pub async fn initialize(&self) -> Result<()> {
        self.version_tracker.initialize().await?;
        self.registry.validate_sequence()?;
        tracing::info!("Migration system initialized for service '{}' with {} migrations", 
            self.config.service_name, self.registry.count());
        Ok(())
    }

    /// Run all pending migrations
    pub async fn migrate_up(&self, options: Option<MigrationOptions>) -> Result<Vec<MigrationResult>> {
        let options = options.unwrap_or_default();
        let plan = self.registry.get_migration_plan(&self.version_tracker, None).await?;
        
        if !plan.has_migrations() {
            tracing::info!("No pending migrations to apply for service '{}'", self.config.service_name);
            return Ok(Vec::new());
        }

        self.execute_plan(plan, options).await
    }

    /// Run migrations up to a specific version
    pub async fn migrate_to(&self, target_version: u32, options: Option<MigrationOptions>) -> Result<Vec<MigrationResult>> {
        let options = options.unwrap_or_default();
        let plan = self.registry.get_migration_plan(&self.version_tracker, Some(target_version)).await?;
        
        if !plan.has_migrations() {
            tracing::info!("No migrations needed to reach version {} for service '{}'", 
                target_version, self.config.service_name);
            return Ok(Vec::new());
        }

        self.execute_plan(plan, options).await
    }

    /// Rollback the last migration
    pub async fn rollback_one(&self, options: Option<MigrationOptions>) -> Result<Vec<MigrationResult>> {
        let current_version = self.version_tracker.get_latest_version().await?.unwrap_or(0);
        if current_version == 0 {
            return Err(anyhow!("No migrations to rollback for service '{}'", self.config.service_name));
        }

        let target_version = current_version - 1;
        self.rollback_to(target_version, options).await
    }

    /// Rollback to a specific version
    pub async fn rollback_to(&self, target_version: u32, options: Option<MigrationOptions>) -> Result<Vec<MigrationResult>> {
        let options = options.unwrap_or_default();
        let plan = self.registry.get_migration_plan(&self.version_tracker, Some(target_version)).await?;
        
        if !plan.has_migrations() {
            tracing::info!("No migrations to rollback to reach version {} for service '{}'", 
                target_version, self.config.service_name);
            return Ok(Vec::new());
        }

        if plan.plan_type != PlanType::Rollback {
            return Err(anyhow!("Expected rollback plan, got {:?}", plan.plan_type));
        }

        self.execute_plan(plan, options).await
    }

    /// Get migration status
    pub async fn status(&self) -> Result<MigrationRunnerStatus> {
        // Gather registry info
        let all_versions = self.registry.get_versions();
        let latest_available = all_versions.last().cloned().unwrap_or(0);

        // Use VersionTracker to get current status and statistics
        let current_version = self.version_tracker.get_latest_version().await?.unwrap_or(0);
        let stats = self.version_tracker.get_stats().await?;

        Ok(MigrationRunnerStatus {
            service_name: self.config.service_name.clone(),
            current_version,
            // compute pending by counting versions > current_version
            pending_count: all_versions.iter().filter(|&&v| v > current_version).count(),
            latest_available_version: latest_available,
            total_applied: stats.total_applied,
            total_rolled_back: stats.total_rolled_back,
            avg_duration_ms: stats.avg_duration_ms,
            total_duration_ms: stats.total_duration_ms,
        })
    }

    /// Get detailed migration plan without executing
    pub async fn plan(&self, target_version: Option<u32>) -> Result<MigrationPlan> {
        self.registry.get_migration_plan(&self.version_tracker, target_version).await
    }

    /// Execute a migration plan
    async fn execute_plan(&self, plan: MigrationPlan, options: MigrationOptions) -> Result<Vec<MigrationResult>> {
        tracing::info!("Executing migration plan for service '{}': {}", 
            self.config.service_name, plan.summary());
        
        if options.dry_run {
            tracing::info!("DRY RUN: Would execute {} migrations for service '{}'", 
                plan.migrations.len(), self.config.service_name);
            return Ok(Vec::new());
        }

        // Check if backup is required
        if plan.requires_backup() && options.backup_before {
            tracing::info!("Backup required for service '{}' but not implemented yet", self.config.service_name);
            // TODO: Implement backup functionality
        }

        let mut results = Vec::new();

        match plan.plan_type {
            PlanType::Forward => {
                for migration_info in &plan.migrations {
                    let migration = self.registry.get_migration(migration_info.version)
                        .ok_or_else(|| anyhow!("Migration {} not found in registry", migration_info.version))?;
                    
                    let result = self.execute_migration_up(migration, &options).await?;
                    results.push(result);
                }
            }
            PlanType::Rollback => {
                for migration_info in &plan.migrations {
                    let migration = self.registry.get_migration(migration_info.version)
                        .ok_or_else(|| anyhow!("Migration {} not found in registry", migration_info.version))?;
                    
                    let result = self.execute_migration_down(migration, &options).await?;
                    results.push(result);
                }
            }
            PlanType::NoOp => {
                tracing::info!("No migrations to execute for service '{}'", self.config.service_name);
            }
        }

        Ok(results)
    }

    /// Execute a single migration (up)
    async fn execute_migration_up(&self, migration: &dyn Migration, options: &MigrationOptions) -> Result<MigrationResult> {
        let version = migration.version();
        let description = migration.description().to_string();

        tracing::info!("Applying migration {} for service '{}': {}", 
            version, self.config.service_name, description);
        
        // Check if already applied
        if self.version_tracker.is_applied(version).await? && !options.force {
            return Err(anyhow!("Migration {} is already applied for service '{}'", 
                version, self.config.service_name));
        }

        // Validate migration
        if let Err(e) = migration.validate(&self.database).await {
            tracing::error!("Migration {} validation failed for service '{}': {}", 
                version, self.config.service_name, e);
            return Ok(MigrationResult::failure(
                version,
                description,
                Utc::now(),
                0,
                format!("Validation failed: {}", e),
            ));
        }

        let start_time = Instant::now();
        let executed_at = Utc::now();

        // Execute migration with timeout
        let timeout = options.timeout.unwrap_or(self.config.default_timeout);
        let result = tokio::time::timeout(timeout, migration.up(&self.database)).await;

        let duration = start_time.elapsed();
        let duration_ms = duration.as_millis() as u64;

        let migration_result = match result {
            Ok(Ok(())) => {
                tracing::info!("Migration {} applied successfully for service '{}' in {}ms",
                    version, self.config.service_name, duration_ms);
                let result = MigrationResult::success(version, description.clone(), executed_at, duration_ms);
                // Use VersionTracker to record the migration
                self.version_tracker.record_migration(&result).await?;
                result
            }
            Ok(Err(e)) => {
                MigrationResult::failure(version, description.clone(), executed_at, duration_ms, e.to_string())
            }
            Err(_) => {
                MigrationResult::failure(version, description.clone(), executed_at, duration_ms, "Migration timed out".to_string())
            }
        };
        Ok(migration_result)
    }

    /// Execute a single migration (down)
    async fn execute_migration_down(&self, migration: &dyn Migration, options: &MigrationOptions) -> Result<MigrationResult> {
        let version = migration.version();
        let description = format!("Rollback: {}", migration.description());
        
        tracing::info!("Rolling back migration {} for service '{}': {}", 
            version, self.config.service_name, migration.description());
        
        // Check if migration is applied
        if !self.version_tracker.is_applied(version).await? && !options.force {
            return Err(anyhow!("Migration {} is not applied for service '{}', cannot rollback", 
                version, self.config.service_name));
        }

        let start_time = Instant::now();
        let executed_at = Utc::now();

        // Execute rollback with timeout
        let timeout = options.timeout.unwrap_or(self.config.default_timeout);
        let result = tokio::time::timeout(timeout, migration.down(&self.database)).await;

        let duration = start_time.elapsed();
        let duration_ms = duration.as_millis() as u64;

        let migration_result = match result {
            Ok(Ok(())) => {
                tracing::info!("Migration {} rolled back successfully for service '{}' in {}ms", 
                    version, self.config.service_name, duration_ms);
                MigrationResult::success(version, description, executed_at, duration_ms)
            }
            Ok(Err(e)) => {
                tracing::error!("Migration {} rollback failed for service '{}': {}", 
                    version, self.config.service_name, e);
                MigrationResult::failure(version, description, executed_at, duration_ms, e.to_string())
            }
            Err(_) => {
                tracing::error!("Migration {} rollback timed out for service '{}'", 
                    version, self.config.service_name);
                MigrationResult::failure(version, description, executed_at, duration_ms, "Rollback timed out".to_string())
            }
        };

        // Record the rollback
        if migration_result.success {
            self.version_tracker.record_rollback(version).await?;
        }

        Ok(migration_result)
    }


    /// Get the database reference
    pub fn database(&self) -> &Database {
        &self.database
    }

    /// Get the version tracker reference
    pub fn version_tracker(&self) -> &VersionTracker {
        &self.version_tracker
    }

    /// Get the registry reference
    pub fn registry(&self) -> &MigrationRegistry {
        &self.registry
    }

    /// Get the configuration reference
    pub fn config(&self) -> &MigrationConfig {
        &self.config
    }
}

/// Builder for creating a MigrationRunner with custom configuration
pub struct MigrationRunnerBuilder {
    database: Option<Database>,
    registry: Option<MigrationRegistry>,
    config: MigrationConfig,
}

impl MigrationRunnerBuilder {
    /// Create a new builder
    pub fn new() -> Self {
        Self {
            database: None,
            registry: None,
            config: MigrationConfig::default(),
        }
    }

    /// Set the database
    pub fn database(mut self, database: Database) -> Self {
        self.database = Some(database);
        self
    }

    /// Set the migration registry
    pub fn registry(mut self, registry: MigrationRegistry) -> Self {
        self.registry = Some(registry);
        self
    }

    /// Set the migration configuration
    pub fn config(mut self, config: MigrationConfig) -> Self {
        self.config = config;
        self
    }

    /// Set the service name
    pub fn service_name(mut self, service_name: impl Into<String>) -> Self {
        self.config.service_name = service_name.into();
        self
    }

    /// Set the version collection name
    pub fn version_collection(mut self, collection_name: impl Into<String>) -> Self {
        self.config.version_collection = collection_name.into();
        self
    }

    /// Set the default timeout
    pub fn default_timeout(mut self, timeout: std::time::Duration) -> Self {
        self.config.default_timeout = timeout;
        self
    }

    /// Build the MigrationRunner
    pub fn build(self) -> Result<MigrationRunner> {
        let database = self.database.ok_or_else(|| anyhow!("Database is required"))?;
        let registry = self.registry.ok_or_else(|| anyhow!("Registry is required"))?;
        
        Ok(MigrationRunner::with_config(database, registry, self.config))
    }
}

impl Default for MigrationRunnerBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Migration status report
#[derive(Debug, Clone)]
pub struct MigrationRunnerStatus {
    pub service_name: String,
    pub current_version: u32,
    pub latest_available_version: u32,
    pub pending_count: usize,
    pub total_applied: u32,
    pub total_rolled_back: u32,
    pub avg_duration_ms: f64,
    pub total_duration_ms: i64,
}

impl MigrationRunnerStatus {
    /// Check if migrations are up to date
    pub fn is_up_to_date(&self) -> bool {
        self.current_version == self.latest_available_version
    }

    /// Get a summary string
    pub fn summary(&self) -> String {
        if self.is_up_to_date() {
            format!("Service '{}' is up to date at version {}", 
                self.service_name, self.current_version)
        } else {
            format!(
                "Service '{}' at version {}, {} migration(s) pending (latest: {})",
                self.service_name,
                self.current_version,
                self.pending_count,
                self.latest_available_version
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_runner_builder() {
        let builder = MigrationRunnerBuilder::new()
            .service_name("test-service")
            .version_collection("test_migrations")
            .default_timeout(std::time::Duration::from_secs(60));

        assert_eq!(builder.config.service_name, "test-service");
        assert_eq!(builder.config.version_collection, "test_migrations");
        assert_eq!(builder.config.default_timeout, std::time::Duration::from_secs(60));
    }

    #[test]
    fn test_migration_status() {
        let status = MigrationRunnerStatus {
            service_name: "test-service".to_string(),
            current_version: 3,
            latest_available_version: 5,
            pending_count: 2,
            total_applied: 3,
            total_rolled_back: 0,
            avg_duration_ms: 100.0,
            total_duration_ms: 300,
        };

        assert!(!status.is_up_to_date());
        assert!(status.summary().contains("test-service"));
        assert!(status.summary().contains("2 migration(s) pending"));
    }

    #[test]
    fn test_migration_status_up_to_date() {
        let status = MigrationRunnerStatus {
            service_name: "test-service".to_string(),
            current_version: 5,
            latest_available_version: 5,
            pending_count: 0,
            total_applied: 5,
            total_rolled_back: 0,
            avg_duration_ms: 100.0,
            total_duration_ms: 500,
        };

        assert!(status.is_up_to_date());
        assert!(status.summary().contains("up to date"));
    }
}
