import { check, sleep } from 'k6';
import http from 'k6/http';

export const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:4000/graphql';
export const API_KEY =
  __ENV.API_KEY ||
  'app_05d9e4ba39567f83511aa08bcd1a0525cd074105e23dd73c94877dafa967d061';

export function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (API_KEY) h['X-API-Key'] = API_KEY;
  return h;
}

export function gql(body, opts = {}) {
  const res = http.post(GATEWAY_URL, JSON.stringify(body), {
    headers: headers(opts.headers),
    tags: opts.tags,
  });
  const ok = check(res, {
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
  if (!ok && opts.logErrors) {
    console.error('GraphQL error', res.status, res.body);
  }
  return res;
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function sleepJitter(baseMs = 100, spreadMs = 50) {
  const ms = baseMs + Math.random() * spreadMs;
  sleep(ms / 1000);
}
