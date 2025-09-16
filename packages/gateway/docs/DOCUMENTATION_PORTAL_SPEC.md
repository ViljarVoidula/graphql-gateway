# Gateway Documentation Portal Specification

> Version: 0.1 (Living Document)  
> Owner: Platform / Gateway Team  
> Last Updated: {{UPDATE_DATE}}

## 1. Executive Summary

We will build a white‑label, extensible documentation portal for the GraphQL Gateway that:

- Renders **MDX** content (guides, cookbooks, feature docs, API how‑tos) with rich React components.
- Provides **multi-language Get Started** pages (TS, Python, Java, .NET, PHP) with code snippet switching.
- Includes a **GraphQL schema explorer + type reference** sourced from build‑time introspection.
- Offers a **public Q&A chat** (ask a question, semantic retrieval over docs + schema, LLM assisted answers) with moderation and opt‑in persistence.
- Supports **search** (instant, heading + code block aware) with pre-built JSON index.
- Is **white‑label/themable**: admins can customize tokens (colors, typography, spacing, logos) via an Admin UI; changes propagate live without rebuild.
- Ships as a separate `docs` bundle served from `/docs` inside the existing gateway (re-using current webpack setup) or exported as static assets for CDN hosting.

## 2. Goals & Non‑Goals

### Goals

- Fast authoring workflow: add / edit MDX file -> rebuild -> instant load (HMR in dev).
- Deterministic navigation and ordering (manifest auto-generated at build time, override metadata via frontmatter).
- Pluggable MDX components (e.g. `<Callout>`, `<LangTabs>`, `<TryIt query="" variables="" />`).
- AI assisted chat with retrieval over: docs content AST, selected schema SDL slices, and curated FAQ embeddings.
- White‑label token system persisted in DB and emitted as runtime CSS variables.
- Strict security: no arbitrary script injection from MDX; only whitelisted components.

### Non‑Goals (Initial Phase)

- Full WYSIWYG MDX editor (Phase 3+).
- Multi-version docs (v1 / v2) — postpone until schema stability demands it.
- Offline export to PDF (future optional script).

## 3. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                           Browser (Docs SPA)                   │
│                                                                │
│  + MDX Pages  + Schema Explorer  + Chat Panel + Search UI      │
│         │             │                │            │          │
│         ▼             ▼                ▼            ▼          │
│   MDX Runtime   schema.json (static)  /chat GraphQL  search-index.json
│                                                                │
└───────────────▲────────────────────────────────────────────────┘
                │ build & API
┌───────────────┴────────────────────────────────────────────────┐
│ Gateway Build Pipeline                                         │
│  1. Run introspection -> schema.json                           │
│  2. Scan /docs-content -> manifest.json                        │
│  3. Parse MDX -> AST summary -> (optional) embeddings export   │
│  4. Publish doc & schema chunks to Search Service              │
│  5. Emit docs bundle (webpack entry: docs)                     │
│  6. Serve static assets + dynamic theme CSS endpoint           │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│ Runtime Services                                               │
│  * Theme Service (DB: theme_tokens)                            │
│  * Chat Service (Messages, Threads, Embeddings)                │
│  * Rate Limit + Moderation Queue                               │
└────────────────────────────────────────────────────────────────┘
```

## 4. Content Model & Structure

Proposed directory inside `packages/gateway` (co-located for now):

```
src/client/docs/content/
  guides/
    authentication.mdx
    pagination.mdx
    rate-limits.mdx
  features/
    schema-change-tracking.mdx
    audit-log-extension.mdx
  get-started/
    _meta.json               # ordering + labels (optional)
    javascript.mdx
    python.mdx
    java.mdx
    dotnet.mdx
    php.mdx
  snippets/
    java/BasicQuery.java
    python/basic_query.py
  faq/
    common-issues.mdx
```

Each MDX file can declare frontmatter:

```mdx
---
title: 'Pagination'
description: 'Strategies to paginate large result sets'
category: 'Guides'
keywords: ['cursor', 'offset', 'connections']
order: 12
toc: true
---

# Pagination

<Callout type="info">Use cursor-based pagination for unbounded lists.</Callout>
```

## 4.1 Content Management Model (DB Backed – Ingestion Deferred)

To enable managing guides and feature docs from the Admin UI (instead of only editing repository files) we introduce a database-backed content layer. Actual search ingestion remains deferred per request; this section limits scope to authoring, revisioning, and publishing.

### Core Entities

| Entity                   | Purpose                                     | Notes                                                              |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| Document                 | Logical doc (slug, title, category, tags)   | Points to latest published revision.                               |
| DocumentRevision         | Versioned MDX content + frontmatter + state | States: DRAFT, IN_REVIEW, APPROVED, PUBLISHED, ARCHIVED.           |
| Category                 | Hierarchical grouping / ordering            | Supports future navigation auto-generation.                        |
| Navigation               | Custom tree (primary / footer)              | Stored as JSON (list & external links).                            |
| Asset                    | Uploaded media (images, diagrams)           | Stored in object storage with safe MIME validation.                |
| Snippet (optional later) | Reusable code sample per language           | Referenced via MDX component `<Snippet id="..." lang="python" />`. |

### Tables (Proposed – Simplified)

```
docs_documents(id, slug UNIQUE, title, category_id, status ENUM(ACTIVE,DEPRECATED), primary_revision_id, tags text[], created_at, updated_at)
docs_document_revisions(id, document_id, version int, state ENUM, mdx_raw text, frontmatter_json jsonb, headings jsonb, created_by, created_at, published_at)
docs_categories(id, name, slug UNIQUE, order_index int, parent_id)
docs_navigation(id, kind ENUM(PRIMARY,FOOTER), tree_json jsonb, updated_at)
docs_assets(id, document_id, filename, mime_type, size_bytes, storage_key, uploaded_by, created_at)
```

### Revision Workflow (No External Ingestion Yet)

1. Create Document → initial Revision (DRAFT)
2. Edit draft (save multiple times)
3. Submit for review → state IN_REVIEW
4. Approve → state APPROVED
5. Publish → state PUBLISHED (document.primary_revision_id updated)
6. Optional: Revert creates new DRAFT copying a previous revision

### Admin GraphQL (Excerpt)

```
type Doc { id: ID! slug: String! title: String! category: Category status: DocStatus! tags: [String!]! updatedAt: DateTime! revision: DocRevision! }
type DocRevision { id: ID! version: Int! state: RevisionState! mdxRaw: String! frontmatter: JSONObject headings: [Heading!]! createdBy: User! createdAt: DateTime! publishedAt: DateTime }
type Category { id: ID! name: String! slug: String! parent: Category path: [Category!] }
enum RevisionState { DRAFT IN_REVIEW APPROVED PUBLISHED ARCHIVED }
type Query { doc(slug: String!): Doc docs(limit:Int=50, after:String): DocConnection revision(id:ID!): DocRevision }
input CreateDocumentInput { slug:String! title:String! categoryId:ID mdxRaw:String! frontmatter:JSONObject }
input UpdateRevisionInput { revisionId:ID! mdxRaw:String frontmatter:JSONObject title:String tags:[String!] categoryId:ID }
type Mutation { createDocument(input:CreateDocumentInput!): DocRevision! updateRevision(input:UpdateRevisionInput!): DocRevision! submitRevisionForReview(revisionId:ID!): DocRevision! approveRevision(revisionId:ID!): DocRevision! publishRevision(revisionId:ID!): Doc! }
```

### MDX Compile (Deferred Ingestion)

On draft save or publish we compile MDX server-side to:

- Extract headings (H1–H3) + generate deterministic slugs
- Validate frontmatter (required: title)
- Count words / detect TODO markers

Compiled result stored with revision; portal runtime can still use static files until migration completes.

### Migration Strategy (Incremental Adoption)

1. Phase A: Keep existing file-based MDX; add DB-backed documents disabled behind feature flag.
2. Phase B: Enable creating new docs via admin; fallback to file system for legacy docs.
3. Phase C: Migration script: import existing MDX files → documents + revisions.
4. Phase D: Flip default: read from DB first, file fallback.
5. (Deferred) Add search ingestion & indexing events.

### Out of Scope (Explicitly Deferred)

- Search ingestion events / chunking
- Embedding generation
- Scheduled publishing
- Multi-version branching

## 4.2 Embedding Storage (pgvector)

Although embedding generation is still deferred for initial authoring rollout, we define storage now to avoid future breaking migrations.

### Tables

```
-- Document + FAQ + schema doc chunks unified in docs_embedding_chunks (also reiterated in Section 7)
-- (Created empty initially; rows appear once embedding jobs implemented.)
docs_embedding_chunks(
  id UUID PK,
  document_id UUID NULL,
  revision_id UUID NULL,
  doc_slug text,
  source ENUM('DOC','SCHEMA','FAQ'),
  anchor text NULL,
  content_text text,
  token_count int,
  embedding vector(1536) NULL,
  meta jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Migration Notes

- Execute `CREATE EXTENSION IF NOT EXISTS vector;` (idempotent) before creating table with `vector` column.
- Initial deploy can omit ivfflat index; add once row count > ~1k for performance.
- Keep `embedding` nullable so we can pre-insert chunk metadata before embedding job completes.

### TypeORM Entity Sketch

```ts
@Entity({ name: 'docs_embedding_chunks' })
export class DocEmbeddingChunk {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ nullable: true }) documentId?: string;
  @Column({ nullable: true }) revisionId?: string;
  @Column() docSlug!: string;
  @Column({ type: 'enum', enum: ['DOC', 'SCHEMA', 'FAQ'] }) source!: 'DOC' | 'SCHEMA' | 'FAQ';
  @Column({ nullable: true }) anchor?: string;
  @Column('text') contentText!: string;
  @Column('int') tokenCount!: number;
  @Column({ type: 'vector', nullable: true, transformer: vectorTransformer }) embedding: number[] | null = null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) meta!: Record<string, any>;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

// Example transformer (serialize number[] -> Postgres vector)
export const vectorTransformer = {
  to: (value?: number[] | null) => value ?? null,
  from: (val: any) => (val ? (Array.isArray(val) ? val : JSON.parse(val)) : null)
};
```

### Query Helper (Repository Pseudocode)

```ts
// Retrieve top-k chunks for an embedding vector (float[] length=DIM)
await dataSource.query(
  `SELECT id, doc_slug, anchor, 1 - (embedding <=> $1) AS score
   FROM docs_embedding_chunks
   WHERE source = 'DOC' AND embedding IS NOT NULL
   ORDER BY embedding <=> $1
   LIMIT $2`,
  [vector, k]
);
```

### Future Considerations

- Possible split into separate table for schema if size or access patterns diverge.
- Add `last_embedded_model` column if multiple models used sequentially.
- Add partial index on `(source)` for faster filtering if row count becomes very large.

---

### Manifest Generation

Script `scripts/generate-docs-manifest.ts`:

1. Recursively scan `src/client/docs/content` for `.mdx`.
2. Extract frontmatter (fallback to derived values).
3. Produce `src/client/docs/manifest.json`:
   ```json
   [
     {
       "id": "guides/pagination",
       "title": "Pagination",
       "path": "/guides/pagination",
       "category": "Guides",
       "order": 12,
       "keywords": ["cursor", "offset", "connections"]
     }
   ]
   ```
4. Provide stable ordering (category asc, order asc, title asc).
5. Optionally create a lightweight heading index (H2/H3) per doc for on-page ToC and search weighting.

## 5. MDX Tooling & Build Integration

### Dependencies (add to `devDependencies`)

```
@mdx-js/loader
@mdx-js/mdx
remark-gfm
remark-frontmatter
remark-mdx-frontmatter
rehype-slug
rehype-autolink-headings
rehype-pretty-code (optional) OR prismjs/highlight.js solution
```

### Webpack Rule Addition

Add before existing TS rule if necessary (so MDX passes through Babel/TS pipeline only for embedded TSX if we choose):

```js
{
  test: /\.mdx?$/,
  include: path.resolve(__dirname, 'src/client/docs/content'),
  use: [
    {
      loader: 'babel-loader', // if not already present; optional
      options: { presets: ['@babel/preset-react','@babel/preset-typescript'] }
    },
    {
      loader: '@mdx-js/loader',
      options: {
        remarkPlugins: [require('remark-gfm'), require('remark-frontmatter'), require('remark-mdx-frontmatter')],
        rehypePlugins: [require('rehype-slug'), require('rehype-autolink-headings')]
      }
    }
  ]
}
```

Type declaration (`src/client/types/mdx.d.ts`):

```ts
declare module '*.mdx' {
  import { ComponentType } from 'react';
  const MDXComponent: ComponentType<any>;
  export default MDXComponent;
  export const frontmatter: Record<string, any>;
}
```

### Rendering

Wrap docs root with `<MDXProvider components={customComponents}>` from `@mdx-js/react`.

`customComponents` includes mapping: `h2`, `h3`, `code`, `pre`, plus bespoke ones:

- `<Callout type="info|warn|danger">`
- `<LangTabs languages={["ts","python"]}>` (renders code toggle)
- `<TryIt operation="MutationName" variables={{...}} />` (invokes gateway `/graphql` in sandbox panel)
- `<SchemaLink type="User">` (scrolls / navigates to type reference)

## 6. Schema Explorer

### Build Step

Script `scripts/introspect-schema.ts`:

1. Start (or call running) gateway server locally.
2. Run an introspection query (minimized) using `graphql` package.
3. Output `src/client/docs/generated/schema.json` and `schema.graphql`.
4. Provide hash to detect staleness; fail CI if diff > threshold for locked versions.

### Client

- Parse `schema.json` once, build an in-memory index: types by name, fields, args, descriptions, directives.
- Provide left panel filters: Object / Interface / Input / Enum / Scalar.
- Link MDX references via `<SchemaLink>`.
- Lazy load this module to keep initial docs payload slim.

## 7. Search & Retrieval (pgvector Hybrid)

### Rationale

We internalize semantic retrieval using Postgres + pgvector (already part of gateway infrastructure) to avoid an external search dependency and enable tighter integration with chat retrieval. We keep an optional remote Search Service fallback (feature flag: `DOCS_REMOTE_SEARCH=on`) during migration for lexical ranking or phased cutover.

### High-Level Data Flow

```
Publish (Doc Revision PUBLISHED) --> enqueue embedding job --> chunk & embed --> store in docs_embedding_chunks --> ivfflat indexes --> vector + (optional lexical) query at runtime
```

### Chunking Strategy

1. Extract headings (H1–H3) as structural boundaries.
2. Merge sequential paragraphs until ~800 characters or ~180 tokens.
3. Include small code blocks (<= 40 lines). Truncate longer blocks; store hash/first lines in `meta`.
4. Add frontmatter summary chunk (weight boost in ranking).
5. Schema: each type description + each field signature & description become independent chunks (source = SCHEMA).

### Ranking Heuristics

Base score = cosine similarity (1 - distance). Adjust:

- +0.05 if heading text fuzzy-matches query tokens.
- +0.03 if category in preferred set (Guides, Get Started) for high-ambiguity queries.
- Time decay: score \*= (0.9 ^ quarters_old) unless revision updated within last 30 days.

### Tables (New / Revised)

```
docs_embedding_chunks(
  id UUID PK,
  document_id UUID NULL,
  revision_id UUID NULL,
  doc_slug text,
  source ENUM('DOC','SCHEMA','FAQ'),
  anchor text NULL,
  content_text text,
  token_count int,
  embedding vector(1536) NULL,
  meta jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

schema_embedding_chunks(
  id UUID PK,
  type_name text,
  field_name text NULL,
  description text,
  embedding vector(1536) NULL,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);
```

Required extension: `CREATE EXTENSION IF NOT EXISTS vector;`

Indexes:

```
CREATE INDEX IF NOT EXISTS docs_embedding_chunks_embedding_idx ON docs_embedding_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS docs_embedding_chunks_doc_slug_idx ON docs_embedding_chunks (doc_slug);
CREATE INDEX IF NOT EXISTS schema_embedding_chunks_embedding_idx ON schema_embedding_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

### Embedding Workflow

State: When a revision becomes PUBLISHED -> enqueue job if content hash changed.
Job steps:

1. Fetch revision MDX & frontmatter.
2. Convert to AST -> extract plain text segments.
3. Chunk (as above) & compute token counts.
4. Batch embed (model dimension configurable via `DOCS_EMBEDDING_DIM=1536`).
5. Upsert rows (delete stale chunks for that revision).
6. Emit `DOC_EMBEDDED` event (future analytics / cache purge).

Full rebuild script `rebuild-embeddings.ts` truncates + reprocesses for model upgrades.

### Query Patterns

Vector only (search):

```sql
SELECT doc_slug, anchor, content_text, 1 - (embedding <=> $1) AS score
FROM docs_embedding_chunks
WHERE source = 'DOC'
ORDER BY embedding <=> $1
LIMIT 20;
```

Hybrid (vector + lexical booster):

```sql
WITH vector_hits AS (
  SELECT id, doc_slug, anchor, 1 - (embedding <=> $1) AS vscore
  FROM docs_embedding_chunks
  WHERE source = 'DOC'
  ORDER BY embedding <=> $1
  LIMIT 40
), lexical AS (
  SELECT id, doc_slug, anchor, 0.15 AS lscore
  FROM docs_embedding_chunks
  WHERE content_text ILIKE '%' || $2 || '%'
  LIMIT 40
)
SELECT doc_slug, anchor,
       MAX(vscore + COALESCE(lscore,0)) AS score
FROM (
  SELECT * FROM vector_hits
  UNION ALL
  SELECT * FROM lexical
) h
GROUP BY doc_slug, anchor
ORDER BY score DESC
LIMIT 10;
```

Chat retrieval: run top-k (e.g. 8 doc + 4 schema) vector queries; union; rerank by diversity (penalize chunks from same heading when >2 already selected).

### Client Query Flow

1. Debounced input.
2. If `DOCS_REMOTE_SEARCH=on`, optionally call remote service in parallel (race; merge results if remote returns higher lexical precision for very short queries (<3 tokens)).
3. Default path: embed query -> vector search -> group and display top snippet per doc.
4. Selecting result navigates `/#/path#anchor`.

### Fallback Modes

| Scenario                   | Fallback                                                                     |
| -------------------------- | ---------------------------------------------------------------------------- |
| pgvector extension missing | Log critical & disable vector search; fallback to manifest substring filter. |
| No embeddings for doc      | Skip doc until job completes (show clock icon).                              |
| Embedding provider down    | Use last known cached embeddings or remote service if enabled.               |
| Query embed failure        | Attempt lexical only; surface warning metric.                                |

### Telemetry & Security

- Log: query latency (vector milliseconds), result count, zero-hit, % lexical fallback usage.
- Rate limit embeddings per minute (avoid abuse of embedding endpoint if proxying external model).
- Strip excessively long single tokens (>256 chars) before embedding to prevent prompt injection artifacts.

### Future Enhancements

- Reranking model (e.g. cross-encoder) after initial vector shortlist.
- Category facet weighting stored in config table.
- Per-user personalization (boost docs previously visited).
- Automatic synonym expansion using embedding neighborhood clustering.

### Embedding Provider Configuration

We externalize model + endpoint configuration so different environments (dev using Ollama/local, prod using OpenAI/Azure/OpenRouter) can reuse the same pipeline.

| Field                | Source                         | Description                                                                |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| embedding_provider   | DB config table (fallback ENV) | Identifier e.g. `openai`, `azure`, `ollama`                                |
| embedding_model      | DB config                      | Model name e.g. `text-embedding-3-small`, `nomic-embed-text`               |
| embedding_api_base   | DB config                      | Base URL (e.g. `https://api.openai.com/v1` or `http://localhost:11434/v1`) |
| embedding_api_key    | Encrypted at rest (KMS)        | Secret token (not returned to clients)                                     |
| embedding_timeout_ms | DB/ENV                         | Request timeout for embedding calls                                        |
| embedding_batch_size | DB/ENV                         | Max chunk batch per API call                                               |

Implementation Notes:

- Reuse existing `settings` table (entity: `Setting`) with namespaced keys `docs.embedding.*` – no new table required.
  - Keys (required unless noted):
    - `docs.embedding.provider` (string)
    - `docs.embedding.model` (string)
    - `docs.embedding.apiBase` (string)
    - `docs.embedding.apiKey` (string, secret; may be omitted if provider = `ollama`)
    - `docs.embedding.timeoutMs` (number, default 10000)
    - `docs.embedding.batchSize` (number, default 32)
    - `docs.embedding.dim` (number, default 1536)
  - Secrets Handling: treat any key ending with `.apiKey` as secret (mask in logs / GraphQL). Future enhancement: add `isSecret` column to `settings` for formalization.
- Store `embedding_api_key` using envelope encryption; in DB keep only ciphertext + key id reference.
- `generate-embeddings.ts` and `rebuild-embeddings.ts` fetch config once; fail fast with actionable error if missing required fields.
- Allow overriding via environment variables for local dev (`DOCS_EMBEDDING_API_KEY`, `DOCS_EMBEDDING_API_BASE`, etc.).
- Support pluggable adapters: interface `EmbeddingProvider.embed(texts: string[]): Promise<number[][]>` implemented per provider.

Pseudocode Adapter Registration:

```ts
const providers: Record<string, EmbeddingProvider> = {
  openai: new OpenAIProvider({ apiKey, baseUrl, model }),
  ollama: new OllamaProvider({ baseUrl, model }),
  azure: new AzureOpenAIProvider({ apiKey, baseUrl, deployment: model })
};
const provider = providers[config.embedding_provider];
if (!provider) throw new Error('Unsupported embedding_provider');
```

Failure Handling:

- If provider unavailable (network / 5xx), mark job attempt failed with exponential backoff (max retries 6) and alert after final.
- Partial batch failures: re-queue only failed chunk subset.

### Removal Plan for Remote Service

Once relevance parity validated (A/B logs show CTR delta <2% over 2 weeks) retire `publish-docs-to-search.ts` and disable remote ingestion.

## 8. Public Chat Q&A

### Objectives

- Users can ask free-form API questions.
- System retrieves relevant doc passages + schema elements.
- LLM drafts answer; user sees references (citations) linking to doc sections.
- Moderation: configurable auto-publish or queue.

### Minimal GraphQL Schema (conceptual)

```graphql
type ChatMessage {
  id: ID!
  role: String! # user | assistant | system
  content: String!
  createdAt: DateTime!
  citations: [Citation!]!
  threadId: ID!
}

type Citation {
  docId: String!
  anchor: String
  score: Float
}

type Thread {
  id: ID!
  createdAt: DateTime!
  messages: [ChatMessage!]!
}

type Query {
  thread(id: ID!): Thread
}
type Mutation {
  postQuestion(threadId: ID, content: String!): Thread
}
type Subscription {
  threadUpdates(threadId: ID!): ChatMessage
}
```

### Processing Pipeline

1. User submits question.
2. Rate limit (IP + user account + sliding window) + abuse filters.
3. Embed question (e.g. OpenAI, local model) -> vector search over: doc chunk embeddings + schema field embeddings + FAQ curated embeddings.
4. Compose context prompt (top N spans) + system guardrails.
5. Call LLM (server side). Store raw answer + references.
6. Optionally perform PII mask + policy check; if flagged => hold for manual moderation.
7. Stream tokens to client via SSE or GraphQL Yoga subscription.

### Data Storage

- `chat_threads` (id, created_at)
- `chat_messages` (id, thread_id, role, content, created_at, citations JSONB, status ENUM)
- `doc_embeddings` (id, doc_id, anchor, vector, meta JSONB)
- `schema_embeddings` (id, type_name, field_name, vector, meta JSONB)

### Security

- Hard character limit per message (e.g. 2k chars).
- Profanity / injection filter (strip GraphQL introspection attempts if disallowed publicly).
- Observability: log question, chosen context spans, token usage.

## 9. White‑Label / Theming System

### Token Strategy

- Define a **design token schema** (JSON) with categories: `color`, `spacing`, `radius`, `font`, `shadow`.
- Persist user-edited tokens in DB table `theme_tokens(theme_id, name, value, category, updated_at)`.
- Provide a server endpoint `/docs-theme.css?tenant=<id>` (or `/api/theme/:tenant`) that:
  1. Fetches tokens.
  2. Emits a CSS file: `:root { --color-bg: #0d1117; --space-sm: 4px; }`.
- Docs HTML `<head>` loads this stylesheet dynamically before hydration (inject link tag). Fallback to default tokens if request fails.

### Live Preview in Admin

- Admin UI editing panel renders `<iframe src="/docs?previewTheme=<tempId>" />`.
- On token change, push updated token JSON to a preview endpoint that maps to ephemeral cache (Redis) keyed by `tempId`.
- Docs page, if `previewTheme` query param present, fetches preview token set instead of persisted theme.

### Extensible Component Slots

Expose React context: `DocsThemeContext { tokens, setOverride }` so MDX components or future plugins can adapt.

## 10. Security & Compliance Considerations

| Area                       | Control                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| XSS in MDX                 | Only allow whitelisted components; sanitize raw HTML if enabling `mdxOptions.allowDangerousHtml` (prefer disabled).  |
| Chat Abuse                 | Rate limiting, moderation queue, content filtering, captchas after threshold.                                        |
| Data Privacy               | Option to disable storing user IP; configurable retention for chat logs.                                             |
| Schema Leakage             | Limit explorer for unauthenticated users (optional) via filtered introspection result.                               |
| Theme Injection            | Validate token values against regex (hex colors, numeric units) to block `url(javascript:...)`.                      |
| Embedding Provider Secrets | Encrypt `embedding_api_key` at rest; never expose via GraphQL; rotate via admin CLI; restrict logs to hashed key id. |

## 11. Implementation Phases

### Phase 0 (Scaffold) — COMPLETE ONCE MERGED

- MDX loader + type declarations.
- Basic navigation (manual manifest or auto generation script).
- Rendering with custom components stub.

### Phase 1 (MVP)

- Manifest generation script.
- Schema introspection build script.
- Remote search integration (basic query + grouping).
- Theming: static tokens + server CSS endpoint.

### Phase 2

- Admin theme editor (CRUD + live preview iframe).
- Chat backend (question, retrieval, answer streaming) + minimal UI.
- Code snippet language switcher.
- On-page ToC & deep linking (heading anchors).

### Phase 3

- Semantic search blending lexical + embedding scores.
- Chat moderation workflow & analytics dashboard.
- Multi-version docs (v1, nightly) using folder segmentation and version switcher.
- Offline pre-render / static export mode.

### Phase 4 (Nice-to-haves)

- Collaborative MDX editor.
- CLI for scaffolding new doc pages with standard frontmatter.
- Dark/light auto theme + custom theme marketplace.

## 12. Key Scripts (Proposed)

| Script                      | Purpose                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `generate-docs-manifest.ts` | Produce manifest.json from content tree.                                                          |
| `introspect-schema.ts`      | Create schema.json & SDL snapshot.                                                                |
| `publish-docs-to-search.ts` | (Legacy / transitional) Ingest chunks into remote Search Service (to be retired).                 |
| `generate-embeddings.ts`    | Incrementally embed newly published or changed revisions + schema deltas (reads provider config). |
| `rebuild-embeddings.ts`     | Full re-embed (model upgrade / dimension change, verifies provider config consistency).           |
| `verify-pgvector-health.ts` | Diagnostics: extension present, index counts, sample latency.                                     |
| `validate-tokens.ts`        | Lint theme tokens for unsafe values.                                                              |

## 13. Sample `generate-docs-manifest.ts` Sketch

```ts
import { globby } from 'globby';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';

async function run() {
  const base = path.resolve(__dirname, '../src/client/docs/content');
  const files = await globby('**/*.mdx', { cwd: base });
  const entries = files.map((f) => {
    const raw = fs.readFileSync(path.join(base, f), 'utf8');
    const { data } = matter(raw);
    const slug = f.replace(/\\.mdx$/, '');
    return {
      id: slug,
      title: data.title || slug.split('/').pop(),
      path: '/' + slug,
      category: data.category || 'General',
      order: data.order || 0,
      keywords: data.keywords || []
    };
  });
  entries.sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order || a.title.localeCompare(b.title));
  fs.writeFileSync(path.join(base, '../manifest.json'), JSON.stringify(entries, null, 2));
}
run();
```

## 14. MDX Component Contract Examples

```tsx
// Callout.tsx
export const Callout: React.FC<{ type?: 'info' | 'warn' | 'danger'; title?: string }> = ({
  type = 'info',
  title,
  children
}) => (
  <div className={`callout callout-${type}`}>
    {' '}
    {title && <strong>{title}</strong>} <div>{children}</div>{' '}
  </div>
);

// LangTabs.tsx (pseudocode)
export const LangTabs: React.FC<{ languages: string[] }> = ({ languages, children }) => {
  /* map children by language */
};
```

## 15. Theming Technical Details

- Maintain canonical token JSON shape:
  ```json
  {
    "color.bg": { "value": "#0d1117", "type": "color" },
    "color.text": { "value": "#e6edf3", "type": "color" },
    "radius.sm": { "value": "4px", "type": "radius" }
  }
  ```
- Resolver flattens into CSS variables: `--color-bg`, `--radius-sm`.
- Admin UI performs optimistic updates; on save issues `updateThemeTokens(themeId, tokens)` mutation.
- Provide token diff preview (compare against default baseline).

## 16. Performance Considerations

- Split docs bundle: `docs~core`, `docs~schema`, `docs~chat` (dynamic import when user opens those panels).
- Search index kept < 200KB gzipped via truncating large code blocks & minifying JSON.
- Optional service worker caches static assets + index.

## 17. Observability

- Instrument page view (doc id), search query latency, chat answer latency, theme load success/fail.
- Redact PII in logs (only hashed IP if needed for abuse detection).

## 18. Risks & Mitigations

| Risk                   | Impact            | Mitigation                                          |
| ---------------------- | ----------------- | --------------------------------------------------- |
| Loader complexity      | Build instability | Keep MDX pipeline minimal; snapshot lock versions   |
| Chat abuse             | Resource drain    | Strict rate limits + captcha escalation             |
| Token injection attack | CSS exfiltration  | Validate + whitelist allowed value patterns         |
| Schema drift           | Stale explorer    | CI fails if `schema.graphql` changes without commit |

## 19. AI / LLM Integration Strategy

- Provide deterministic retrieval context (top k=6 doc+schema spans, total < 6k tokens).
- Maintain conversation memory truncated by token budget.
- Summarize long threads (background job) to reduce future prompt size.

## 20. Developer AI Prompt (Reusable)

Copy/paste + adapt when asking an AI tool to scaffold or extend the docs portal.

```
You are assisting with the Gateway Documentation Portal.
Context: We use Webpack + React 18 + MDX (@mdx-js/react). We need white-label theme tokens, manifest-driven navigation, schema explorer (introspection JSON), search index (headings + code), and optional public chat (retrieval augmented) over MDX + schema content.

Task: <INSERT OBJECTIVE>

Constraints:
1. MDX files in src/client/docs/content.
2. Manifest is generated (manifest.json) – do not hardcode nav if generation exists.
3. Use provided token CSS variables (fallback to defaults if missing).
4. Avoid large new dependencies unless justified (explain).
5. Ensure components are tree-shake friendly and code split where heavy.

Deliverables: Updated/added files, brief rationale, note follow-up test stubs.
```

## 21. Acceptance Criteria (Phase 1)

- Running `npm run build:admin` produces a `docs` bundle with at least one MDX page rendering.
- Manifest auto-generates from ≥3 MDX sample files.
- Schema explorer loads types from generated `schema.json` (list + detail view for at least object & enum types).
- Theme tokens can be overridden via temporary JSON file (prior to DB integration) delivered as CSS vars.
- Search returns at least one remote result referencing a doc anchor (verified against Search Service) OR (if `DOCS_REMOTE_SEARCH=off`) vector search disabled clearly with fallback notice.

### Additional (Phase 2.5 – Vector Search Rollout)

- pgvector extension present; `docs_embedding_chunks` table exists (verified via migration).
- Running `node scripts/generate-embeddings.ts` after publishing a doc creates ≥1 row with non-null `embedding`.
- Search (with `DOCS_VECTOR_SEARCH=on`) returns ranked results using vector similarity (inspect logs with scores > 0.5).
- Chat retrieval pipeline logs chunk IDs drawn from embedding table.
- Remote service path can be toggled off without breaking search UI (graceful fallback message for lexical only if embeddings absent).
- Embedding provider configuration present (API base + model + encrypted key) or local adapter (ollama) reachable; scripts fail fast if missing.

## 22. Future Enhancements (Backlog)

- Multi-tenant theme resolution by `Host` header / API key.
- MDX lint rules (frontmatter completeness, link validity, code sample language tag enforcement).
- Graph visualizer of service stitched subgraphs.
- Rate limit analytics panel surfaced inside docs (read-only for public, richer for authenticated users).

## 23. Getting Started (Contributor Quickstart)

```
pnpm install
pnpm run dev:admin   # Serves /docs as well

# In another shell (ensure gateway server running for schema introspection)
node scripts/introspect-schema.ts
node scripts/generate-docs-manifest.ts
node scripts/publish-docs-to-search.ts

# Edit / add MDX under src/client/docs/content and hot reload
```

## 24. Open Questions

- Do we enforce authenticated mode for chat (reduce spam) or allow anonymous with captcha? (TBD)
- Embedding provider: internal vector DB vs external service? (Pilot: SQLite FTS or simple cosine over in-memory vectors.)
- Versioning strategy triggers (semantic version check of schema). (Phase 3 design.)

---

_End of spec – treat as living document; update when architectural decisions change._
