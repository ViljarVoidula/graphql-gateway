import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8088/graphql';
const APP_ID = __ENV.APP_ID || 'default-app';
const TENANT_ID = __ENV.TENANT_ID || 'saas'; // explicit tenant id required by service
const TOTAL = parseInt(__ENV.TOTAL || '10000', 10);
const BATCH_SIZE = parseInt(__ENV.BATCH_SIZE || '50', 10);
const PAUSE_MS = parseInt(__ENV.PAUSE_MS || '0', 10); // optional tiny delay between batches

// k6 options: set VUs & iterations so each iteration sends one batch
export const options = {
  vus: parseInt(__ENV.VUS || '8', 10),
  iterations: Math.ceil(TOTAL / BATCH_SIZE),
  insecureSkipTLSVerify: true,
};

const brands = [
  'Nike',
  'Adidas',
  'Puma',
  'Reebok',
  'Asics',
  'NewBalance',
  'UnderArmour',
  'Hoka',
];
// Expanded category taxonomy for richer diversity
const catPool = [
  // core
  'shoe',
  'footwear',
  'sneaker',
  'boot',
  'sandals',
  // apparel & style
  'apparel',
  'men',
  'women',
  'kids',
  'unisex',
  'accessories',
  'bags',
  'watches',
  // sports & fitness
  'sport',
  'running',
  'fitness',
  'outdoor',
  'hiking',
  'climbing',
  'cycling',
  'yoga',
  // lifestyle & segments
  'lifestyle',
  'casual',
  'streetwear',
  'premium',
  'luxury',
  'budget',
  'clearance',
  'sale',
  'new',
  // departments / verticals
  'electronics',
  'gaming',
  'home',
  'kitchen',
  'office',
  'travel',
  'beauty',
  'health',
  'pet',
  'pet-supplies',
  // seasons / temporal
  'spring',
  'summer',
  'autumn',
  'winter',
  'holiday',
  'back-to-school',
  'black-friday',
];

// Product group / department classification (stored in payload for tagging)
const productGroups = [
  'footwear',
  'apparel',
  'accessories',
  'electronics',
  'gaming',
  'home',
  'beauty',
  'outdoor',
  'fitness',
  'travel',
  'office',
  'pet',
];
const adjectives = [
  'Ultra',
  'Pro',
  'Max',
  'Lite',
  'Air',
  'Flex',
  'Fusion',
  'Edge',
  'Prime',
  'Core',
];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randCats() {
  // Weighted variety: 2-6 categories
  const n = 2 + Math.floor(Math.random() * 5);
  const picked = new Set();
  while (picked.size < n) picked.add(rand(catPool));
  return Array.from(picked);
}

function makeDoc(idx) {
  const brand = rand(brands);
  const name = `${rand(adjectives)} ${brand} Model ${idx}`;
  const group = rand(productGroups);
  // Ensure group is included in categories for relevance boosting
  const categories = Array.from(new Set([group, ...randCats()]));
  return {
    id: `p-${idx}`,
    type: 'product',
    name,
    brand,
    description_en: `High quality ${brand} ${group} item number ${idx} engineered for performance and comfort across diverse use cases.`,
    price: +(Math.random() * 150 + 10).toFixed(2),
    categories,
    payload: {
      color: rand([
        'red',
        'blue',
        'black',
        'white',
        'green',
        'grey',
        'navy',
        'beige',
        'purple',
        'orange',
      ]),
      size: rand(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
      season: rand(['spring', 'summer', 'autumn', 'winter', 'all-season']),
      rating: +(Math.random() * 5).toFixed(2),
      stock: Math.floor(Math.random() * 1000),
      group,
      material: rand([
        'mesh',
        'leather',
        'synthetic',
        'cotton',
        'wool',
        'recycled',
      ]),
      sustainability: rand(['standard', 'recycled', 'vegan', 'low-carbon']),
      tags: randCats(),
    },
    // tenant_id intentionally omitted: supplied via mutation variable tenantId
    // embedding omitted so service can auto-generate if enabled
  };
}

const mutation = `
mutation Upsert($appId:String!, $tenantId:String!, $docs:[JSON!]!) {
  upsertProducts(appId:$appId, tenantId:$tenantId, docs:$docs)
}
`;

export default function () {
  const batchIndex = __ITER;
  const start = batchIndex * BATCH_SIZE;
  if (start >= TOTAL) return;

  const end = Math.min(start + BATCH_SIZE, TOTAL);
  const docs = [];
  for (let i = start; i < end; i++) {
    docs.push(makeDoc(i));
  }

  const body = JSON.stringify({
    query: mutation,
    variables: { appId: APP_ID, tenantId: TENANT_ID, docs },
    operationName: 'Upsert',
  });

  const res = http.post(BASE_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    tags: { batch: `${batchIndex}` },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
    'no graphql errors': (r) => {
      try {
        const j = r.json();
        return !j.errors;
      } catch (_) {
        return false;
      }
    },
  });

  if (res.status !== 200) {
    console.error(
      `Batch ${batchIndex} HTTP ${res.status} body=${res.body.substring(
        0,
        300
      )}`
    );
  } else {
    const j = res.json();
    if (j.errors) {
      console.error(
        `Batch ${batchIndex} GraphQL errors: ${JSON.stringify(
          j.errors
        ).substring(0, 400)}`
      );
    }
  }

  if (PAUSE_MS > 0) sleep(PAUSE_MS / 1000);
}
