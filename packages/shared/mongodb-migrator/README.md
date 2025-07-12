# MongoDB Migrator

A flexible, inventory-based MongoDB migration framework for Rust services.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Creating Migrations](#creating-migrations)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

## Overview

The MongoDB Migrator provides a robust, type-safe way to manage database schema changes and data migrations in MongoDB-based Rust applications. It uses an inventory-based auto-discovery system that eliminates the need for manual migration registration.

### Key Concepts

- **Migrations**: Rust structs that implement the `Migration` trait
- **Auto-discovery**: Migrations register themselves using macros
- **Service Isolation**: Each service maintains its own migration state
- **Bidirectional**: Support for both up (apply) and down (rollback) operations
- **Version Tracking**: Persistent tracking of applied migrations in MongoDB

## Features

- ✅ **Zero Manual Registration**: Migrations auto-register using macros
- ✅ **Service Isolation**: Each service has its own migration collection
- ✅ **Type Safety**: Full Rust compile-time guarantees
- ✅ **CLI Integration**: Rich command-line tools
- ✅ **Rollback Support**: Bidirectional migrations
- ✅ **Validation**: Pre-execution validation and planning
- ✅ **Error Handling**: Comprehensive error reporting
- ✅ **Async/Await**: Full async support with tokio
- ✅ **Flexible Configuration**: Customizable timeouts and settings

## Quick Start

### 1. Add Dependency

Add to your `Cargo.toml`:

```toml
[dependencies]
mongodb-migrator = { path = "../../shared/mongodb-migrator" }
inventory = "0.3"  # Required for auto-registration
```

### 2. Create a Migration

```rust
// src/migrations/m001_create_indexes.rs
use async_trait::async_trait;
use mongodb::{Database, IndexModel};
use anyhow::Result;
use bson::doc;
use mongodb_migrator::{Migration, register_migration};

#[derive(Default)]
pub struct CreateIndexes;

// Auto-register this migration
register_migration!(CreateIndexes);

#[async_trait]
impl Migration for CreateIndexes {
    fn version(&self) -> u32 {
        1
    }

    fn description(&self) -> &str {
        "Create initial indexes for users collection"
    }

    async fn up(&self, db: &Database) -> Result<()> {
        let collection = db.collection::<bson::Document>("users");
        
        collection.create_index(
            IndexModel::builder()
                .keys(doc! { "email": 1 })
                .options(
                    mongodb::options::IndexOptions::builder()
                        .unique(true)
                        .build()
                )
                .build(),
            None,
        ).await?;

        Ok(())
    }

    async fn down(&self, db: &Database) -> Result<()> {
        let collection = db.collection::<bson::Document>("users");
        collection.drop_index("email_1", None).await?;
        Ok(())
    }
}
```

### 3. Include Migration Module

```rust
// src/migrations/mod.rs
pub mod m001_create_indexes;
// Add future migrations here
```

```rust
// src/main.rs
mod migrations;  // Include migrations module

// The migrations will auto-register themselves!
```

### 4. Run Migrations

```bash
# Check status
cargo run migrate status

# Apply all pending migrations
cargo run migrate up

# Rollback last migration
cargo run migrate down
```

## Installation

### For New Services

1. **Add Dependencies**:
   ```toml
   [dependencies]
   mongodb-migrator = { path = "../../shared/mongodb-migrator" }
   inventory = "0.3"
   ```

2. **Implement ServiceConfig**:
   ```rust
   use mongodb_migrator::{ServiceConfig, MigrationConfig};

   impl ServiceConfig for MyConfig {
       fn mongodb_uri(&self) -> &str { &self.mongodb_uri }
       fn database_name(&self) -> &str { &self.database_name }
       fn migration_config(&self) -> MigrationConfig {
           MigrationConfig {
               service_name: "my-service".to_string(),
               version_collection: "my_service_migrations".to_string(),
               ..Default::default()
           }
       }
   }
   ```

3. **Add CLI Support**:
   ```rust
   use mongodb_migrator::MigrationCliRunner;

   // In main.rs
   if args.len() > 1 && args[1] == "migrate" {
       let cli_runner = MigrationCliRunner::new(config);
       return cli_runner.run_from_args().await;
   }
   ```

### For Existing Services

Follow the same steps as above, but you may need to:

1. Move existing migrations to the new format
2. Update migration version tracking
3. Test thoroughly in a development environment

## Creating Migrations

### Migration File Naming Convention

Use the pattern: `m{VERSION}_{description}.rs`

Examples:
- `m001_initial_indexes.rs` → `InitialIndexes` struct
- `m002_add_user_fields.rs` → `AddUserFields` struct
- `m003_create_audit_log.rs` → `CreateAuditLog` struct

### Migration Template

```rust
use async_trait::async_trait;
use mongodb::Database;
use anyhow::Result;
use mongodb_migrator::{Migration, register_migration};

#[derive(Default)]
pub struct MyMigration;

register_migration!(MyMigration);

#[async_trait]
impl Migration for MyMigration {
    fn version(&self) -> u32 {
        // Increment from the last migration version
        2
    }

    fn description(&self) -> &str {
        "Brief description of what this migration does"
    }

    async fn up(&self, db: &Database) -> Result<()> {
        // Forward migration logic
        tracing::info!("Applying migration: {}", self.description());
        
        // Your migration code here
        
        tracing::info!("Migration {} completed", self.version());
        Ok(())
    }

    async fn down(&self, db: &Database) -> Result<()> {
        // Rollback logic
        tracing::info!("Rolling back migration: {}", self.description());
        
        // Your rollback code here
        
        tracing::info!("Rollback {} completed", self.version());
        Ok(())
    }

    // Optional: Validate before execution
    async fn validate(&self, db: &Database) -> Result<()> {
        // Check preconditions
        Ok(())
    }

    // Optional: Estimate duration
    fn estimated_duration(&self) -> Option<std::time::Duration> {
        Some(std::time::Duration::from_secs(30))
    }

    // Optional: Indicate if backup is required
    fn requires_backup(&self) -> bool {
        false  // Set to true for destructive operations
    }
}
```

### Common Migration Patterns

#### Creating Indexes

```rust
async fn up(&self, db: &Database) -> Result<()> {
    let collection = db.collection::<bson::Document>("users");
    
    // Simple index
    collection.create_index(
        IndexModel::builder()
            .keys(doc! { "email": 1 })
            .build(),
        None,
    ).await?;

    // Compound index
    collection.create_index(
        IndexModel::builder()
            .keys(doc! { "user_id": 1, "created_at": -1 })
            .build(),
        None,
    ).await?;

    // Unique index
    collection.create_index(
        IndexModel::builder()
            .keys(doc! { "username": 1 })
            .options(
                mongodb::options::IndexOptions::builder()
                    .unique(true)
                    .build()
            )
            .build(),
        None,
    ).await?;

    Ok(())
}
```

#### Adding Fields

```rust
async fn up(&self, db: &Database) -> Result<()> {
    let collection = db.collection::<bson::Document>("users");
    
    // Add field with default value
    collection.update_many(
        doc! { "status": { "$exists": false } },
        doc! { "$set": { "status": "active" } },
        None,
    ).await?;

    Ok(())
}
```

#### Data Transformation

```rust
async fn up(&self, db: &Database) -> Result<()> {
    let collection = db.collection::<bson::Document>("users");
    
    // Find documents that need updating
    let mut cursor = collection.find(
        doc! { "old_field": { "$exists": true } },
        None,
    ).await?;

    while cursor.advance().await? {
        let doc = cursor.current();
        let id = doc.get_object_id("_id")?;
        
        if let Ok(old_value) = doc.get_str("old_field") {
            let new_value = transform_value(old_value);
            
            collection.update_one(
                doc! { "_id": id },
                doc! { 
                    "$set": { "new_field": new_value },
                    "$unset": { "old_field": "" }
                },
                None,
            ).await?;
        }
    }

    Ok(())
}

fn transform_value(old: &str) -> String {
    // Your transformation logic
    old.to_uppercase()
}
```

## CLI Commands

### Basic Commands

```bash
# Show migration status
cargo run migrate status

# Apply all pending migrations
cargo run migrate up

# Rollback the last migration
cargo run migrate down

# Migrate to a specific version
cargo run migrate to 5

# Show migration plan without executing
cargo run migrate plan

# Show migration plan for specific version
cargo run migrate plan 3
```

### Advanced Options

```bash
# Dry run - show what would be executed
cargo run migrate up --dry-run
cargo run migrate down --dry-run
cargo run migrate to 5 --dry-run

# Force execution (bypass safety checks)
cargo run migrate up --force
cargo run migrate down --force

# Discover migration files (for debugging)
cargo run migrate discover

# Generate migration registry (legacy)
cargo run migrate generate
```

### Status Output Example

```
📊 Migration Status for 'records'
==================================
Current version: 3
Latest available: 5
Pending migrations: 2
Total applied: 3
Total rolled back: 0
Average duration: 150.5ms
Total duration: 451ms

⚠️  Service 'records' at version 3, 2 migration(s) pending (latest: 5)
```

### Plan Output Example

```
📋 Migration Plan for 'records'
===============================
Apply 2 migration(s) from version 3 to 5

Migrations to execute:
  4 - Add user profile fields (~10s)
  5 - Create audit log indexes (~5s) [BACKUP REQUIRED]

Estimated total duration: 15s

⚠️  Some migrations require backup before execution
```

## Configuration

### MigrationConfig

```rust
use mongodb_migrator::MigrationConfig;

let config = MigrationConfig {
    service_name: "my-service".to_string(),
    version_collection: "my_service_migrations".to_string(),
    auto_create_collections: true,
    default_timeout: std::time::Duration::from_secs(300),
};
```

### ServiceConfig Implementation

```rust
use mongodb_migrator::{ServiceConfig, MigrationConfig};

struct MyServiceConfig {
    mongodb_uri: String,
    database_name: String,
}

impl ServiceConfig for MyServiceConfig {
    fn mongodb_uri(&self) -> &str {
        &self.mongodb_uri
    }
    
    fn database_name(&self) -> &str {
        &self.database_name
    }
    
    fn migration_config(&self) -> MigrationConfig {
        MigrationConfig {
            service_name: "my-service".to_string(),
            version_collection: "my_service_migrations".to_string(),
            auto_create_collections: true,
            default_timeout: std::time::Duration::from_secs(600), // 10 minutes
        }
    }
}
```

### Environment Variables

```bash
# Disable auto-migration on startup
AUTO_MIGRATE=false

# MongoDB connection
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=my_database
```

## Best Practices

### 1. Migration Versioning

- **Sequential Numbering**: Use sequential version numbers (1, 2, 3, ...)
- **No Gaps**: Don't skip version numbers
- **No Duplicates**: Each migration must have a unique version
- **Immutable**: Never change a migration that has been applied in production

### 2. Migration Content

- **Atomic Operations**: Each migration should be atomic
- **Idempotent**: Migrations should be safe to run multiple times
- **Reversible**: Always implement proper `down()` methods
- **Tested**: Test both up and down migrations thoroughly

### 3. Data Safety

- **Backup First**: Set `requires_backup()` to `true` for destructive operations
- **Validate**: Use the `validate()` method to check preconditions
- **Gradual**: Break large migrations into smaller, manageable pieces
- **Monitor**: Watch migration execution in production

### 4. Performance

- **Estimate Duration**: Provide realistic `estimated_duration()` values
- **Index Strategy**: Create indexes during low-traffic periods
- **Batch Processing**: Process large datasets in batches
- **Timeout**: Set appropriate timeouts for long-running migrations

### 5. Error Handling

```rust
async fn up(&self, db: &Database) -> Result<()> {
    let collection = db.collection::<bson::Document>("users");
    
    // Use transactions for multiple operations
    let mut session = db.client().start_session(None).await?;
    session.start_transaction(None).await?;
    
    match self.perform_migration(&collection).await {
        Ok(_) => {
            session.commit_transaction().await?;
            Ok(())
        }
        Err(e) => {
            session.abort_transaction().await?;
            Err(e)
        }
    }
}
```

## Advanced Usage

### Custom Migration Runner

```rust
use mongodb_migrator::{MigrationRunner, MigrationConfig};

let config = MigrationConfig {
    service_name: "my-service".to_string(),
    version_collection: "custom_migrations".to_string(),
    default_timeout: std::time::Duration::from_secs(1800), // 30 minutes
    ..Default::default()
};

let runner = MigrationRunner::builder()
    .database(database)
    .registry(registry)
    .config(config)
    .build()?;

// Custom migration options
let options = MigrationOptions {
    dry_run: false,
    force: false,
    backup_before: true,
    timeout: Some(std::time::Duration::from_secs(3600)), // 1 hour
};

let results = runner.migrate_up(Some(options)).await?;
```

### Programmatic Usage

```rust
use mongodb_migrator::{create_migration_registry, MigrationRunner};

// Create registry and runner
let registry = create_migration_registry()?;
let runner = MigrationRunner::new(database, registry);

// Initialize
runner.initialize().await?;

// Get status
let status = runner.status().await?;
println!("Current version: {}", status.current_version);

// Get plan
let plan = runner.plan(Some(5)).await?;
println!("Plan: {}", plan.summary());

// Execute migrations
let results = runner.migrate_to(5, None).await?;
for result in results {
    if result.success {
        println!("✓ Migration {}: {}", result.version, result.description);
    } else {
        println!("✗ Migration {}: failed", result.version);
    }
}
```

### Integration with Application Startup

```rust
#[tokio::main]
async fn main() -> Result<()> {
    // ... setup code ...

    // Auto-migrate on startup (optional)
    if std::env::var("AUTO_MIGRATE").unwrap_or_else(|_| "true".to_string()) == "true" {
        let registry = mongodb_migrator::create_migration_registry()?;
        let config = MigrationConfig {
            service_name: "my-service".to_string(),
            version_collection: "my_service_migrations".to_string(),
            ..Default::default()
        };
        
        let runner = MigrationRunner::with_config(database.clone(), registry, config);
        runner.initialize().await?;
        
        let results = runner.migrate_up(None).await?;
        if !results.is_empty() {
            tracing::info!("Applied {} migrations on startup", results.len());
        }
    }

    // ... start application ...
}
```

## Troubleshooting

### Common Issues

#### 1. Migration Not Found

**Error**: `Migration version X not found in registry`

**Solution**: 
- Ensure the migration file is included in `mod.rs`
- Check that `register_migration!()` macro is called
- Verify the migration struct implements `Default`

#### 2. Version Conflicts

**Error**: `Migration version X is already registered`

**Solution**:
- Check for duplicate version numbers
- Ensure each migration has a unique version
- Look for accidentally included test migrations

#### 3. Database Connection Issues

**Error**: `Failed to connect to MongoDB`

**Solution**:
- Verify MongoDB URI is correct
- Check database permissions
- Ensure MongoDB is running and accessible

#### 4. Migration Timeout

**Error**: `Migration timed out`

**Solution**:
- Increase timeout in `MigrationOptions` or `MigrationConfig`
- Break large migrations into smaller pieces
- Optimize migration queries

### Debugging

#### Enable Debug Logging

```rust
tracing_subscriber::fmt()
    .with_max_level(tracing::Level::DEBUG)
    .init();
```

#### Check Migration Discovery

```bash
# See what migrations are discovered
cargo run migrate discover
```

#### Dry Run Migrations

```bash
# See what would be executed without running
cargo run migrate up --dry-run
cargo run migrate plan
```

#### Manual Migration Inspection

```rust
// Check migration registry
let registry = create_migration_registry()?;
println!("Found {} migrations", registry.count());

for version in registry.get_versions() {
    if let Some(migration) = registry.get_migration(version) {
        println!("Migration {}: {}", version, migration.description());
    }
}
```

### Recovery Procedures

#### Reset Migration State

⚠️ **Warning**: Only use in development environments!

```javascript
// In MongoDB shell
db.my_service_migrations.deleteMany({});
```

#### Manual Version Update

```javascript
// Mark a migration as applied (emergency use only)
db.my_service_migrations.insertOne({
    version: 5,
    description: "Emergency manual application",
    applied_at: new Date(),
    duration_ms: 0,
    service_name: "my-service"
});
```

#### Rollback Stuck Migration

```bash
# Force rollback even if not applied
cargo run migrate down --force

# Or rollback to specific version
cargo run migrate to 3 --force
```

## API Reference

### Migration Trait

```rust
#[async_trait]
pub trait Migration: Send + Sync {
    fn version(&self) -> u32;
    fn description(&self) -> &str;
    async fn up(&self, db: &Database) -> Result<()>;
    async fn down(&self, db: &Database) -> Result<()>;
    
    // Optional methods
    async fn validate(&self, db: &Database) -> Result<()> { Ok(()) }
    fn estimated_duration(&self) -> Option<Duration> { None }
    fn requires_backup(&self) -> bool { false }
}
```

### MigrationRunner Methods

```rust
impl MigrationRunner {
    pub async fn initialize(&self) -> Result<()>;
    pub async fn migrate_up(&self, options: Option<MigrationOptions>) -> Result<Vec<MigrationResult>>;
    pub async fn migrate_to(&self, version: u32, options: Option<MigrationOptions>) -> Result<Vec<MigrationResult>>;
    pub async fn rollback_one(&self, options: Option<MigrationOptions>) -> Result<Vec<MigrationResult>>;
    pub async fn rollback_to(&self, version: u32, options: Option<MigrationOptions>) -> Result<Vec<MigrationResult>>;
    pub async fn status(&self) -> Result<MigrationRunnerStatus>;
    pub async fn plan(&self, target_version: Option<u32>) -> Result<MigrationPlan>;
}
```

### Configuration Types

```rust
pub struct MigrationConfig {
    pub service_name: String,
    pub version_collection: String,
    pub auto_create_collections: bool,
    pub default_timeout: Duration,
}

pub struct MigrationOptions {
    pub dry_run: bool,
    pub force: bool,
    pub backup_before: bool,
    pub timeout: Option<Duration>,
}
```

---

For more examples and advanced usage, see the [examples directory](./examples/) and the [API documentation](https://docs.rs/mongodb-migrator).
