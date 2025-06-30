# GraphQL Gateway Project

A comprehensive GraphQL gateway system with microservices architecture and robust database migration support.

## Project Overview

This project provides a unified GraphQL gateway that aggregates multiple backend services, with built-in support for database migrations, service isolation, and hot-reloading capabilities.

### Core Features

- **Uniform GraphQL Gateway**: Provides a single GraphQL endpoint that proxies to multiple upstream services
- **Hot-Reloading**: Support for adding new services during runtime without service disruption
- **Schema Visualization**: Visual representation and interactive UI for GraphQL schemas
- **Persistent Storage**: Service metadata and schema information stored persistently
- **Database Migrations**: Robust MongoDB migration system with CLI tools and auto-discovery
- **Polyglot Microservices**: Services can be written in different languages (TypeScript, Rust, Go, etc.) and still integrate seamlessly

## Services

### GraphQL Gateway (`packages/gateway/`)
- **Technology**: TypeScript, Node.js
- **Purpose**: Aggregates and proxies GraphQL schemas from multiple services
- **Features**: Schema stitching, hot-reloading, error handling

### Records Service (`packages/services/records/`)
- **Technology**: Rust, Axum, async-graphql
- **Purpose**: Manages record data with full CRUD operations
- **Features**: MongoDB integration, migration system, GraphQL API

### Shared Libraries (`packages/shared/`)
- **MongoDB Migrator**: Reusable migration framework for all services
- **Common Types**: Shared data structures and utilities

## Database Migration System

### Features
- ✅ **Auto-Discovery**: Migrations register themselves using inventory macros
- ✅ **Service Isolation**: Each service maintains its own migration state
- ✅ **CLI Tools**: Rich command-line interface for migration management
- ✅ **Rollback Support**: Bidirectional migrations with proper error handling
- ✅ **Type Safety**: Full Rust compile-time guarantees
- ✅ **Production Ready**: Dry-run, planning, and backup support

### Quick Start
```bash
# Check migration status
cargo run migrate status

# Apply pending migrations
cargo run migrate up

# Rollback last migration
cargo run migrate down

# Show migration plan
cargo run migrate plan
```

### Documentation
- [MongoDB Migrator Framework](packages/shared/mongodb-migrator/README.md)
- [Records Service Migration Guide](packages/services/records/MIGRATION_GUIDE.md)
- [Migration Quick Reference](packages/services/records/MIGRATION_QUICK_REFERENCE.md)

# Cases for further improvement

- Support different strategies for fallback of remote schema fetch failure('cached', 'drop')
  - cached strategy will return last state of failed schema endpoint
  - drop strategy will remove endpoint from root schema (as is default in the time of documenting)

## Microservice Architecture Examples

This section illustrates a scalable, coherent system where the GraphQL Gateway serves as the primary API layer for external clients, while internal processing is offloaded to an asynchronous, event-driven backbone using Kafka.

### Example Architecture

The diagram below shows a potential architecture that separates external API interactions from internal, event-based communication.

```
   External Clients (Web/Mobile)
              │
              ▼
    ┌───────────────────┐
    │   GraphQL Gateway │
    │   (External API)  │
    └─────────▲─────────┘
              │ (GraphQL Queries/Mutations)
   ┌──────────┴──────────┐
   │                     │
   ▼                     ▼
┌─────────────────┐   ┌──────────────────┐   ┌────────────────────┐
│ Identity Service│   │ Records Service  │   │ Categories Service │
│ (TypeScript/JS) │   │ (Rust)           │   │ (Go)               │
└────────┬────────┘   └────────┬─────────┘   └──────────┬─────────┘
         │                     │                        │
         ▼                     ▼                        ▼
┌────────┴────────┐   ┌────────┴─────────┐   ┌──────────┴─────────┐
│      TiDB       │   │     MongoDB      │   │     PostgreSQL     │
└─────────────────┘   └──────────────────┘   └────────────────────┘
         │                     │ (Events)               │
         └────────────┬────────┴──────────┬─────────────┘
                      │                  │
                      ▼                  ▼
            ┌──────────────────────────────────┐
            │       Kafka / NATS (Event Bus)   │
            └─────────────────┬────────────────┘
                              │ (Consume Events)
                              ▼
            ┌──────────────────────────────────┐
            │ Event Processor(s) (e.g., TS/Java) │
            │ (Analytics, Notifications, etc.) │
            └──────────────────────────────────┘
```

### System Layers

1.  **API Gateway Layer (GraphQL Gateway)**
    The Gateway is the single, authoritative entry point for all external clients. It exposes a unified GraphQL API, handling tasks like request routing, schema stitching, authentication, and rate limiting. By abstracting the internal services, it provides a stable and secure API to the outside world.

2.  **Service Layer (Polyglot Microservices)**
    Each service is a self-contained unit with a clear business responsibility and its own database. They expose GraphQL schemas that the Gateway consumes.
    -   **Identity Service (TypeScript/Feathers.js)**: Manages user accounts, authentication (e.g., JWT), and authorization rules.
    -   **Records Service (Rust)**: Handles the core business logic for creating and managing records, optimized for performance and safety.
    -   **Categories Service (Go)**: Manages data taxonomies or categories, built for high-concurrency reads.

3.  **Event-Driven Backbone (Kafka)**
    For scalability and resilience, services communicate asynchronously using an event bus like Kafka. When a service performs an action (e.g., a new record is created), it publishes an event. This decouples services, allowing them to evolve independently.
    -   **Event Processors (TypeScript, etc.)**: These are specialized services that subscribe to events from the bus to perform background tasks. This is ideal for operations that shouldn't block the user-facing request, such as sending email notifications, updating a search index, or populating a data warehouse for analytics.

### Request & Data Flow

-   **Synchronous Flow (External API)**: A client sends a `createRecord` mutation to the GraphQL Gateway. The Gateway forwards the request to the `Records Service`. The service validates the data, saves it to MongoDB, and returns a success response up to the client. This flow is for immediate, user-facing interactions.

-   **Asynchronous Flow (Internal Processing)**: After successfully saving the new record, the `Records Service` publishes a `RecordCreated` event to a Kafka topic. An `Event Processor` listening to this topic consumes the event and triggers a background job, like sending a welcome email, without making the client wait.
