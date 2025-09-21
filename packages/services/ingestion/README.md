# Data Ingestion Service

A robust data ingestion service that supports multiple data source formats with guaranteed consistency, automatic embedding generation, and autocomplete integration.

## Features

### Data Source Support

- **API**: REST APIs with authentication (Bearer, Basic Auth, API Key, OAuth2)
- **CSV**: Comma-separated values with configurable delimiters and headers
- **JSONL**: JSON Lines format
- **TSV**: Tab-separated values
- **XML**: XML parsing with configurable element structures

### Two-Staged Commit Architecture

- **Stage 1**: Data preparation and staging in MongoDB with transactions
- **Stage 2**: Commit to external services (search index + autocomplete)
- **Rollback Support**: Automatic rollback on failure with complete recovery

### Data Snapshots

- Complete snapshots of processed data for point-in-time recovery
- Snapshot lifecycle management (Current → Previous → Archived)
- Configurable retention policies and cleanup

### Integrations

- **Search Service**: Automatic indexing via GraphQL API
- **Embeddings Service**: Automatic embedding generation for configured fields
- **Redis**: Autocomplete dictionary population
- **MongoDB**: Transactional metadata and snapshot storage

### Scheduling & Sync

- Cron-based automatic synchronization
- Manual sync triggers via GraphQL API
- Concurrent sync management with configurable limits

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Sources  │────│ Ingestion       │────│ Search Service  │
│ (API,CSV,etc.)  │    │ Service         │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐    ┌─────────────────┐
                       │ MongoDB         │    │ Embeddings      │
                       │ (Snapshots)     │    │ Service         │
                       └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │ Redis           │
                       │ (Autocomplete)  │
                       └─────────────────┘
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server
PORT=8089

# Database
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=ingestion
MONGODB_RETRY_WRITES=false

# Services
SEARCH_SERVICE_URL=http://localhost:8088
EMBEDDINGS_SERVICE_URL=http://localhost:8090
REDIS_URL=redis://localhost:6379

# HTTP
HTTP_TIMEOUT_MS=30000
# Customize User-Agent used when downloading CSV/TSV/JSONL/XML or calling APIs
HTTP_USER_AGENT="ingestion-service/1.0 (+https://yourdomain.example)"

# Performance
DEFAULT_BATCH_SIZE=1000
MAX_CONCURRENT_SYNCS=5
```

## Usage

### Start the Service

```bash
cd packages/services/ingestion
cargo run
```

The service will start on `http://localhost:8089` with:

- GraphQL API at `/graphql`
- GraphQL Playground at `/graphql` (GET)
- Health check at `/health`

### GraphQL API Examples

#### Create a Data Source

```graphql
mutation CreateDataSource($input: CreateDataSourceInput!) {
  createDataSource(input: $input) {
    id
    name
    status
    createdAt
  }
}
```

#### Trigger Manual Sync

```graphql
mutation TriggerSync($id: ID!) {
  triggerSync(id: $id) {
    syncVersion
    status
    totalRecords
    processedRecords
    durationMs
  }
}
```

#### Query Data Sources

```graphql
query DataSources($appId: String) {
  dataSources(appId: $appId) {
    id
    name
    status
    lastSync
    nextSync
  }
}
```

### Data Source Configuration

#### API Data Source

```json
{
  "name": "Products API",
  "appId": "ecommerce",
  "sourceType": {
    "Api": {
      "endpoint": "https://api.example.com/products",
      "auth": {
        "authType": "Bearer",
        "credentials": {
          "token": "your-api-token"
        }
      }
    }
  },
  "mapping": {
    "fields": {
      "name": {
        "sourcePath": "product_name",
        "targetField": "name",
        "dataType": "String",
        "required": true
      }
    },
    "embeddingFields": [
      {
        "fields": ["name", "description"],
        "weights": { "name": 2.0, "description": 1.0 },
        "targetField": "embedding"
      }
    ],
    "autocompleteFields": ["name", "brand"]
  },
  "syncInterval": "0 0 */6 * * *"
}
```

#### CSV Data Source

```json
{
  "name": "Product Catalog CSV",
  "appId": "ecommerce",
  "sourceType": {
    "Csv": {
      "url": "https://example.com/products.csv",
      "delimiter": ",",
      "hasHeaders": true
    }
  },
  "mapping": {
    "fields": {
      "name": {
        "sourcePath": "Product Name",
        "targetField": "name",
        "dataType": "String",
        "required": true
      },
      "price": {
        "sourcePath": "Price",
        "targetField": "price",
        "dataType": "Float",
        "transform": {
          "functionName": "formatNumber",
          "parameters": { "decimals": 2 }
        }
      }
    }
  },
  "syncInterval": "0 0 2 * * *"
}
```

## Field Mapping & Transforms

The service supports flexible field mapping with built-in transforms:

- `uppercase` / `lowercase` - Text case conversion
- `trim` - Remove whitespace
- `default` - Provide default values
- `split` / `join` - Array manipulation
- `formatNumber` - Number formatting
- `regexReplace` - Pattern replacement

## Consistency Guarantees

1. **Atomic Staging**: All data processing happens within MongoDB transactions
2. **Two-Phase Commit**: External services are updated only after successful validation
3. **Automatic Rollback**: Failed commits trigger automatic rollback of all changes
4. **Snapshot Integrity**: Each sync creates a complete snapshot for recovery
5. **Progressive Cleanup**: Old data is cleaned up only after successful new data commits

## Recovery & Rollback

- **Automatic Recovery**: Failed syncs can automatically rollback to previous snapshot
- **Manual Rollback**: GraphQL API supports manual rollback to any previous snapshot
- **Point-in-Time Recovery**: Restore to any previous successful sync
- **Incremental Recovery**: Apply only the differences between snapshots

## Monitoring & Observability

- Structured JSON logging with tracing
- Performance metrics for each sync phase
- GraphQL API for sync history and status
- Health check endpoint
- Snapshot metadata and error tracking

## Development

### Project Structure

```
src/
├── main.rs              # Entry point and HTTP server
├── config.rs            # Configuration management
├── schema.rs            # GraphQL schema and resolvers
├── models/              # Domain models
├── clients/             # External service clients
├── handlers/            # Data source format handlers
├── migrations/          # MongoDB migrations (inventory-registered)
├── cli.rs               # Migration CLI wiring
├── mapping/             # Field mapping and transforms
├── sync/                # Sync engine and scheduling
└── storage/             # MongoDB operations
```

### Migration Commands

The ingestion service uses the shared `mongodb-migrator` framework (same as Records).

Run these from `packages/services/ingestion`:

```bash
# Show help
cargo run -- help

# Show status
cargo run -- migrate status

# Apply all pending migrations
cargo run -- migrate up

# Roll back the last migration
cargo run -- migrate down

# Migrate to a specific version
cargo run -- migrate to 1

# Discover migration files in src/migrations
cargo run -- migrate discover
```

Migrations also run automatically on startup when `AUTO_MIGRATE=true` (default).

### Build & Test

```bash
# Build
cargo build

# Run tests (when implemented)
cargo test

# Run with debug logging
RUST_LOG=debug cargo run
```

## Production Deployment

1. Configure environment variables
2. Ensure MongoDB, Redis, and other services are available
3. Set up monitoring and logging
4. Configure appropriate resource limits
5. Consider running multiple instances behind a load balancer

## Troubleshooting

### Common Issues

**Sync Failures**: Check service connectivity and authentication credentials

**Memory Usage**: Adjust batch sizes and concurrent sync limits

**MongoDB Transactions**: Ensure MongoDB replica set for transaction support

**MongoDB retryable writes**: If you see an error like `This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.`, set `MONGODB_RETRY_WRITES=false` (default) or add `retryWrites=false` in your `MONGODB_URI`. Retryable writes require a replica set or sharded cluster; single-node standalone servers typically don’t support it.

**Redis Connection**: Verify Redis URL and connectivity

### Debug Mode

```bash
RUST_LOG=debug cargo run
```

This enables detailed logging for troubleshooting sync operations, field mappings, and service communications.
