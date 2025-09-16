// k6 benchmark: faceted product search workload
// -------------------------------------------------
// Simulates user search traffic with facets, filters, multiple modes and adaptive schema handling.
// Includes automatic fallback for naming differences and optional stripping of appId if the schema rejects it.
// Rich metrics + dynamic selection toggles.
//
// Environment Variables (selected):
//  SEARCH_FIELD / SEARCH_OPERATION / SEARCH_INPUT_TYPE / SEARCH_HITS_KEY
//  INCLUDE_APP_ID=1 (auto-disabled if schema error mentions missing appId)
//  ADVANCED_FACETS=0 (enable facet fragments)
//  HITS_FIELDS / META_FIELDS (override selection)
//  INTROSPECT=1 (attempt discovery of names & hits key)
//  MODE_DISTRIBUTION, FACETS, *_FILTER toggles, etc.
//  STRICT_NO_ERRORS=1 logs sampled errors; success rate exported.
//
// To run minimal safe mode: INTROSPECT=1 ADVANCED_FACETS=0 INCLUDE_APP_ID=0 k6 run search-faceted.js

import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';
import { GATEWAY_URL, gql, headers, pick, randomInt, sleepJitter } from './utils.js';

// ---- k6 options ----
function buildOptions() {
  const thresholds = {
    http_req_duration: ['p(90)<450', 'p(95)<600'],
    http_req_failed: ['rate<0.02'],
    search_backend_ms: ['p(95)<500']
  };
  const stagesEnv = __ENV.STAGES;
  if (stagesEnv) {
    const stages = stagesEnv.split(',').map((seg) => {
      const [d, v] = seg.split(':');
      return { duration: d.trim(), target: Number(v) };
    });
    return { stages, thresholds };
  }
  return { vus: Number(__ENV.VU || 30), duration: __ENV.DURATION || '2m', thresholds };
}
export const options = buildOptions();

// ---- Term pools ----
const ADJECTIVES = (__ENV.ADJECTIVES || 'Ultra,Pro,Max,Lite,Air,Flex,Fusion,Edge,Prime,Core')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const BRANDS = (__ENV.BRANDS || 'Nike,Adidas,Puma,Reebok,Asics,NewBalance,UnderArmour,Hoka')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const GROUPS = (__ENV.GROUPS || 'footwear,apparel,accessories,electronics,gaming,home,beauty,outdoor,fitness,travel,office,pet')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SEASONS = (__ENV.SEASONS || 'spring,summer,autumn,winter,all-season')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MATERIALS = (__ENV.MATERIALS || 'mesh,leather,synthetic,cotton,wool,recycled')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const QUERY_TERMS = (
  __ENV.QUERY_TERMS || 'winter,jacket,coat,hoodie,boot,shirt,jeans,scarf,running,fitness,outdoor,luxury,budget,new'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SEARCH_COLORS = (__ENV.SEARCH_COLORS || 'red,blue,green,black,white,gray')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const APP_IDS = (__ENV.APP_IDS || 'fashion-store-456')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ---- GraphQL naming (overridable) ----
let SEARCH_OPERATION = __ENV.SEARCH_OPERATION || 'Search';
let SEARCH_FIELD = __ENV.SEARCH_FIELD || 'search';
let SEARCH_INPUT_TYPE = __ENV.SEARCH_INPUT_TYPE || 'SearchInput!';
let SEARCH_HITS_KEY = __ENV.SEARCH_HITS_KEY || 'results';
let INCLUDE_APP_ID = Number(__ENV.INCLUDE_APP_ID || 0) > 0;

// ---- Selection toggles ----
let ADVANCED_FACETS = Number(__ENV.ADVANCED_FACETS || 0) > 0;
let HITS_FIELDS = (__ENV.HITS_FIELDS || 'id name price score').trim();
let META_FIELDS = (__ENV.META_FIELDS || 'totalResults executionTime').trim();

function buildFacetsSelection() {
  if (!ADVANCED_FACETS) return 'facets { __typename }';
  return `facets {
    __typename
    ... on CategoricalFacetResult { field label buckets { value count selected } }
    ... on RangeFacetResult { field label min max buckets { min max count selected label } }
    ... on BooleanFacetResult { field label trueCount falseCount }
    ... on HierarchyFacetResult { field label nodes { value count level path selected } }
  }`;
}
function buildHitsSelection() {
  return `${SEARCH_HITS_KEY} { ${HITS_FIELDS} }`;
}
function buildQueryDoc() {
  return `query ${SEARCH_OPERATION}($input: ${SEARCH_INPUT_TYPE}) {
  ${SEARCH_FIELD}(input: $input) {
    ${buildHitsSelection()}
    ${buildFacetsSelection()}
    pagination { hasMore total offset limit }
    suggestions { text type score }
    meta { ${META_FIELDS} }
  }
}`;
}
let SEARCH_QUERY = buildQueryDoc();

// ---- Adaptive logic ----
let fallbackApplied = false;
function maybeApplyFallback(errors) {
  if (fallbackApplied || !errors?.length) return;
  const msgs = errors.map((e) => (e.message || '').toLowerCase());
  if (
    msgs.some((m) => m.includes('unknown type "searchproductsinput"')) ||
    msgs.some((m) => m.includes('cannot query field "searchproducts"'))
  ) {
    fallbackApplied = true;
    console.warn('[schema-fallback] switching to Search/SearchInput/results');
    SEARCH_OPERATION = 'Search';
    SEARCH_FIELD = 'search';
    SEARCH_INPUT_TYPE = 'SearchInput!';
    SEARCH_HITS_KEY = 'results';
    HITS_FIELDS = __ENV.HITS_FIELDS || 'id name price score';
    SEARCH_QUERY = buildQueryDoc();
  }
}
let simplifiedSelection = false;
function maybeSimplifySelection(errors) {
  if (simplifiedSelection || !errors?.length) return;
  const msgs = errors.map((e) => (e.message || '').toLowerCase());
  if (
    msgs.some((m) => m.includes('payload') && m.includes('no subfields')) ||
    msgs.some((m) => m.includes('facetresultunion'))
  ) {
    simplifiedSelection = true;
    ADVANCED_FACETS = false;
    HITS_FIELDS = 'id name price score';
    META_FIELDS = 'totalResults executionTime';
    console.warn('[schema-simplify] minimal projection');
    SEARCH_QUERY = buildQueryDoc();
  }
}
let strippedAppId = false;
function maybeStripAppId(errors) {
  if (!INCLUDE_APP_ID || strippedAppId || !errors?.length) return;
  const msgs = errors.map((e) => (e.message || '').toLowerCase());
  if (msgs.some((m) => m.includes('field "appid" is not defined'))) {
    INCLUDE_APP_ID = false;
    strippedAppId = true;
    appIdRemoved.add(1);
  }
}

// ---- Introspection (light) ----
if (Number(__ENV.INTROSPECT || 0) > 0) {
  try {
    const iq = `query __Q { __type(name:"Query") { fields { name args { name type { kind name ofType { kind name } } } type { kind name ofType { kind name ofType { kind name } } } } } }`;
    const r = http.post(GATEWAY_URL, JSON.stringify({ query: iq }), { headers: headers() });
    if (r.status === 200) {
      const fs = r.json()?.data?.__type?.fields || [];
      const chosen = fs.find((f) => f.name === 'search') || fs.find((f) => f.name.toLowerCase().includes('search'));
      if (chosen) {
        SEARCH_FIELD = chosen.name;
        SEARCH_OPERATION = SEARCH_FIELD.charAt(0).toUpperCase() + SEARCH_FIELD.slice(1);
        const arg = chosen.args?.find((a) => a.name === 'input') || chosen.args?.find((a) => a.name === 'in');
        if (arg) {
          let t = arg.type;
          while (t && t.kind === 'NON_NULL') t = t.ofType;
          if (t?.name) SEARCH_INPUT_TYPE = `${t.name}!`;
        }
        let ret = chosen.type;
        while (ret && (ret.kind === 'NON_NULL' || ret.kind === 'LIST')) ret = ret.ofType;
        const rn = ret?.name;
        if (rn) {
          const tq = `query __T { __type(name:"${rn}") { fields { name type { kind name ofType { kind name } } } } }`;
          const tr = http.post(GATEWAY_URL, JSON.stringify({ query: tq }), { headers: headers() });
          if (tr.status === 200) {
            const tf = tr.json()?.data?.__type?.fields || [];
            const hitsF =
              tf.find((f) => f.name === 'results') ||
              tf.find((f) => f.name === 'hits') ||
              tf.find((f) => f.type?.kind === 'LIST');
            if (hitsF) SEARCH_HITS_KEY = hitsF.name;
          }
        }
        try {
          // input fields for appId
          const inType = (SEARCH_INPUT_TYPE || '').replace(/!/g, '');
          if (inType && INCLUDE_APP_ID) {
            const iq2 = `query __I { __type(name:"${inType}") { inputFields { name } } }`;
            const ir = http.post(GATEWAY_URL, JSON.stringify({ query: iq2 }), { headers: headers() });
            if (ir.status === 200) {
              const names = ir.json()?.data?.__type?.inputFields?.map((f) => f.name) || [];
              if (names.length && !names.includes('appId')) {
                INCLUDE_APP_ID = false;
                console.warn(`[introspection] ${inType} lacks appId; disabling`);
              }
            }
          }
        } catch {}
        SEARCH_QUERY = buildQueryDoc();
        fallbackApplied = true;
        console.log(`[introspection] field=${SEARCH_FIELD} input=${SEARCH_INPUT_TYPE} hits=${SEARCH_HITS_KEY}`);
      }
    }
  } catch (e) {
    console.warn('[introspection] failed', e);
  }
}

// ---- Mode distribution ----
const MODE_DISTRIBUTION = (() => {
  const raw = __ENV.MODE_DISTRIBUTION || 'HYBRID:0.7,LEXICAL:0.2,VECTOR:0.1';
  const dist = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [m, w] = p.split(':');
      return { mode: m.trim(), weight: Number(w) };
    });
  const tot = dist.reduce((a, b) => a + b.weight, 0) || 1;
  let acc = 0;
  return dist.map((d) => ({ mode: d.mode, threshold: (acc += d.weight / tot) }));
})();
function pickMode() {
  const r = Math.random();
  return MODE_DISTRIBUTION.find((d) => r <= d.threshold)?.mode || MODE_DISTRIBUTION[MODE_DISTRIBUTION.length - 1].mode;
}

// ---- Facets ----
const FACET_SET = (__ENV.FACETS || 'color,size,price')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
function buildFacets() {
  const f = [];
  if (FACET_SET.includes('color'))
    f.push({ field: 'payload.color', type: 'CATEGORICAL', label: 'Color', categorical: { limit: 24, sort: 'COUNT_DESC' } });
  if (FACET_SET.includes('size'))
    f.push({ field: 'payload.size', type: 'CATEGORICAL', label: 'Size', categorical: { sort: 'VALUE_ASC' } });
  if (FACET_SET.includes('price')) f.push({ field: 'price', type: 'RANGE', label: 'Price', range: { buckets: 4 } });
  if (FACET_SET.includes('rating')) f.push({ field: 'payload.rating', type: 'RANGE', label: 'Rating', range: { buckets: 5 } });
  return f;
}

// ---- Env toggles ----
const COLOR_FILTER_PROB = Number(__ENV.COLOR_FILTER_PROB || 0.5);
const PAGE_MIN = Number(__ENV.PAGE_MIN || 10);
const PAGE_MAX = Number(__ENV.PAGE_MAX || 30);
const ENABLE_WEIGHTED_QUERY = Number(__ENV.ENABLE_WEIGHTED_QUERY || 0) > 0;
const ENABLE_SEASON_FILTER = Number(__ENV.ENABLE_SEASON_FILTER || 0) > 0;
const ENABLE_MATERIAL_FILTER = Number(__ENV.ENABLE_MATERIAL_FILTER || 0) > 0;
const ENABLE_PRICE_BANDS = Number(__ENV.ENABLE_PRICE_BANDS || 0) > 0;
const ENABLE_RATING_FILTER = Number(__ENV.ENABLE_RATING_FILTER || 0) > 0;
const STRICT_NO_ERRORS = Number(__ENV.STRICT_NO_ERRORS || 1) > 0;

// ---- Query generation ----
function buildQueryString() {
  const p = Math.random();
  if (p < 0.2) return `${pick(ADJECTIVES)} ${pick(BRANDS)}`;
  if (p < 0.4) return `${pick(GROUPS)} ${pick(SEASONS)}`;
  if (p < 0.6) return `${pick(MATERIALS)} ${pick(GROUPS)}`;
  if (p < 0.8) {
    const t1 = pick(QUERY_TERMS);
    const t2 = Math.random() < 0.5 ? pick(QUERY_TERMS) : null;
    return t2 ? `${t1} ${t2}` : t1;
  }
  return `${pick(ADJECTIVES)} ${pick(GROUPS)} ${pick(BRANDS)}`;
}
function maybeWeightedQuery(q) {
  if (!ENABLE_WEIGHTED_QUERY) return;
  if (Math.random() < 0.3) {
    const parts = Array.from(new Set(q.split(/\s+/g))).slice(0, 3);
    const m = {};
    let w = 1;
    for (const pt of parts) {
      m[pt] = +w.toFixed(2);
      w += 0.35 * Math.random();
    }
    return m;
  }
}
function buildInput() {
  const query = buildQueryString();
  const weightedQuery = maybeWeightedQuery(query);
  const applyColor = Math.random() < COLOR_FILTER_PROB;
  const color = applyColor ? pick(SEARCH_COLORS) : undefined;
  const pageSize = randomInt(PAGE_MIN, PAGE_MAX);
  const mode = pickMode();
  const filters = {};
  if (color) filters['payload.color'] = color;
  if (ENABLE_SEASON_FILTER && Math.random() < 0.15) filters['payload.season'] = pick(SEASONS);
  if (ENABLE_MATERIAL_FILTER && Math.random() < 0.12) filters['payload.material'] = pick(MATERIALS);
  if (ENABLE_PRICE_BANDS && Math.random() < 0.1) {
    const band = randomInt(0, 3);
    if (band === 0) filters['price_lte'] = 40;
    else if (band === 1) {
      filters['price_gte'] = 40;
      filters['price_lte'] = 80;
    } else if (band === 2) {
      filters['price_gte'] = 80;
      filters['price_lte'] = 120;
    } else filters['price_gte'] = 120;
  }
  if (ENABLE_RATING_FILTER && Math.random() < 0.08) filters['payload.rating_gte'] = +(Math.random() * 3 + 2).toFixed(1);
  const hasFilters = Object.keys(filters).length ? filters : undefined;
  const input = {
    query,
    weightedQuery,
    mode,
    pagination: { limit: pageSize },
    facets: buildFacets(),
    filters: hasFilters,
    sort: Math.random() < 0.25 ? [{ field: 'price', direction: Math.random() < 0.5 ? 'ASC' : 'DESC' }] : undefined,
    fields: { preset: 'BASIC' }
  };
  if (INCLUDE_APP_ID) input.appId = pick(APP_IDS);
  return input;
}

// ---- Metrics ----
const searchLatency = new Trend('search_latency');
const backendLatency = new Trend('search_backend_ms');
const hitsCount = new Trend('search_hits_count');
const facetBuckets = new Trend('search_facet_buckets_total');
const facetHit = new Counter('search_facet_color_present');
const colorFiltered = new Counter('search_color_filtered');
const emptyResults = new Counter('search_empty_results');
const modeShare = new Counter('search_mode_samples');
const parseFailed = new Counter('search_parse_failed');
const gqlErrors = new Counter('search_graphql_errors');
const gqlErrorsValidation = new Counter('search_graphql_errors_validation');
const gqlErrorsInternal = new Counter('search_graphql_errors_internal');
const gqlErrorsAuth = new Counter('search_graphql_errors_auth');
const gqlErrorsOther = new Counter('search_graphql_errors_other');
const sampledLogs = new Counter('search_debug_samples');
const successful = new Rate('search_success_rate');
const appIdRemoved = new Counter('search_appid_removed');

const DEBUG_SAMPLE = Number(__ENV.DEBUG_SAMPLE || 0);
const WARMUP_REQUESTS = Number(__ENV.WARMUP_REQUESTS || 0);
let warmupLeft = WARMUP_REQUESTS;

// ---- Execution ----
export default function () {
  const vars = { input: buildInput() };
  const modeTag = vars.input.mode || 'NA';
  if (vars.input.filters?.['payload.color']) colorFiltered.add(1);
  const started = Date.now();
  const res = gql({ query: SEARCH_QUERY, operationName: SEARCH_OPERATION, variables: vars }, { logErrors: false });
  const dur = Date.now() - started;
  searchLatency.add(dur, { mode: modeTag, filtered: vars.input.filters ? '1' : '0' });
  modeShare.add(1, { mode: modeTag });
  let ok = false;
  try {
    const body = res.json();
    if (body?.errors?.length) {
      gqlErrors.add(body.errors.length, { mode: modeTag });
      for (const err of body.errors) {
        const msg = String(err.message || '').toLowerCase();
        const code = err.extensions?.code;
        if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') gqlErrorsAuth.add(1, { mode: modeTag });
        else if (code === 'INTERNAL_SERVER_ERROR') gqlErrorsInternal.add(1, { mode: modeTag });
        else if (msg.includes('unknown') || msg.includes('cannot query') || msg.includes('field') || msg.includes('argument'))
          gqlErrorsValidation.add(1, { mode: modeTag });
        else gqlErrorsOther.add(1, { mode: modeTag });
      }
      if (STRICT_NO_ERRORS && Math.random() < 0.02)
        console.error('[gql-errors-sample]', JSON.stringify(body.errors.slice(0, 2)));
      maybeApplyFallback(body.errors);
      maybeSimplifySelection(body.errors);
      maybeStripAppId(body.errors);
    }
    const root = body?.data?.[SEARCH_FIELD];
    if (!root) throw new Error('missing root field');
    const hits = root[SEARCH_HITS_KEY] || [];
    const meta = root.meta || {};
    const backendMs = meta.tookMs || meta.executionTime;
    hitsCount.add(hits.length, { mode: modeTag });
    if (backendMs != null) backendLatency.add(Number(backendMs), { mode: modeTag });
    if (!hits.length) emptyResults.add(1);
    const facets = root.facets || [];
    let bucketTotal = 0;
    for (const f of facets) {
      if (f.buckets) bucketTotal += f.buckets.length;
      if (f.nodes) bucketTotal += f.nodes.length;
    }
    facetBuckets.add(bucketTotal, { mode: modeTag });
    if (facets.find((f) => f.field === 'payload.color')) facetHit.add(1);
    ok = true;
    if (DEBUG_SAMPLE && Math.random() < DEBUG_SAMPLE) {
      sampledLogs.add(1);
      console.log(
        '[sample]',
        JSON.stringify({ mode: modeTag, q: vars.input.query, hits: hits.length, backendMs, buckets: bucketTotal })
      );
    }
  } catch {
    parseFailed.add(1);
  }
  successful.add(ok);
  if (warmupLeft > 0) {
    warmupLeft--;
    if (warmupLeft === 0) console.log(`Warmup phase complete (${WARMUP_REQUESTS} requests).`);
    sleepJitter(40, 30);
    return;
  }
  sleepJitter(120, 80);
}
// end benchmark script
