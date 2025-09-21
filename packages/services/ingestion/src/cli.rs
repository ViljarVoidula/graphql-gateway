use anyhow::Result;
use mongodb_migrator::{
    ServiceConfig, MigrationConfig, MigrationCliRunner, print_usage,
    parse_simple_migration_command, SimpleMigrationCommand, MigrationCommand
};

use crate::config::Config;

/// Implement ServiceConfig for ingestion Config
impl ServiceConfig for Config {
    fn mongodb_uri(&self) -> &str { &self.mongodb_uri }
    fn database_name(&self) -> &str { &self.database_name }
    fn migration_config(&self) -> MigrationConfig {
        MigrationConfig {
            service_name: "ingestion".to_string(),
            version_collection: "_migrations".to_string(),
            auto_create_collections: true,
            default_timeout: std::time::Duration::from_secs(300),
        }
    }
}

/// Run migration CLI with the given configuration
pub async fn run_migration_cli(config: Config) -> Result<()> {
    let cli_runner = MigrationCliRunner::new(config);

    if let Some(simple_cmd) = parse_simple_migration_command() {
        let command = match simple_cmd {
            SimpleMigrationCommand::Up => MigrationCommand::Up { dry_run: false, force: false },
            SimpleMigrationCommand::Down => MigrationCommand::Down { dry_run: false, force: false },
            SimpleMigrationCommand::To(version) => MigrationCommand::To { version, dry_run: false, force: false },
            SimpleMigrationCommand::Status => MigrationCommand::Status,
            SimpleMigrationCommand::Plan(version) => MigrationCommand::Plan { version },
            SimpleMigrationCommand::Discover => MigrationCommand::Discover { path: "src/migrations".to_string() },
        };

        cli_runner.execute_command(command).await
    } else {
        // Default to status
        cli_runner.execute_command(MigrationCommand::Status).await
    }
}

pub fn print_ingestion_usage() {
    print_usage("Ingestion Service");
}
