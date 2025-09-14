import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { gql, pick, randomInt, sleepJitter } from './utils.js';

export const options = {
  vus: Number(__ENV.VU || 50),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    http_req_duration: ['p(90)<300', 'p(95)<400'],
    http_req_failed: ['rate<0.02']
  }
};

const operations = [];

// Placeholder operations – replace with real ones from your schema
operations.push({
  type: 'query',
  body: { query: `query Q { __typename }` }
});
operations.push({
  type: 'mutation',
  body: { query: `mutation M($n:Int!){ __typename }`, variables: { n: 1 } }
});

const qCount = new Counter('mix_queries');
const mCount = new Counter('mix_mutations');

export default function () {
  const op = pick(operations);
  if (op.type === 'mutation') {
    op.body.variables.n = randomInt(1, 1000);
    mCount.add(1);
  } else {
    qCount.add(1);
  }
  gql(op.body);
  sleepJitter(80, 40);
  sleep(0); // yield
}
