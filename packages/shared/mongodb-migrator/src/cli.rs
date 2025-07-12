//! CLI utilities for migration management
//! 
//! This module provides a generic CLI interface that can be used by any service
//! to manage MongoDB migrations. Services can customize the CLI by providing
//! their own configuration and database connection logic.

#[cfg(feature = "cli")]
use clap::{Parser, Subcommand};
use anyhow::Result;
use mongodb::{Client, Database};
use std::env;

use crate::{
    MigrationRunner, MigrationLoader, create_migration_registry, 
    MigrationConfig, MigrationOptions
};

/// CLI commands for migration management
#[cfg(feature = "cli")]
#[derive(Parser)]
#[command(name = "migrate")]
#[command(about = "MongoDB migration management")]
pub struct MigrationCli {
    #[command(subcommand)]
    pub command: Option<MigrationCommand>,
}

/// Migration subcommands
#[cfg(feature = "cli")]
#[derive(Subcommand)]
pub enum MigrationCommand {
    /// Run all pending migrations
    Up {
        /// Run in dry-run mode (show what would be executed)
        #[arg(long)]
        dry_run: bool,
        /// Force execution even if migrations are already applied
        #[arg(long)]
        force: bool,
    },
    /// Rollback the last migration
    Down {
        /// Run in dry-run mode (show what would be executed)
        #[arg(long)]
        dry_run: bool,
        /// Force execution even if migration is not applied
        #[arg(long)]
        force: bool,
    },
    /// Migrate to a specific version
    To {
        /// Target version number
        version: u32,
        /// Run in dry-run mode (show what would be executed)
        #[arg(long)]
        dry_run: bool,
        /// Force execution
        #[arg(long)]
        force: bool,
    },
    /// Show migration status
    Status,
    /// Show migration plan
    Plan {
        /// Target version (optional)
        version: Option<u32>,
    },
    /// Discover migration files from filesystem
    Discover {
        /// Path to migrations directory
        #[arg(long, default_value = "src/migrations")]
        path: String,
    },
    /// Generate migration registry code (legacy)
    Generate {
        /// Path to migrations directory
        #[arg(long, default_value = "src/migrations")]
        path: String,
        /// Output file path
        #[arg(long, default_value = "src/migrations/mod.rs")]
        output: String,
    },
}

/// Configuration trait for services using the CLI
pub trait ServiceConfig {
    /// Get the MongoDB connection URI
    fn mongodb_uri(&self) -> &str;
    
    /// Get the database name
    fn database_name(&self) -> &str;
    
    /// Get the migration configuration
    fn migration_config(&self) -> MigrationConfig;
}

/// Simple CLI runner that can be used by services
pub struct MigrationCliRunner<C: ServiceConfig> {
    config: C,
}

impl<C: ServiceConfig> MigrationCliRunner<C> {
    /// Create a new CLI runner with the given configuration
    pub fn new(config: C) -> Self {
        Self { config }
    }

    /// Parse command line arguments and execute the appropriate command
    #[cfg(feature = "cli")]
    pub async fn run_from_args(&self) -> Result<()> {
        let cli = MigrationCli::parse();
        
        match cli.command {
            Some(command) => self.execute_command(command).await,
            None => {
                // Default to status if no command provided
                self.execute_command(MigrationCommand::Status).await
            }
        }
    }

    /// Execute a specific migration command
    pub async fn execute_command(&self, command: MigrationCommand) -> Result<()> {
        match command {
            #[cfg(feature = "cli")]
            MigrationCommand::Generate { path, output } => {
                println!("🔍 Discovering migrations and generating registry...");
                
                let loader = MigrationLoader::new(path, None)?;
                let code = loader.generate_registry_code()?;
                
                std::fs::write(&output, code)?;
                
                println!("✅ Generated migration registry at {}", output);
                println!("💡 Note: With inventory-based discovery, this is mainly for reference");
                Ok(())
            }
            
            #[cfg(feature = "cli")]
            MigrationCommand::Discover { path } => {
                println!("🔍 Discovering migration files...");
                
                let loader = MigrationLoader::new(path, None)?;
                loader.print_discovered_migrations()?;
                Ok(())
            }
            
            _ => {
                // For other commands, we need database connection
                let client = Client::with_uri_str(self.config.mongodb_uri()).await?;
                let database = client.database(self.config.database_name());
                
                self.execute_database_command(command, database).await
            }
        }
    }

    /// Execute commands that require database connection
    async fn execute_database_command(&self, command: MigrationCommand, database: Database) -> Result<()> {
        // Create migration registry and runner using inventory-based discovery
        let registry = create_migration_registry()?;
        println!("✅ Using inventory-based migration discovery");
        
        let migration_config = self.config.migration_config();
        let runner = MigrationRunner::with_config(database, registry, migration_config);
        
        // Initialize migration system
        runner.initialize().await?;
        
        match command {
            #[cfg(feature = "cli")]
            MigrationCommand::Up { dry_run, force } => {
                let options = MigrationOptions {
                    dry_run,
                    force,
                    ..Default::default()
                };
                
                if dry_run {
                    println!("🔍 DRY RUN: Showing what would be executed...");
                } else {
                    println!("🚀 Running all pending migrations...");
                }
                
                let results = runner.migrate_up(Some(options)).await?;
                
                if results.is_empty() {
                    println!("✅ No pending migrations to apply");
                } else {
                    println!("✅ Applied {} migration(s):", results.len());
                    for result in results {
                        if result.success {
                            println!("  ✓ Migration {}: {} ({}ms)", 
                                result.version, result.description, result.duration_ms);
                        } else {
                            println!("  ✗ Migration {}: {} - FAILED: {}", 
                                result.version, result.description, 
                                result.error_message.unwrap_or_else(|| "Unknown error".to_string()));
                        }
                    }
                }
            }
            
            #[cfg(feature = "cli")]
            MigrationCommand::Down { dry_run, force } => {
                let options = MigrationOptions {
                    dry_run,
                    force,
                    ..Default::default()
                };
                
                if dry_run {
                    println!("🔍 DRY RUN: Showing what would be executed...");
                } else {
                    println!("⏪ Rolling back last migration...");
                }
                
                let results = runner.rollback_one(Some(options)).await?;
                
                if results.is_empty() {
                    println!("✅ No migrations to rollback");
                } else {
                    println!("✅ Rolled back {} migration(s):", results.len());
                    for result in results {
                        if result.success {
                            println!("  ✓ Rollback {}: {} ({}ms)", 
                                result.version, result.description, result.duration_ms);
                        } else {
                            println!("  ✗ Rollback {}: {} - FAILED: {}", 
                                result.version, result.description, 
                                result.error_message.unwrap_or_else(|| "Unknown error".to_string()));
                        }
                    }
                }
            }
            
            #[cfg(feature = "cli")]
            MigrationCommand::To { version, dry_run, force } => {
                let options = MigrationOptions {
                    dry_run,
                    force,
                    ..Default::default()
                };
                
                if dry_run {
                    println!("🔍 DRY RUN: Showing what would be executed...");
                } else {
                    println!("🎯 Migrating to version {}...", version);
                }
                
                let results = runner.migrate_to(version, Some(options)).await?;
                
                if results.is_empty() {
                    println!("✅ Already at target version {}", version);
                } else {
                    println!("✅ Migration to version {} completed with {} operation(s):", version, results.len());
                    for result in results {
                        if result.success {
                            println!("  ✓ {}: {} ({}ms)", 
                                result.version, result.description, result.duration_ms);
                        } else {
                            println!("  ✗ {}: {} - FAILED: {}", 
                                result.version, result.description, 
                                result.error_message.unwrap_or_else(|| "Unknown error".to_string()));
                        }
                    }
                }
            }
            
            MigrationCommand::Status => {
                let status = runner.status().await?;
                
                println!("📊 Migration Status for '{}'", status.service_name);
                println!("=================={}", "=".repeat(status.service_name.len()));
                println!("Current version: {}", status.current_version);
                println!("Latest available: {}", status.latest_available_version);
                println!("Pending migrations: {}", status.pending_count);
                println!("Total applied: {}", status.total_applied);
                println!("Total rolled back: {}", status.total_rolled_back);
                
                if status.total_applied > 0 {
                    println!("Average duration: {:.1}ms", status.avg_duration_ms);
                    println!("Total duration: {}ms", status.total_duration_ms);
                }
                
                println!();
                if status.is_up_to_date() {
                    println!("✅ {}", status.summary());
                } else {
                    println!("⚠️  {}", status.summary());
                }
            }
            
            #[cfg(feature = "cli")]
            MigrationCommand::Plan { version } => {
                let plan = runner.plan(version).await?;
                
                println!("📋 Migration Plan for '{}'", runner.config().service_name);
                println!("================={}", "=".repeat(runner.config().service_name.len()));
                println!("{}", plan.summary());
                
                if plan.has_migrations() {
                    println!("\nMigrations to execute:");
                    for migration_info in &plan.migrations {
                        let duration_str = if let Some(duration) = migration_info.estimated_duration {
                            format!(" (~{}s)", duration.as_secs())
                        } else {
                            String::new()
                        };
                        
                        let backup_str = if migration_info.requires_backup {
                            " [BACKUP REQUIRED]"
                        } else {
                            ""
                        };
                        
                        println!("  {} - {}{}{}", 
                            migration_info.version, 
                            migration_info.description,
                            duration_str,
                            backup_str
                        );
                    }
                    
                    if let Some(total_duration) = plan.estimated_total_duration() {
                        println!("\nEstimated total duration: {}s", total_duration.as_secs());
                    }
                    
                    if plan.requires_backup() {
                        println!("\n⚠️  Some migrations require backup before execution");
                    }
                }
            }
            
            _ => unreachable!(),
        }
        
        Ok(())
    }
}

/// Simple argument parsing for services that don't want to use clap
pub fn parse_simple_migration_command() -> Option<SimpleMigrationCommand> {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        return None;
    }

    match args[1].as_str() {
        "migrate" => {
            if args.len() < 3 {
                return Some(SimpleMigrationCommand::Status);
            }
            
            match args[2].as_str() {
                "up" => Some(SimpleMigrationCommand::Up),
                "down" => Some(SimpleMigrationCommand::Down),
                "status" => Some(SimpleMigrationCommand::Status),
                "discover" => Some(SimpleMigrationCommand::Discover),
                "plan" => {
                    let target = if args.len() > 3 {
                        args[3].parse().ok()
                    } else {
                        None
                    };
                    Some(SimpleMigrationCommand::Plan(target))
                }
                "to" => {
                    if args.len() > 3 {
                        if let Ok(version) = args[3].parse() {
                            Some(SimpleMigrationCommand::To(version))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                }
                _ => None,
            }
        }
        _ => None,
    }
}

/// Simple migration commands for services that don't use clap
#[derive(Debug, Clone)]
pub enum SimpleMigrationCommand {
    Up,
    Down,
    To(u32),
    Status,
    Plan(Option<u32>),
    Discover,
}

/// Print CLI usage help
pub fn print_usage(service_name: &str) {
    println!("{} - Migration Commands", service_name);
    println!("{}", "=".repeat(service_name.len() + 21));
    println!();
    println!("Usage:");
    println!("  cargo run                      - Start the service");
    println!("  cargo run migrate              - Show migration status");
    println!("  cargo run migrate up           - Run all pending migrations");
    println!("  cargo run migrate down         - Rollback last migration");
    println!("  cargo run migrate to <ver>     - Migrate to specific version");
    println!("  cargo run migrate status       - Show detailed migration status");
    println!("  cargo run migrate plan [ver]   - Show migration plan");
    println!("  cargo run migrate discover     - Discover migration files");
    println!();
    println!("Options:");
    println!("  --dry-run                      - Show what would be executed without running");
    println!("  --force                        - Force execution even if already applied");
    println!();
    println!("Examples:");
    println!("  cargo run migrate up           - Apply all pending migrations");
    println!("  cargo run migrate up --dry-run - Show what migrations would be applied");
    println!("  cargo run migrate to 5         - Migrate to version 5");
    println!("  cargo run migrate plan 3       - Show plan to migrate to version 3");
    println!("  cargo run migrate discover     - See what migration files are found");
    println!();
    println!("Migration File Naming Convention:");
    println!("  m001_initial_indexes.rs        -> InitialIndexes struct");
    println!("  m002_add_category_field.rs     -> AddCategoryField struct");
    println!("  m003_create_user_table.rs      -> CreateUserTable struct");
    println!();
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestConfig;
    
    impl ServiceConfig for TestConfig {
        fn mongodb_uri(&self) -> &str {
            "mongodb://localhost:27017"
        }
        
        fn database_name(&self) -> &str {
            "test_db"
        }
        
        fn migration_config(&self) -> MigrationConfig {
            MigrationConfig {
                service_name: "test-service".to_string(),
                version_collection: "test_migrations".to_string(),
                ..Default::default()
            }
        }
    }

    #[test]
    fn test_service_config() {
        let config = TestConfig;
        assert_eq!(config.mongodb_uri(), "mongodb://localhost:27017");
        assert_eq!(config.database_name(), "test_db");
        assert_eq!(config.migration_config().service_name, "test-service");
    }
}
