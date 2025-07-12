use std::collections::HashMap;
use anyhow::{Result, anyhow};

use crate::{Migration, VersionTracker};

/// Registry that manages all available migrations
pub struct MigrationRegistry {
    migrations: HashMap<u32, Box<dyn Migration>>,
}

impl MigrationRegistry {
    /// Create a new migration registry
    pub fn new() -> Self {
        Self {
            migrations: HashMap::new(),
        }
    }

    /// Register a migration
    pub fn register<M: Migration + 'static>(mut self, migration: M) -> Self {
        let version = migration.version();
        if self.migrations.contains_key(&version) {
            panic!("Migration version {} is already registered", version);
        }
        self.migrations.insert(version, Box::new(migration));
        self
    }

    /// Register a boxed migration (for dynamic loading)
    pub fn register_boxed(mut self, migration: Box<dyn Migration>) -> Self {
        let version = migration.version();
        if self.migrations.contains_key(&version) {
            panic!("Migration version {} is already registered", version);
        }
        self.migrations.insert(version, migration);
        self
    }

    /// Get all registered migrations sorted by version
    pub fn get_all_migrations(&self) -> Vec<&dyn Migration> {
        let mut migrations: Vec<_> = self.migrations.values().map(|m| m.as_ref()).collect();
        migrations.sort_by_key(|m| m.version());
        migrations
    }

    /// Get a specific migration by version
    pub fn get_migration(&self, version: u32) -> Option<&dyn Migration> {
        self.migrations.get(&version).map(|m| m.as_ref())
    }

    /// Get all migration versions sorted
    pub fn get_versions(&self) -> Vec<u32> {
        let mut versions: Vec<_> = self.migrations.keys().cloned().collect();
        versions.sort();
        versions
    }

    /// Get pending migrations (not yet applied)
    pub async fn get_pending_migrations(&self, version_tracker: &VersionTracker) -> Result<Vec<&dyn Migration>> {
        let applied_migrations = version_tracker.get_applied_migrations().await?;
        let applied_versions: std::collections::HashSet<u32> = applied_migrations
            .into_iter()
            .map(|m| m.version)
            .collect();

        let mut pending = Vec::new();
        for migration in self.get_all_migrations() {
            if !applied_versions.contains(&migration.version()) {
                pending.push(migration);
            }
        }

        Ok(pending)
    }

    /// Get migrations that can be rolled back (applied migrations in reverse order)
    pub async fn get_rollback_migrations(&self, version_tracker: &VersionTracker, target_version: Option<u32>) -> Result<Vec<&dyn Migration>> {
        let applied_migrations = version_tracker.get_applied_migrations().await?;
        let mut rollback_migrations = Vec::new();

        // Sort applied migrations in reverse order (newest first)
        let mut applied_versions: Vec<_> = applied_migrations.into_iter().map(|m| m.version).collect();
        applied_versions.sort_by(|a, b| b.cmp(a));

        for version in applied_versions {
            // If target version is specified, only rollback migrations newer than target
            if let Some(target) = target_version {
                if version <= target {
                    break;
                }
            }

            if let Some(migration) = self.get_migration(version) {
                rollback_migrations.push(migration);
            } else {
                return Err(anyhow!("Migration version {} is applied but not found in registry", version));
            }
        }

        Ok(rollback_migrations)
    }

    /// Validate migration sequence (check for gaps, duplicates, etc.)
    pub fn validate_sequence(&self) -> Result<()> {
        let versions = self.get_versions();
        
        if versions.is_empty() {
            return Ok(());
        }

        // Check for version 0 (should start from 1)
        if versions[0] == 0 {
            return Err(anyhow!("Migration versions should start from 1, not 0"));
        }

        // Check for gaps in sequence
        for i in 1..versions.len() {
            if versions[i] != versions[i-1] + 1 {
                return Err(anyhow!(
                    "Gap in migration sequence: version {} is followed by version {}",
                    versions[i-1], versions[i]
                ));
            }
        }

        tracing::info!("Migration sequence validation passed for {} migrations", versions.len());
        Ok(())
    }

    /// Get migration plan (what will be executed)
    pub async fn get_migration_plan(&self, version_tracker: &VersionTracker, target_version: Option<u32>) -> Result<MigrationPlan> {
        let current_version = version_tracker.get_latest_version().await?.unwrap_or(0);
        
        match target_version {
            Some(target) if target < current_version => {
                // Rollback plan
                let migrations = self.get_rollback_migrations(version_tracker, Some(target)).await?;
                Ok(MigrationPlan {
                    plan_type: PlanType::Rollback,
                    current_version,
                    target_version: Some(target),
                    migrations: migrations.into_iter().map(|m| MigrationInfo {
                        version: m.version(),
                        description: m.description().to_string(),
                        estimated_duration: m.estimated_duration(),
                        requires_backup: m.requires_backup(),
                    }).collect(),
                })
            }
            Some(target) if target > current_version => {
                // Forward migration plan to specific version
                let all_pending = self.get_pending_migrations(version_tracker).await?;
                let migrations: Vec<_> = all_pending
                    .into_iter()
                    .filter(|m| m.version() <= target)
                    .collect();
                
                Ok(MigrationPlan {
                    plan_type: PlanType::Forward,
                    current_version,
                    target_version: Some(target),
                    migrations: migrations.into_iter().map(|m| MigrationInfo {
                        version: m.version(),
                        description: m.description().to_string(),
                        estimated_duration: m.estimated_duration(),
                        requires_backup: m.requires_backup(),
                    }).collect(),
                })
            }
            Some(target) if target == current_version => {
                // No-op plan
                Ok(MigrationPlan {
                    plan_type: PlanType::NoOp,
                    current_version,
                    target_version: Some(target),
                    migrations: Vec::new(),
                })
            }
            None => {
                // Forward migration plan to latest
                let migrations = self.get_pending_migrations(version_tracker).await?;
                let latest_version = migrations.last().map(|m| m.version());
                
                Ok(MigrationPlan {
                    plan_type: PlanType::Forward,
                    current_version,
                    target_version: latest_version,
                    migrations: migrations.into_iter().map(|m| MigrationInfo {
                        version: m.version(),
                        description: m.description().to_string(),
                        estimated_duration: m.estimated_duration(),
                        requires_backup: m.requires_backup(),
                    }).collect(),
                })
            }
            _ => unreachable!(),
        }
    }

    /// Get the count of registered migrations
    pub fn count(&self) -> usize {
        self.migrations.len()
    }

    /// Check if a migration version exists in the registry
    pub fn has_migration(&self, version: u32) -> bool {
        self.migrations.contains_key(&version)
    }
}

impl Default for MigrationRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Migration execution plan
#[derive(Debug, Clone)]
pub struct MigrationPlan {
    pub plan_type: PlanType,
    pub current_version: u32,
    pub target_version: Option<u32>,
    pub migrations: Vec<MigrationInfo>,
}

impl MigrationPlan {
    /// Check if the plan has any migrations to execute
    pub fn has_migrations(&self) -> bool {
        !self.migrations.is_empty()
    }

    /// Get total estimated duration for all migrations
    pub fn estimated_total_duration(&self) -> Option<std::time::Duration> {
        let durations: Vec<_> = self.migrations
            .iter()
            .filter_map(|m| m.estimated_duration)
            .collect();
        
        if durations.is_empty() {
            None
        } else {
            Some(durations.into_iter().sum())
        }
    }

    /// Check if any migration requires backup
    pub fn requires_backup(&self) -> bool {
        self.migrations.iter().any(|m| m.requires_backup)
    }

    /// Get summary string for the plan
    pub fn summary(&self) -> String {
        match self.plan_type {
            PlanType::Forward => {
                if self.migrations.is_empty() {
                    "No pending migrations".to_string()
                } else {
                    format!(
                        "Apply {} migration(s) from version {} to {}",
                        self.migrations.len(),
                        self.current_version,
                        self.target_version.unwrap_or(0)
                    )
                }
            }
            PlanType::Rollback => {
                format!(
                    "Rollback {} migration(s) from version {} to {}",
                    self.migrations.len(),
                    self.current_version,
                    self.target_version.unwrap_or(0)
                )
            }
            PlanType::NoOp => "No migrations needed".to_string(),
        }
    }
}

/// Type of migration plan
#[derive(Debug, Clone, PartialEq)]
pub enum PlanType {
    Forward,
    Rollback,
    NoOp,
}

/// Information about a migration in a plan
#[derive(Debug, Clone)]
pub struct MigrationInfo {
    pub version: u32,
    pub description: String,
    pub estimated_duration: Option<std::time::Duration>,
    pub requires_backup: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Migration;
    use async_trait::async_trait;
    use mongodb::Database;

    #[derive(Default)]
    struct TestMigration {
        version: u32,
        description: String,
    }

    impl TestMigration {
        fn new(version: u32, description: &str) -> Self {
            Self {
                version,
                description: description.to_string(),
            }
        }
    }

    #[async_trait]
    impl Migration for TestMigration {
        fn version(&self) -> u32 {
            self.version
        }

        fn description(&self) -> &str {
            &self.description
        }

        async fn up(&self, _db: &Database) -> anyhow::Result<()> {
            Ok(())
        }

        async fn down(&self, _db: &Database) -> anyhow::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn test_registry_creation() {
        let registry = MigrationRegistry::new();
        assert_eq!(registry.count(), 0);
        assert!(registry.get_versions().is_empty());
    }

    #[test]
    fn test_migration_registration() {
        let registry = MigrationRegistry::new()
            .register(TestMigration::new(1, "First migration"))
            .register(TestMigration::new(2, "Second migration"));

        assert_eq!(registry.count(), 2);
        assert_eq!(registry.get_versions(), vec![1, 2]);
        assert!(registry.has_migration(1));
        assert!(registry.has_migration(2));
        assert!(!registry.has_migration(3));
    }

    #[test]
    fn test_migration_ordering() {
        let registry = MigrationRegistry::new()
            .register(TestMigration::new(3, "Third"))
            .register(TestMigration::new(1, "First"))
            .register(TestMigration::new(2, "Second"));

        let migrations = registry.get_all_migrations();
        assert_eq!(migrations.len(), 3);
        assert_eq!(migrations[0].version(), 1);
        assert_eq!(migrations[1].version(), 2);
        assert_eq!(migrations[2].version(), 3);
    }

    #[test]
    fn test_sequence_validation() {
        // Valid sequence
        let registry = MigrationRegistry::new()
            .register(TestMigration::new(1, "First"))
            .register(TestMigration::new(2, "Second"));
        assert!(registry.validate_sequence().is_ok());

        // Gap in sequence
        let registry = MigrationRegistry::new()
            .register(TestMigration::new(1, "First"))
            .register(TestMigration::new(3, "Third"));
        assert!(registry.validate_sequence().is_err());

        // Starting from 0
        let registry = MigrationRegistry::new()
            .register(TestMigration::new(0, "Zero"));
        assert!(registry.validate_sequence().is_err());
    }
}
