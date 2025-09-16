// k6 benchmark: embeddings generation & query embedding construction
// -------------------------------------------------
// Mix of simple textEmbedding queries and buildQueryEmbedding mutations.
// Focuses on latency + throughput of embedding service routed via gateway.
//
// Environment vars:
//   EMBED_TEXTS="winter jacket,red boots,green shirt,denim jeans,leather bag"
//   EMBED_MODEL="Marqo/marqo-ecommerce-embeddings-B"  (optional)
//   VU=20 DURATION=1m
//   BUILD_RATIO=0.3   # fraction of requests using buildQueryEmbedding
//
// Example:
//   BUILD_RATIO=0.5 VU=30 k6 run src/benchmarks/embeddings-batch.js
//
// NOTE: Adjust GraphQL field names if gateway schema differs from embeddings service schema.

import { Counter, Trend } from 'k6/metrics';
import { gql, pick, sleepJitter } from './utils.js';

export const options = {
  vus: Number(__ENV.VU || 15),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_duration: ['p(90)<500', 'p(95)<700'],
    http_req_failed: ['rate<0.02']
  }
};

const EMBED_TEXTS = (
  __ENV.EMBED_TEXTS || 'winter jacket,red boots,green shirt,denim jeans,leather bag,blue hoodie,merino scarf'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MODEL = __ENV.EMBED_MODEL; // optional
const BUILD_RATIO = Number(__ENV.BUILD_RATIO || 0.3); // probability of buildQueryEmbedding mutation

const TEXT_EMBED_QUERY = `query TextEmbedding($text:String!, $modelName:String){
  textEmbedding(text:$text, modelName:$modelName){ dimension valuesSample }
}`;

const BUILD_QUERY = `mutation BuildQueryEmbedding($input: QueryEmbeddingInput!){
  buildQueryEmbedding(input:$input){ dimension strategy components { type weight } }
}`;

const embedLatency = new Trend('embedding_latency');
const buildLatency = new Trend('query_embedding_latency');
const textCount = new Counter('embedding_text_requests');
const buildCount = new Counter('embedding_build_requests');

function buildWeightedInput(texts) {
  // Randomly choose 2-3 texts with weights
  const shuffled = [...texts].sort(() => Math.random() - 0.5);
  const pickCount = 2 + Math.floor(Math.random() * 2); // 2-3
  const weightedTexts = shuffled.slice(0, pickCount).map((t, i) => ({ text: t, weight: 1 + i * 0.25 }));
  return {
    weightedTexts,
    strategy: Math.random() < 0.5 ? 'WEIGHTED_SUM' : 'MEAN',
    normalize: true,
    textModelName: MODEL || undefined
  };
}

export default function () {
  const doBuild = Math.random() < BUILD_RATIO;
  if (doBuild) {
    const vars = { input: buildWeightedInput(EMBED_TEXTS) };
    const started = Date.now();
    gql({ query: BUILD_QUERY, operationName: 'BuildQueryEmbedding', variables: vars });
    buildLatency.add(Date.now() - started, { strategy: vars.input.strategy });
    buildCount.add(1);
  } else {
    const text = pick(EMBED_TEXTS);
    const vars = { text, modelName: MODEL || null };
    const started = Date.now();
    gql({ query: TEXT_EMBED_QUERY, operationName: 'TextEmbedding', variables: vars });
    embedLatency.add(Date.now() - started);
    textCount.add(1);
  }
  sleepJitter(80, 60);
}
