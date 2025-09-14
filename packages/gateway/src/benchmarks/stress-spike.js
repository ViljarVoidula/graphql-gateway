import { gql } from './utils.js';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
      stages: [
        { target: 500, duration: '15s' },
        { target: 2000, duration: '15s' }, // spike
        { target: 200, duration: '30s' }, // recovery
        { target: 0, duration: '15s' }
      ]
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<900'],
    http_req_failed: ['rate<0.05']
  }
};

const Q = { query: `query Q { __typename }` };

export default function () {
  gql(Q);
}
