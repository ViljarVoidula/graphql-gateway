use anyhow::Result;
use crate::{Migration, MigrationRegistry};

/// Migration registration for inventory-based discovery
pub struct MigrationRegistration {
    pub name: &'static str,
    pub constructor: fn() -> Box<dyn Migration>,
}

impl MigrationRegistration {
    pub const fn new(name: &'static str, constructor: fn() -> Box<dyn Migration>) -> Self {
        Self { name, constructor }
    }
}

// Collect all migration registrations
inventory::collect!(MigrationRegistration);

/// Create a migration registry using inventory-based automatic discovery
/// This completely eliminates the need for manual imports or registration
pub fn create_migration_registry() -> Result<MigrationRegistry> {
    let mut registry = MigrationRegistry::new();
    
    // Automatically discover all registered migrations using inventory
    for registration in inventory::iter::<MigrationRegistration>() {
        let migration = (registration.constructor)();
        registry = registry.register_boxed(migration);
        tracing::info!("Auto-registered migration: {}", registration.name);
    }
    
    tracing::info!("Migration registry created with {} migrations", registry.count());
    Ok(registry)
}

/// Get information about all registered migrations
pub fn list_registered_migrations() -> Vec<&'static str> {
    inventory::iter::<MigrationRegistration>()
        .map(|reg| reg.name)
        .collect()
}

/// Check if a specific migration is registered
pub fn is_migration_registered(name: &str) -> bool {
    inventory::iter::<MigrationRegistration>()
        .any(|reg| reg.name == name)
}

/// Get the count of registered migrations
pub fn registered_migration_count() -> usize {
    inventory::iter::<MigrationRegistration>().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inventory_discovery() {
        // Test that we can create a registry using inventory
        let registry = create_migration_registry().unwrap();
        
        // Registry should be created successfully (may be empty in tests)
        assert!(registry.count() >= 0);
    }

    #[test]
    fn test_migration_listing() {
        let migrations = list_registered_migrations();
        let count = registered_migration_count();
        
        // The count should match the list length
        assert_eq!(migrations.len(), count);
    }

    #[test]
    fn test_migration_check() {
        // Test with a non-existent migration
        assert!(!is_migration_registered("NonExistentMigration"));
    }
}
