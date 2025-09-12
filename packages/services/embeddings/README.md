# Embeddings Service

Python FastAPI + GraphQL service for managing embedding models and application index configurations used by the Search service.

## Features

- GraphQL endpoint at `/graphql` (queries + mutations)
- Manage application index configurations (schema, vector field weights, custom query weights)
- Manage system models (load, list, activate)
- Generate text and image embeddings (CLIP + sentence-transformers)
- Dynamic weighted term embedding construction
- MongoDB persistence for configs and models
- Integration stub for pushing index configs to Search service

## Environment Variables

| Variable                     | Default                              | Description                                      |
| ---------------------------- | ------------------------------------ | ------------------------------------------------ |
| `MONGODB_URI`                | `mongodb://localhost:27017`          | Mongo connection string                          |
| `MONGODB_DB`                 | `embeddings`                         | Database name                                    |
| `SEARCH_SERVICE_URL`         | `http://localhost:8080`              | Base URL of search service                       |
| `MODELS_CACHE_DIR`           | `.models-cache`                      | Local directory for downloaded models            |
| `TEXT_MODEL_NAME`            | `Marqo/marqo-ecommerce-embeddings-B` | Default text model (auto preloaded)              |
| `ALT_LARGE_TEXT_MODEL_NAME`  | `Marqo/marqo-ecommerce-embeddings-L` | Optional larger text model (lazy)                |
| `IMAGE_MODEL_NAME`           | `ViT-B-32`                           | CLIP / OpenCLIP model id                         |
| `IMAGE_MODEL_PRETRAINED`     | `laion2b_s34b_b79k`                  | OpenCLIP pretrained tag                          |
| `USE_TEXT_MODEL_FOR_IMAGES`  | `false`                              | Reuse Marqo text (CLIP) model for image vectors  |
| `DEVICE`                     | `cpu`                                | Inference device (`cpu`, `cuda`, `cuda:0`, etc.) |
| `HUGGINGFACE_TOKEN`          | _empty_                              | Private model access token                       |
| `HF_HOME`                    | _empty_                              | HuggingFace cache root (overrides default)       |
| `DEFAULT_QUERY_STRATEGY`     | `WEIGHTED_SUM`                       | Default multi-signal combine strategy            |
| `ENABLE_QUERY_NORMALIZATION` | `true`                               | Whether final query vectors are L2-normalized    |

## .env Support

All configuration can be set via a local `.env` file (auto-loaded). Example:

```dotenv
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=embeddings
SEARCH_SERVICE_URL=http://localhost:8080
MODELS_CACHE_DIR=.models-cache
TEXT_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
ALT_LARGE_TEXT_MODEL_NAME=Marqo/marqo-ecommerce-embeddings-L
IMAGE_MODEL_NAME=ViT-B-32
IMAGE_MODEL_PRETRAINED=laion2b_s34b_b79k
USE_TEXT_MODEL_FOR_IMAGES=false
DEVICE=cpu
HUGGINGFACE_TOKEN=
HF_HOME=.hf-cache
DEFAULT_QUERY_STRATEGY=WEIGHTED_SUM
ENABLE_QUERY_NORMALIZATION=true
```

Copy `.env.example` to `.env` and adjust.

## Quick Start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 9000
```

Open GraphQL Playground at: http://localhost:9000/graphql

## Sample GraphQL Operations

````graphql
mutation UpsertConfig {
  upsertIndexConfig(input: {
    applicationId: "app-1"
    indexSchema: { json: "{\\n  \\\"title\\\": \\\"string\\\"\n}" }
    vectorFields: [ { name: "title_vector", dimensions: 768, weight: 1.0 } ]
  }) { id applicationId vectorFields { name weight } }
}

query ListModels { models { id name active loaded } }

mutation LoadModel { loadModel(name: "sentence-transformers/all-MiniLM-L6-v2") { id name loaded } }

query WeightedEmbeddingListInput {
  weightedQueryEmbedding(weights: [
    { term: "watch", weight: 2 }, { term: "red", weight: 1 }, { term: "pink", weight: -1 }
  ]) { dimension valuesSample }
}

query WeightedEmbeddingMapInput {
  weightedQueryEmbeddingFromMap(weightsMap: { watch: 2, red: 1, pink: -1 }) { dimension valuesSample }
}

Note: Weighted query embeddings are computed on-the-fly and NOT persisted with index configs.

### Combined Query Embedding Mutation (for Search Service)
```graphql
mutation BuildQueryEmbedding {
  buildQueryEmbedding(input: {
    terms: [ { term: "watch", weight: 2 }, { term: "red", weight: 1 }, { term: "pink", weight: -1 } ]
    texts: ["luxury chronograph"],
    imageUrls: ["https://example.com/watch.jpg"],
    strategy: WEIGHTED_SUM,
    normalize: true
  }) {
    dimension
    valuesSample
    strategy
    components { type key count weight }
  }
}
````

Inputs:

- `terms` – weighted term bag producing a single internally aggregated term vector.
- `texts` – raw text snippets (each becomes a component).
- `imageUrls` – remote images -> CLIP embeddings.
- `strategy` – `WEIGHTED_SUM` (default) or `MEAN` across component vectors.
- `normalize` – final L2 normalization.

Response includes component metadata for traceability.

```

## Integration With Search Service
`app/integration/search.py` contains a placeholder `push_index_config_to_search` that can be expanded to call the actual Rust search service ingestion/config endpoint once defined.

## Notes
* Initial implementation prioritizes interfaces + persistence + model management; optimize performance later (batched loading, GPU offloading, quantization, caching).
* Add auth / multi-tenant controls as needed; currently open.
```
