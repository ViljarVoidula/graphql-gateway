# Schema Change Tracking

The gateway records remote service schema changes automatically during periodic introspection reloads.

## Storage

Table: `schema_changes`

Columns:

- `id` (UUID PK)
- `serviceId` (FK -> services.id, cascade delete)
- `previousHash` (sha256 of prior SDL, nullable)
- `newHash` (sha256 of new SDL)
- `diff` (simple line diff with prefixes: `+` added, `-` removed, space unchanged)
- `schemaSDL` (full SDL snapshot after change)
- `classification` enum: `breaking | non_breaking | unknown`
- `createdAt` timestamp (UTC)

## Classification Heuristic

Current heuristic (quick, conservative):

- If any removed lines (those starting with `- `) are present in the diff => `breaking`.
- Otherwise => `non_breaking`.
- Fallback `unknown` reserved for future smarter analyzers.

This can be replaced later with a semantic GraphQL diff to precisely mark breaking vs safe additions.

## GraphQL API

Query:

```graphql
query SchemaChanges($serviceId: ID!, $filters: SchemaChangeFilterInput) {
  schemaChanges(serviceId: $serviceId, filters: $filters) {
    id
    previousHash
    newHash
    classification
    diff
    createdAt
  }
}
```

`SchemaChangeFilterInput` fields:

- `from` / `to` (Date range)
- `classifications` (array of enum values)
- `offset` / `limit`

Auth rules:

- Admins may query any service.
- Non-admins must own the service.

## UI

`SchemaChangeTimeline` component shows:

- Filter by classification (multi-select)
- Color-coded badges (red=breaking, green=non-breaking, gray=unknown)
- Expandable diff blocks

## Extensibility Ideas

- Add semantic diff using `graphql-inspector` or similar library for accurate classification.
- Add pagination cursors.
- Add subscription for real-time notifications.
- Aggregate metrics (count of breaking changes per service) for dashboards.
- Add a “rollback” reference by storing historic SDL snapshots (already stored) and enabling diff between arbitrary revisions.

## Migrations

Two migrations introduced:

1. `1758000000000-AddSchemaChanges` – initial table.
2. `1758000001000-AddSchemaChangeClassification` – adds classification enum column.

Both migrations are idempotent with guards for dev environments where `synchronize` may pre-create artifacts.

# Schema Change Tracking

## Overview

Remote service GraphQL schema changes are automatically detected during the periodic introspection reload cycle performed by `SchemaLoader`.
When an SDL (schema definition language) snapshot for a service changes, a diff entry is stored in the `schema_changes` table along with a timestamp and hashes for previous/new versions.

## Data Model

Table: `schema_changes`

Columns:

- `id` (uuid, primary key)
- `serviceId` (uuid, FK -> services.id, cascade delete)
- `previousHash` (sha256 of previous SDL, nullable for first version)
- `newHash` (sha256 of new SDL)
- `diff` (text, unified style diff lines; additions prefixed with `+`, removals with `-`, unchanged with two spaces `  `)
- `schemaSDL` (full SDL snapshot after the change)
- `createdAt` (timestamp)

The service's current SDL snapshot is also persisted on the `services.sdl` column and updated when a change is recorded.

## Diff Format

The diff stored is a simple line-oriented LCS-based diff:

```
  type Query {
-   oldField: String
+  newField(arg: Int): String!
  }
```

Lines:

- `+` Added line
- `-` Removed line
- leading two spaces: Unchanged context line

If this is the first snapshot for a service, the diff is the entire SDL with all lines prefixed by `+`.

## GraphQL API

Query latest changes:

```
query ServiceSchemaChanges($serviceId: ID!) {
  schemaChanges(serviceId: $serviceId, limit: 25) {
    id
    previousHash
    newHash
    createdAt
    diff
  }
}
```

## UI

The admin UI includes a `SchemaChangeTimeline` component which:

- Lists recent changes (default 50)
- Collapsible diff blocks
- Shows short hash transitions `abc1234 → def5678`
- Displays human readable timestamps

## Extending

Potential future improvements:

- Add richer semantic diff (e.g. classify type/field additions or breaking changes)
- Add pagination & filtering by date range
- Emit audit events when breaking changes detected
- Add subscription / SSE push for near real-time updates
- Offline retention pruning job (e.g. keep last N changes per service)

## Operations

Migration file: `1758000000000-AddSchemaChanges.ts`.

Ensure the `uuid-ossp` extension is enabled if not already (needed for `uuid_generate_v4()`).

## Caveats

- Diff algorithm is intentionally lightweight; large schemas may produce large text entries. Consider compression if needed.
- No authorization check beyond basic auth for now in `schemaChanges` query—tighten to enforce ownership rules if required.
