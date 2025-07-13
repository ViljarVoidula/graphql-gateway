# 📦 Records Service

> *Where product data comes to life! A blazing-fast GraphQL microservice for managing product records, media, and taxonomies.*

[![Rust](https://img.shields.io/badge/rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![GraphQL](https://img.shields.io/badge/GraphQL-E10098?logo=graphql&logoColor=white)](https://graphql.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Axum](https://img.shields.io/badge/Axum-FF6B35?logo=rust&logoColor=white)](https://github.com/tokio-rs/axum)

## 🎯 What is Records Service?

The Records Service is a high-performance GraphQL API built in Rust that serves as the backbone for product catalog management. Think of it as your product data warehouse - it stores, organizes, and serves product information with lightning speed and type safety.

### 🌟 Key Features

- **🚀 Blazing Fast**: Built with Rust and Axum for maximum performance
- **📊 GraphQL API**: Modern, flexible API with built-in playground
- **🏷️ Rich Product Models**: Products, variations, media, and taxonomies
- **🗃️ MongoDB Backend**: Scalable NoSQL storage with automatic migrations
- **🔄 Auto-Migration**: Database schema evolution made easy
- **🎨 Interactive Playground**: Explore the API right in your browser
- **📱 CORS Ready**: Ready for modern web applications
- **🔍 Flexible Querying**: Pagination, sorting, and filtering built-in

### 🏗️ What Does It Manage?

```
📦 Records (Products)
├── 🏷️  Basic Info (name, brand, external_ref)
├── 💰 Pricing (price, discounted_price)
├── 🖼️  Media Gallery (images, videos, documents)
├── 🔗 External Links (original_url)
├── 📄 Custom Payload (flexible JSON data)
└── 🏷️  Taxonomies (categories, tags, classifications)

🎭 Variations
├── 🎨 Product variants (size, color, style)
├── 💼 Different configurations
└── 🔗 Linked to parent records

📊 Record Taxonomies
├── 📂 Categories and subcategories  
├── 🏷️  Tags and labels
└── 🎯 Custom classification systems
```

## 🚀 Quick Start

### Prerequisites

Before diving in, make sure you have:

- **Rust 1.70+** - [Install Rust](https://rustup.rs/)
- **MongoDB** - [Install MongoDB](https://docs.mongodb.com/manual/installation/) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- **Docker** (optional) - For containerized deployment

### 🏃‍♂️ Running the Service

1. **Clone and Navigate**
   ```bash
   git clone <your-repo>
   cd packages/services/records
   ```

2. **Environment Setup**
   ```bash
   # Copy example env file
   cp .env.example .env
   
   # Edit your environment variables
   nano .env
   ```

3. **Configure Environment**
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017
   DATABASE_NAME=records_db
   
   # Server
   SERVER_PORT=8080
   
   # Features
   AUTO_MIGRATE=true
   ```

4. **Run the Service**
   ```bash
   # Install dependencies and run
   cargo run
   ```

5. **Explore the API**
   - **GraphQL Playground**: http://localhost:8080/graphql
   - **Health Check**: http://localhost:8080/health

That's it! 🎉 Your Records service is now running and ready to manage your product data.

## 🎮 Playing with the API

### 🏟️ GraphQL Playground

Visit http://localhost:8080/graphql to access the interactive GraphQL playground. Here are some example queries to get you started:

#### 📋 List All Records
```graphql
query GetRecords {
  records(limit: 10, offset: 0) {
    id
    name
    brand
    price
    priceDiscounted
    media {
      id
      url
      type
      hash
    }
    createdAt
    updatedAt
  }
}
```

#### 🔍 Get a Specific Record
```graphql
query GetRecord($id: ID!) {
  record(id: $id) {
    id
    name
    brand
    externalRef
    originalUrl
    payload
    media {
      id
      url
      type
    }
  }
}
```

#### ➕ Create a New Record
```graphql
mutation CreateRecord($input: CreateRecordInput!) {
  createRecord(input: $input) {
    id
    name
    brand
    price
    createdAt
  }
}
```

#### 🎨 Get Product Variations
```graphql
query GetVariations($recordId: ID!) {
  variations(recordId: $recordId) {
    id
    name
    value
    recordRef
  }
}
```

#### 📊 Get Record Count
```graphql
query GetCount {
  recordsCount
}
```

## 🗃️ Database Migrations

The Records service uses an advanced migration system that keeps your database schema up-to-date automatically.

### 🔧 Migration Commands

```bash
# Check migration status
cargo run migrate status

# Apply all pending migrations
cargo run migrate up

# See what migrations would run (dry run)
cargo run migrate up --dry-run

# Rollback the last migration
cargo run migrate down

# Migrate to a specific version
cargo run migrate to 5

# Discover available migrations
cargo run migrate discover

# Show migration plan
cargo run migrate plan
```

### 📝 Creating Custom Migrations

Need to evolve your schema? Create a new migration:

1. **Create Migration File**
   ```bash
   touch src/migrations/m003_add_awesome_feature.rs
   ```

2. **Implement Migration**
   ```rust
   use async_trait::async_trait;
   use mongodb::Database;
   use anyhow::Result;
   use bson::doc;
   use mongodb_migrator::{Migration, register_migration};

   #[derive(Default)]
   pub struct AddAwesomeFeature;

   register_migration!(AddAwesomeFeature);

   #[async_trait]
   impl Migration for AddAwesomeFeature {
       fn version(&self) -> u32 { 3 }
       fn description(&self) -> &str { "Add awesome feature to records" }

       async fn up(&self, db: &Database) -> Result<()> {
           // Your migration logic here
           db.collection::<bson::Document>("records")
               .update_many(
                   doc! {},
                   doc! { "$set": { "awesome_field": "default_value" } },
                   None
               ).await?;
           Ok(())
       }

       async fn down(&self, db: &Database) -> Result<()> {
           // Rollback logic here
           db.collection::<bson::Document>("records")
               .update_many(
                   doc! {},
                   doc! { "$unset": { "awesome_field": "" } },
                   None
               ).await?;
           Ok(())
       }
   }
   ```

3. **Register in mod.rs**
   ```rust
   // In src/migrations/mod.rs
   pub mod m003_add_awesome_feature;
   ```

4. **Apply Migration**
   ```bash
   cargo run migrate up
   ```

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   GraphQL API   │    │   Business       │    │    Database     │
│                 │────│   Logic          │────│                 │
│ • Queries       │    │                  │    │ • MongoDB       │
│ • Mutations     │    │ • RecordService  │    │ • Collections   │
│ • Playground    │    │ • Validation     │    │ • Indexes       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌──────────────────┐             │
         └──────────────│   Migration      │─────────────┘
                        │   System         │
                        │                  │
                        │ • Auto-discovery │
                        │ • Version control│
                        │ • Rollback       │
                        └──────────────────┘
```

### 🧩 Core Components

- **🎯 GraphQL Schema** (`src/schema.rs`) - API definitions and resolvers
- **🏗️ Models** (`src/models.rs`) - Data structures and GraphQL types
- **⚙️ Service Layer** (`src/service.rs`) - Business logic and data operations
- **🗃️ Database** (`src/database.rs`) - MongoDB connection and management
- **🔄 Migrations** (`src/migrations/`) - Schema evolution system
- **⚙️ Configuration** (`src/config.rs`) - Environment-based configuration

## 🐳 Docker Deployment

### Build and Run with Docker

```bash
# Build the image
docker build -t records-service .

# Run the container
docker run -d \
  --name records-service \
  -p 8080:8080 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017 \
  -e DATABASE_NAME=records_db \
  records-service
```

### Docker Compose

```yaml
version: '3.8'

services:
  records-service:
    build: .
    ports:
      - "8080:8080"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017
      - DATABASE_NAME=records_db
      - AUTO_MIGRATE=true
    depends_on:
      - mongodb

  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:
```

## 🛠️ Development

### 🔧 Development Setup

```bash
# Install Rust dependencies
cargo build

# Run in development mode with auto-reload
cargo install cargo-watch
cargo watch -x run

# Run tests
cargo test

# Check code formatting
cargo fmt --check

# Run linter
cargo clippy
```

### 📝 Code Style

This project follows Rust best practices:

- **Format code**: `cargo fmt`
- **Lint code**: `cargo clippy`
- **Run tests**: `cargo test`
- **Check documentation**: `cargo doc --open`

### 🧪 Testing

```bash
# Run all tests
cargo test

# Run specific test
cargo test test_name

# Run tests with output
cargo test -- --nocapture

# Run integration tests
cargo test --test integration_tests
```

## 📊 Monitoring & Health

### Health Endpoints

- **Health Check**: `GET /health` - Simple service health check
- **GraphQL Introspection**: Available through the GraphQL endpoint

### 📈 Metrics & Logging

The service includes structured logging with tracing:

```rust
// Log levels: ERROR, WARN, INFO, DEBUG, TRACE
RUST_LOG=info cargo run
```

## 🤝 Contributing

We love contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**: Follow the coding standards
4. **Add tests**: Ensure your changes are tested
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### 📋 Development Checklist

- [ ] Code follows Rust formatting (`cargo fmt`)
- [ ] No clippy warnings (`cargo clippy`)
- [ ] Tests pass (`cargo test`)
- [ ] Documentation updated
- [ ] Migration added (if schema changes)

## 📜 API Reference

### 🔍 Queries

| Query | Description | Parameters |
|-------|-------------|------------|
| `records` | List all records | `limit`, `offset`, `sort` |
| `record` | Get single record | `id` |
| `recordsCount` | Get total count | - |
| `variations` | Get record variations | `recordId` |
| `recordTaxonomies` | Get taxonomies | `limit`, `offset` |

### ✏️ Mutations

| Mutation | Description | Input |
|----------|-------------|--------|
| `createRecord` | Create new record | `CreateRecordInput` |
| `updateRecord` | Update existing record | `UpdateRecordInput` |
| `deleteRecord` | Delete record | `id` |
| `createVariation` | Create variation | `CreateVariationInput` |
| `updateVariation` | Update variation | `UpdateVariationInput` |
| `deleteVariation` | Delete variation | `id` |

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `DATABASE_NAME` | Database name | `records_db` |
| `SERVER_PORT` | Server port | `8080` |
| `AUTO_MIGRATE` | Auto-run migrations | `true` |
| `RUST_LOG` | Logging level | `info` |

## 🚨 Troubleshooting

### Common Issues

**🔌 Can't connect to MongoDB**
```bash
# Check if MongoDB is running
mongosh --eval "db.adminCommand('ismaster')"

# Check connection string
echo $MONGODB_URI
```

**📦 Migration fails**
```bash
# Check migration status
cargo run migrate status

# Force reset migrations (⚠️ destructive)
cargo run migrate down --force
```

**🏗️ Build errors**
```bash
# Clean build cache
cargo clean
cargo build
```

**🔍 GraphQL errors**
```bash
# Check service logs
RUST_LOG=debug cargo run
```

## 📚 Learn More

- **[Rust Book](https://doc.rust-lang.org/book/)** - Learn Rust programming
- **[Axum Documentation](https://docs.rs/axum/latest/axum/)** - Web framework docs
- **[async-graphql](https://async-graphql.github.io/async-graphql/en/index.html)** - GraphQL library
- **[MongoDB Rust Driver](https://docs.rs/mongodb/latest/mongodb/)** - Database driver
- **[GraphQL](https://graphql.org/learn/)** - GraphQL fundamentals

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ and ☕ by the Records Team**

*Fast • Reliable • Scalable*

</div>