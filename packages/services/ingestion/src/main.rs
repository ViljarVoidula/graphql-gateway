use std::net::SocketAddr;
use axum::{routing::get, Router, Extension, response::Html};
use async_graphql::{EmptySubscription, Schema};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use tokio_cron_scheduler::{JobScheduler, Job};
use tracing_subscriber::{fmt, EnvFilter};
use mongodb::{Client as MongoClient, options::ClientOptions};

mod models;
mod clients;
mod storage;
mod handlers;
mod mapping;
mod sync;
mod processing;
mod config;
mod schema;
mod migrations; // ensure migrations module is compiled so inventory registers
mod cli;

use crate::config::Config;
use crate::schema::{QueryRoot, MutationRoot, IngestionSchema};
use crate::clients::*;
use crate::sync::SyncEngine;
use crate::cli::{run_migration_cli, print_ingestion_usage};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load this crate's .env regardless of current working directory, and override any pre-set envs
    let _ = dotenvy::from_filename_override(concat!(env!("CARGO_MANIFEST_DIR"), "/.env"));
    // Initialize logging
    let filter = EnvFilter::from_default_env().add_directive("info".parse().unwrap());
    fmt()
        .with_env_filter(filter)
        .json()
        .flatten_event(true)
        .with_current_span(true)
        .with_span_list(true)
        .init();

    // Load configuration
    let cfg = Config::from_env();
    // Support migration commands before starting the server
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        if args[1] == "migrate" {
            return run_migration_cli(cfg.clone()).await;
        }
        if args[1] == "help" || args[1] == "--help" || args[1] == "-h" {
            print_ingestion_usage();
            return Ok(());
        }
    }
    tracing::info!(
        database = %cfg.database_name,
        scheduler_enabled = cfg.enable_scheduler,
        "Loaded configuration"
    );

    // Initialize MongoDB
    // Some MongoDB deployments require retryWrites=false explicitly in the URI. If configured off,
    // ensure the connection string includes retryWrites=false (override any existing setting).
    let mut effective_uri = cfg.mongodb_uri.clone();
    if !cfg.mongodb_retry_writes {
        if effective_uri.contains("retryWrites=") {
            effective_uri = effective_uri
                .replace("retryWrites=true", "retryWrites=false")
                .replace("retryWrites=1", "retryWrites=false");
        } else {
            if effective_uri.contains('?') { effective_uri.push_str("&retryWrites=false"); }
            else { effective_uri.push_str("?retryWrites=false"); }
        }
    }
    let mut client_options = ClientOptions::parse(&effective_uri).await?;
    // Honor explicit retryWrites setting from config (double enforcement)
    client_options.retry_writes = Some(cfg.mongodb_retry_writes);
    let mongo_client = MongoClient::with_options(client_options)?;
    let db = mongo_client.database(&cfg.database_name);

    // Initialize service clients
    let search_client = SearchServiceClient::new(
        cfg.search_service_url.clone(),
        cfg.http_timeout_ms,
        cfg.http_user_agent.clone(),
        cfg.http_max_retries,
        cfg.http_retry_backoff_ms,
    );

    let embeddings_client = EmbeddingsServiceClient::new(
        cfg.embeddings_service_url.clone(),
        cfg.http_timeout_ms,
    );

    let redis_client = RedisClient::new(&cfg.redis_url).await?;

    // Run pending migrations on startup (optional via AUTO_MIGRATE)
    let auto_migrate = std::env::var("AUTO_MIGRATE").unwrap_or_else(|_| "true".to_string());
    if auto_migrate.to_lowercase() == "true" {
        tracing::info!("Running pending migrations on startup...");
        let registry = mongodb_migrator::create_migration_registry()?;
        let migration_config = mongodb_migrator::MigrationConfig {
            service_name: "ingestion".to_string(),
            version_collection: "_migrations".to_string(),
            auto_create_collections: true,
            default_timeout: std::time::Duration::from_secs(300),
        };
        let runner = mongodb_migrator::MigrationRunner::with_config(
            db.clone(),
            registry,
            migration_config,
        );
        if let Err(e) = runner.initialize().await {
            tracing::warn!(error = %e, "Failed to initialize migration system");
        } else if let Err(e) = runner.migrate_up(None).await {
            tracing::warn!(error = %e, "Failed to run migrations on startup");
        }
    }

    // Initialize sync engine
    let sync_engine = SyncEngine::new(
        mongo_client.clone(),
        db.clone(),
        search_client,
        embeddings_client,
        redis_client,
        cfg.clone(),
    );

    // Build GraphQL schema
    let graphql_schema: IngestionSchema = Schema::build(QueryRoot, MutationRoot, EmptySubscription)
        .data(cfg.clone())
        .data(sync_engine.clone())
        .finish();

    // Initialize and start scheduler
    let scheduler = JobScheduler::new().await?;
    
    if cfg.enable_scheduler {
        start_sync_scheduler(scheduler.clone(), sync_engine.clone()).await?;
        scheduler.start().await?;
        tracing::info!("Sync scheduler started");
    }

    // Build web application
    let app = Router::new()
        .route("/graphql", get(graphql_playground).post(graphql_handler))
        .route("/health", get(health_check))
        .layer(Extension(graphql_schema));

    let addr: SocketAddr = format!("0.0.0.0:{}", cfg.port).parse()?;
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::AddrInUse {
                tracing::error!(port = cfg.port, "Port is already in use. Another ingestion-service might be running. Try changing PORT env var or stop the other process.");
            }
            return Err(e.into());
        }
    };
    tracing::info!(port = cfg.port, "Ingestion service listening");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn graphql_playground() -> Html<String> {
    Html(async_graphql::http::playground_source(
        async_graphql::http::GraphQLPlaygroundConfig::new("/graphql"),
    ))
}

async fn graphql_handler(
    Extension(schema): Extension<IngestionSchema>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(req.into_inner()).await.into()
}

async fn health_check() -> &'static str {
    "OK"
}

async fn start_sync_scheduler(
    scheduler: JobScheduler,
    sync_engine: SyncEngine,
) -> anyhow::Result<()> {
    // Job to check for due syncs every minute
    let sync_check_job = Job::new_async("0 * * * * *", move |_uuid, _l| {
        let engine = sync_engine.clone();
        Box::pin(async move {
            if let Err(e) = check_and_run_due_syncs(engine).await {
                tracing::error!(error = %e, "Error checking due syncs");
            }
        })
    })?;

    scheduler.add(sync_check_job).await?;
    
    Ok(())
}

async fn check_and_run_due_syncs(_sync_engine: SyncEngine) -> anyhow::Result<()> {
    // Query MongoDB for data sources and trigger syncs when due
    tracing::debug!("Checking for due sync operations");

    let engine = _sync_engine;
    let mut due_sources = Vec::new();
    let sources = engine.storage.list_data_sources(None).await?;
    for ds in sources.into_iter().filter(|d| d.enabled) {
        if ds.is_due_for_sync() {
            due_sources.push(ds);
        }
    }

    for mut ds in due_sources {
        // Skip if already syncing to maintain a solid queue
        if ds.status == models::DataSourceStatus::Syncing {
            tracing::debug!(data_source_id = %ds.id.unwrap(), "Data source already syncing; skipping schedule");
            continue;
        }
        let engine_clone = engine.clone();
        let ds_id = ds.id.expect("data source must have id");
        // Optimistically mark as syncing before spawn to reduce race window
        let mut ds_for_update = ds.clone();
        ds_for_update.update_sync_status(models::DataSourceStatus::Syncing);
        if let Err(e) = engine.storage.update_data_source(&ds_for_update).await {
            tracing::warn!(data_source_id = %ds_id, error = %e, "Failed to mark data source as syncing before spawn");
        }
        tokio::spawn(async move {
            if let Err(e) = engine_clone.execute_sync_with_snapshots(ds_id).await {
                tracing::error!(data_source_id = %ds_id, error = %e, "Scheduled sync failed");
            }
        });

        // Calculate next sync using cron
        ds.next_sync = ds.calculate_next_sync();
        ds.updated_at = mongodb::bson::DateTime::now();
        if let Err(e) = engine.storage.update_data_source(&ds).await {
            tracing::warn!(data_source_id = %ds_id, error = %e, "Failed to update next_sync");
        }
    }

    Ok(())
}
