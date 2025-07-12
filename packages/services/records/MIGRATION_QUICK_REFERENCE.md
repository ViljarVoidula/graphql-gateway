# Migration Quick Reference Card

## 🚀 Common Commands

```bash
# Status & Planning
cargo run migrate status          # Show current migration status
cargo run migrate plan            # Show what migrations will run
cargo run migrate discover        # List discovered migration files

# Applying Migrations
cargo run migrate up              # Apply all pending migrations
cargo run migrate to 5           # Migrate to specific version
cargo run migrate up --dry-run   # Show what would be executed

# Rolling Back
cargo run migrate down           # Rollback last migration
cargo run migrate to 3          # Rollback to specific version
cargo run migrate down --dry-run # Show what would be rolled back

# Force Operations (use with caution)
cargo run migrate up --force     # Force apply even if already applied
cargo run migrate down --force   # Force rollback even if not applied
```

## 📝 Creating a New Migration

### 1. Create File
```bash
# Pattern: m{VERSION}_{description}.rs
touch src/migrations/m002_add_user_field.rs
```

### 2. Migration Template
```rust
use async_trait::async_trait;
use mongodb::Database;
use anyhow::Result;
use bson::doc;
use mongodb_migrator::{Migration, register_migration};

#[derive(Default)]
pub struct AddUserField;

register_migration!(AddUserField);

#[async_trait]
impl Migration for AddUserField {
    fn version(&self) -> u32 { 2 }
    fn description(&self) -> &str { "Add user field to records" }

    async fn up(&self, db: &Database) -> Result<()> {
        let collection = db.collection::<bson::Document>("records");
        collection.update_many(
            doc! { "user_id": { "$exists": false } },
            doc! { "$set": { "user_id": null } },
            None,
        ).await?;
        Ok(())
    }

    async fn down(&self, db: &Database) -> Result<()> {
        let collection = db.collection::<bson::Document>("records");
        collection.update_many(
            doc! {},
            doc! { "$unset": { "user_id": "" } },
            None,
        ).await?;
        Ok(())
    }
}
```

### 3. Add to Module
```rust
// src/migrations/mod.rs
pub mod m001_initial_indexes;
pub mod m002_add_user_field;  // Add this line
```

### 4. Test
```bash
cargo run migrate discover    # Verify it's found
cargo run migrate up --dry-run  # Test without applying
cargo run migrate up         # Apply migration
```

## 🔧 Common Patterns

### Add Field with Default
```rust
collection.update_many(
    doc! { "new_field": { "$exists": false } },
    doc! { "$set": { "new_field": "default_value" } },
    None,
).await?;
```

### Remove Field
```rust
collection.update_many(
    doc! {},
    doc! { "$unset": { "field_name": "" } },
    None,
).await?;
```

### Create Index
```rust
collection.create_index(
    IndexModel::builder()
        .keys(doc! { "field_name": 1 })
        .build(),
    None,
).await?;
```

### Drop Index
```rust
collection.drop_index("field_name_1", None).await?;
```

### Rename Field
```rust
collection.update_many(
    doc! {},
    doc! { "$rename": { "old_name": "new_name" } },
    None,
).await?;
```

## ⚠️ Safety Checklist

### Before Creating Migration
- [ ] Check current version: `cargo run migrate status`
- [ ] Use sequential version numbers (no gaps)
- [ ] Choose descriptive migration name
- [ ] Plan both `up()` and `down()` operations

### Before Applying
- [ ] Test with `--dry-run` first
- [ ] Review migration plan: `cargo run migrate plan`
- [ ] Backup database if destructive changes
- [ ] Set `requires_backup()` to `true` if needed

### Production Deployment
- [ ] Test on staging environment first
- [ ] Create database backup
- [ ] Plan maintenance window for long migrations
- [ ] Monitor application after deployment

## 🐛 Troubleshooting

### Migration Not Found
```bash
# Check if migration is discovered
cargo run migrate discover

# Ensure it's in mod.rs
grep "m00X_" src/migrations/mod.rs
```

### Version Conflicts
```bash
# Check for duplicate versions
cargo run migrate discover | grep "Version"
```

### Database Connection Issues
```bash
# Check environment variables
echo $MONGODB_URI
echo $DATABASE_NAME

# Test connection
mongosh $MONGODB_URI/$DATABASE_NAME --eval "db.runCommand('ping')"
```

### Reset Migration State (DEV ONLY)
```javascript
// In MongoDB shell - NEVER use in production!
use records_db
db.records_migrations.deleteMany({})
```

## 📊 Status Output Explained

```
📊 Migration Status for 'records'
==================================
Current version: 3              ← Last applied migration
Latest available: 5             ← Highest version found
Pending migrations: 2           ← Migrations waiting to be applied
Total applied: 3                ← Total migrations ever applied
Total rolled back: 0            ← Total rollbacks performed
Average duration: 150.5ms       ← Average time per migration
Total duration: 451ms           ← Total time for all migrations

⚠️  Service 'records' at version 3, 2 migration(s) pending (latest: 5)
```

## 🔄 Rollback Strategy

### Safe Rollback (Recommended)
```bash
# Check what will be rolled back
cargo run migrate down --dry-run

# Rollback one migration
cargo run migrate down

# Verify status
cargo run migrate status
```

### Emergency Rollback
```bash
# Force rollback to specific version
cargo run migrate to 2 --force

# Or restore from backup
mongorestore --drop backup-folder/
```

## 🚦 Environment Variables

```bash
# Required
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=records_db

# Optional
AUTO_MIGRATE=true              # Auto-migrate on startup
RUST_LOG=debug                 # Enable debug logging
```

## 📁 File Structure

```
src/migrations/
├── mod.rs                     # Module declarations
├── m001_initial_indexes.rs    # Version 1
├── m002_add_user_field.rs     # Version 2
└── m003_create_audit_log.rs   # Version 3
```

## 🎯 Best Practices

### DO ✅
- Use sequential version numbers
- Test migrations thoroughly
- Implement proper rollback logic
- Add logging to migrations
- Set realistic duration estimates
- Use transactions for multiple operations

### DON'T ❌
- Skip version numbers
- Modify applied migrations
- Forget to implement `down()`
- Apply untested migrations to production
- Make destructive changes without backups
- Use `--force` unless absolutely necessary

---

💡 **Need more help?** See the full documentation:
- [MongoDB Migrator README](../../shared/mongodb-migrator/README.md)
- [Records Service Migration Guide](./MIGRATION_GUIDE.md)
