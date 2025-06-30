//! # MongoDB Migrator
//!
//! A flexible, inventory-based MongoDB migration framework for Rust services.
//!
//! ## Features
//!
//! - **Inventory-based Auto-discovery**: Migrations self-register using macros
//! - **Zero Manual Registration**: No need to manually import or register migrations
//! - **Type Safety**: Full Rust compile-time guarantees
//! - **CLI Support**: Rich command-line tools for migration management
//! - **Service Isolation**: Each service can have its own migration collection
//! - **Rollback Support**: Bidirectional migrations with proper error handling
//!
//! ## Quick Start
//!
//! ```rust
//! use mongodb_migrator::{Migration, register_migration};
//! use async_trait::async_trait;
//! use mongodb::Database;
//! use anyhow::Result;
//!
//! #[derive(Default)]
//! pub struct CreateUserIndexes;
//!
//! register_migration!(CreateUserIndexes);
//!
//! #[async_trait]
//! impl Migration for CreateUserIndexes {
//!     fn version(&self) -> u32 { 1 }
//!     fn description(&self) -> &str { "Create user indexes" }
//!     
//!     async fn up(&self, db: &Database) -> Result<()> {
//!         // Migration logic here
//!         Ok(())
//!     }
//!     
//!     async fn down(&self, db: &Database) -> Result<()> {
//!         // Rollback logic here
//!         Ok(())
//!     }
//! }
//! ```

pub mod migration;
pub mod registry;
pub mod runner;
pub mod version;
pub mod factory;

#[cfg(feature = "cli")]
pub mod loader;

#[cfg(feature = "cli")]
pub mod cli;

// Re-export main types for easy access
pub use migration::{Migration, MigrationResult, MigrationOptions, MigrationStatus};
pub use registry::{MigrationRegistry, MigrationPlan, PlanType, MigrationInfo};
pub use runner::{MigrationRunner, MigrationRunnerBuilder, MigrationRunnerStatus};
pub use version::{VersionTracker, MigrationVersion, MigrationStats};
pub use factory::{create_migration_registry, MigrationRegistration};

#[cfg(feature = "cli")]
pub use loader::{MigrationLoader, MigrationFileInfo};

#[cfg(feature = "cli")]
pub use cli::{
    MigrationCli, MigrationCommand, ServiceConfig, MigrationCliRunner,
    SimpleMigrationCommand, parse_simple_migration_command, print_usage
};

// Re-export inventory for the macro
pub use inventory;

/// Configuration for the migration system
#[derive(Debug, Clone)]
pub struct MigrationConfig {
    /// Name of the collection to store migration version information
    pub version_collection: String,
    /// Service name for logging and identification
    pub service_name: String,
    /// Whether to automatically create collections if they don't exist
    pub auto_create_collections: bool,
    /// Default timeout for migration operations
    pub default_timeout: std::time::Duration,
}

impl Default for MigrationConfig {
    fn default() -> Self {
        Self {
            version_collection: "_migrations".to_string(),
            service_name: "default".to_string(),
            auto_create_collections: true,
            default_timeout: std::time::Duration::from_secs(300), // 5 minutes
        }
    }
}

/// Macro to register a migration automatically using the inventory system
///
/// This macro should be used in each migration file to automatically register
/// the migration with the system. The migration struct must implement `Default`.
///
/// # Example
///
/// ```rust
/// use mongodb_migrator::{Migration, register_migration};
///
/// #[derive(Default)]
/// pub struct MyMigration;
///
/// register_migration!(MyMigration);
/// ```
#[macro_export]
macro_rules! register_migration {
    ($migration_type:ty) => {
        inventory::submit! {
            $crate::MigrationRegistration::new(
                stringify!($migration_type),
                || Box::new(<$migration_type>::default())
            )
        }
    };
}

/// Error types for the migration system
#[derive(thiserror::Error, Debug)]
pub enum MigrationError {
    #[error("Database error: {0}")]
    Database(#[from] mongodb::error::Error),
    
    #[error("BSON error: {0}")]
    Bson(#[from] bson::de::Error),
    
    #[error("Migration version {version} not found")]
    MigrationNotFound { version: u32 },
    
    #[error("Migration version {version} already applied")]
    MigrationAlreadyApplied { version: u32 },
    
    #[error("Migration validation failed: {message}")]
    ValidationFailed { message: String },
    
    #[error("Migration timeout after {duration:?}")]
    Timeout { duration: std::time::Duration },
    
    #[error("Migration sequence error: {message}")]
    SequenceError { message: String },
    
    #[error("Configuration error: {message}")]
    ConfigError { message: String },
}

/// Result type for migration operations
pub type Result<T> = std::result::Result<T, MigrationError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = MigrationConfig::default();
        assert_eq!(config.version_collection, "_migrations");
        assert_eq!(config.service_name, "default");
        assert!(config.auto_create_collections);
        assert_eq!(config.default_timeout, std::time::Duration::from_secs(300));
    }
}
