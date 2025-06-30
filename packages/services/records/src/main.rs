use anyhow::Result;
use axum::{
    extract::State,
    http::Method,
    response::{Html, IntoResponse},
    routing::{get, post},
    Router,
};

use tracing::{info, Level};
use tracing_subscriber;
use async_graphql::http::{playground_source, GraphQLPlaygroundConfig};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use tower_http::cors::{Any, CorsLayer};

mod config;
mod database;
mod models;
mod schema;
mod service;
mod cli;
mod migrations;

use config::Config;
use database::DatabaseManager;
use schema::{create_schema, RecordsSchema};
use service::RecordService;

#[derive(Clone)]
pub struct AppState {
    pub schema: RecordsSchema,
}

async fn graphql_handler(
    State(state): State<AppState>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    state.schema.execute(req.into_inner()).await.into()
}


async fn graphql_playground() -> impl IntoResponse {
    Html(playground_source(GraphQLPlaygroundConfig::new("/graphql")))
}


async fn health() -> impl IntoResponse {
    "OK"
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env();

    // Check for migration commands first
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "migrate" {
        return cli::run_migration_cli(config).await;
    }

    // Check for help command
    if args.len() > 1 && (args[1] == "help" || args[1] == "--help" || args[1] == "-h") {
        cli::print_records_usage();
        return Ok(());
    }

    info!("Starting Records Service...");
    info!("MongoDB URI: {}", config.mongodb_uri);
    info!("Database: {}", config.database_name);
    info!("Port: {}", config.server_port);

    // Initialize database
    let db = DatabaseManager::new(&config.mongodb_uri, &config.database_name).await?;
    info!("Connected to MongoDB successfully");

    // Run pending migrations on startup (optional - can be disabled with env var)
    let auto_migrate = std::env::var("AUTO_MIGRATE").unwrap_or_else(|_| "true".to_string());
    if auto_migrate.to_lowercase() == "true" {
        info!("Running pending migrations on startup...");
        
        // Use inventory-based migration discovery from shared crate
        let registry = mongodb_migrator::create_migration_registry()?;
        info!("Using inventory-based migration discovery");
        
        let migration_config = mongodb_migrator::MigrationConfig {
            service_name: "records".to_string(),
            version_collection: "records_migrations".to_string(),
            auto_create_collections: true,
            default_timeout: std::time::Duration::from_secs(300),
        };
        
        let runner = mongodb_migrator::MigrationRunner::with_config(
            db.database().clone(), 
            registry, 
            migration_config
        );
        
        if let Err(e) = runner.initialize().await {
            tracing::warn!("Failed to initialize migration system: {}", e);
        } else {
            match runner.migrate_up(None).await {
                Ok(results) => {
                    if !results.is_empty() {
                        info!("Applied {} migration(s) on startup", results.len());
                        for result in results {
                            if result.success {
                                info!("  ✓ Migration {}: {}", result.version, result.description);
                            } else {
                                tracing::error!("  ✗ Migration {}: {} - FAILED", result.version, result.description);
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to run migrations on startup: {}", e);
                }
            }
        }
    }

    // Initialize service
    let service = RecordService::new(db);

    // Create GraphQL schema
    let schema = create_schema(service);
    
    // Create app state
    let app_state = AppState { schema };

    // Setup CORS
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any)
        .allow_origin(Any);

    // Build the application
    let app = Router::new()
        .route("/graphql", post(graphql_handler))
        .route("/graphql", get(graphql_playground))
        .route("/health", get(health))
        .layer(cors)
        .with_state(app_state);

    // Start the server
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", config.server_port)).await.unwrap();
    info!("🚀 Records service started on http://0.0.0.0:{}", config.server_port);
    info!("📊 GraphQL Playground: http://0.0.0.0:{}/graphql", config.server_port);
    axum::serve(listener, app).await.unwrap();

    Ok(())
}
