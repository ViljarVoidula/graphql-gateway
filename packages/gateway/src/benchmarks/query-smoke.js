import { Trend } from 'k6/metrics';
import { gql, sleepJitter } from './utils.js';

export const options = {
  vus: Number(__ENV.VU || 5),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_duration: ['p(90)<150', 'p(95)<200'],
    http_req_failed: ['rate<0.01']
  }
};

const latency = new Trend('gql_query_latency');

const SIMPLE_QUERY = {
  query: `query Health { __typename }` // replace with a lightweight real field if available
};

export default function () {
  const start = Date.now();
  const res = gql(SIMPLE_QUERY, { logErrors: true });
  latency.add(Date.now() - start, { op: 'Health' });
  sleepJitter(50, 50);
}
