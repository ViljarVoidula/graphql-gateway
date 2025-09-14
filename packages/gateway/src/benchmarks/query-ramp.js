import { gql } from './utils.js';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '30s', target: 150 },
    { duration: '1m', target: Number(__ENV.RAMP_MAX_VU || 500) },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_duration: ['p(90)<200', 'p(95)<250', 'p(99)<400'],
    http_req_failed: ['rate<0.01']
  }
};

const QUERY = { query: `query Introspection { __schema { queryType { name } } }` };

export default function () {
  gql(QUERY);
}
