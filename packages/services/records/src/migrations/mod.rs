//! Records service migrations
//! 
//! This module includes all migration files for the records service.
//! Migrations are automatically registered using the inventory system
//! from the shared mongodb-migrator crate.

// Include all migration files
pub mod m001_initial_indexes;
pub mod m002_create_record_taxonomy;

// Future migrations will be added here following the same pattern:
// pub mod m003_create_audit_log;
