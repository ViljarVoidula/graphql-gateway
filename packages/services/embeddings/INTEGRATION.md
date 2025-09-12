# Embeddings Service Integration Guide

This document provides a guide for integrating with the Embeddings Service. It covers the main GraphQL resolvers for managing index configurations and generating powerful, hybrid query embeddings.

## GraphQL API

The primary interface for the service is the GraphQL endpoint.

- **Endpoint**: `/graphql`

### Core Mutations

#### 1. `upsertIndexConfig`

This mutation creates or updates the configuration for a search index. This configuration is used by downstream services (like the Search Service) to understand the data schema and how to handle vector search.

**Arguments:**

- `applicationId` (String!): A unique identifier for the application or index.
- `tenantId` (String): An optional identifier for multi-tenant scenarios.
- `indexSchema` (JSON!): A JSON object defining the schema of the documents to be indexed.
- `vectorFields` ([VectorFieldInput!]!): An array defining the vector fields, their dimensions, and default weights.

**Example:**

```graphql
mutation UpsertConfig {
  upsertIndexConfig(input: {
    applicationId: "e-commerce-app"
    tenantId: "tenant-123"
    indexSchema: {
      "doc_title": "string",
      "description": "string",
      "price": "float"
    }
    vectorFields: [
      { name: "title_embedding", dimensions: 768, weight: 1.5 },
      { name: "description_embedding", dimensions: 768, weight: 1.0 }
    ]
  }) {
    id
    applicationId
    tenantId
    vectorFields {
      name
      weight
      dimensions
    }
  }
}
```

#### 2. `buildQueryEmbedding`

This is the most powerful mutation for generating query embeddings. It supports hybrid queries that can combine signals from weighted keywords, raw text, and images, each with their own specified weight.

**Input (`QueryEmbeddingInput`):**

- `terms` ([TermWeightInput]): A list of keywords with associated weights. These are combined into a single vector.
- `weightedTexts` ([WeightedTextInput]): A list of text snippets, each with a weight. Each snippet becomes a separate vector in the combination.
- `weightedImages` ([WeightedImageInput]): A list of image URLs, each with a weight. Each image is fetched and embedded.
- `textModelName` (String): Optional. Override the default model for text and term embeddings.
- `imageModelName` (String): Optional. Override the default model for image embeddings.
- `strategy` (String): The method for combining the component vectors.
  - `WEIGHTED_SUM` (default): Vectors are multiplied by their weights and then summed.
  - `MEAN`: A weighted average of the component vectors.
- `normalize` (Boolean): If `true` (default), the final combined vector is L2-normalized.

**Example Hybrid Query:**

This query searches for "modern armchair" with high importance, gives less importance to the color "blue", and adds a visual signal from an image of a specific style of chair.

```graphql
mutation BuildHybridQuery {
  buildQueryEmbedding(
    input: {
      weightedTexts: [
        { text: "modern armchair", weight: 1.5 }
        { text: "blue", weight: 0.5 }
      ]
      weightedImages: [
        {
          imageUrl: "https://example.com/images/eames-lounge-chair.jpg"
          weight: 1.0
        }
      ]
      strategy: WEIGHTED_SUM
      normalize: true
      # Optionally override the model for this specific query
      textModelName: "Marqo/marqo-ecommerce-embeddings-L"
    }
  ) {
    dimension
    strategy
    valuesSample
    components {
      type
      key
      weight
      count
    }
  }
}
```

### Other Resolvers

The service also provides simpler resolvers for basic embedding tasks and model management:

- `textEmbedding(text: String!, modelName: String)`: Get an embedding for a single piece of text.
- `imageUrlEmbedding(imageUrl: String!, modelName: String)`: Get an embedding for a single image.
- `models`: List all available models and their status (loaded, active).
- `loadModel(name: String!)`: Load a model into memory.
- `setActiveModel(name: String!)`: Set a loaded model as the default for its type.

## Performance: MessagePack Responses

For large embedding vectors, JSON can be verbose. The service supports returning responses in the more compact MessagePack format to reduce payload size and improve deserialization speed.

**How to Enable:**

To receive a MessagePack response, include the following HTTP header in your request:

```
x-msgpack-enabled: 1
```

The `Content-Type` of the response will be `application/x-msgpack`.

**Example with `curl`:**

This example sends a GraphQL query and requests a MessagePack response. The binary output is piped to `msgpack-cli` for human-readable inspection.

First, ensure you have `msgpack-cli` installed:

```bash
pip install msgpack-cli
```

Then, run the `curl` command:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-msgpack-enabled: 1" \
  -d '{"query": "query { textEmbedding(text: \"hello world\") { dimension valuesSample } }"}' \
  http://localhost:9010/graphql \
  --output - | msgpack-cli decode
```

**Expected Output:**

The `msgpack-cli` tool will decode the binary stream and print the JSON equivalent:

```json
{
  "data": {
    "textEmbedding": {
      "dimension": 768,
      "valuesSample": [
        0.0123, -0.0456, 0.0789, ...
      ]
    }
  }
}
```

Your client application will need a MessagePack library to parse the binary response directly, which is significantly more efficient than parsing JSON text.
