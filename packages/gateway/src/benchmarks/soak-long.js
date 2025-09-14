import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { gql, sleepJitter } from './utils.js';

export const options = {
  vus: Number(__ENV.VU || 40),
  duration: __ENV.DURATION || '30m',
  thresholds: {
    http_req_duration: ['p(95)<350'],
    http_req_failed: ['rate<0.02']
  }
};

const latency = new Trend('soak_latency');
const errors = new Counter('soak_errors');

const Q = { query: `query Q { __typename }` };

export default function () {
  const start = Date.now();
  const res = gql(Q, { logErrors: true });
  latency.add(Date.now() - start);
  if (res.status !== 200) errors.add(1);
  sleepJitter(120, 120);
  sleep(0);
}
