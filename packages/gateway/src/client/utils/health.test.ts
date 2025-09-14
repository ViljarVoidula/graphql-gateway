import assert from 'node:assert';
import test from 'node:test';
import { computeHealthScore, offlineServices, ServiceHealthInput, servicesWithBreakingChanges } from './health';

const baseServices: ServiceHealthInput[] = [
  { status: 'active', breakingChanges24h: 0, errorRate24h: 0 },
  { status: 'active', breakingChanges24h: 0, errorRate24h: 0 },
  { status: 'inactive', breakingChanges24h: 1, errorRate24h: 0.2 }
];

test('computes 100 for all active & perfect', () => {
  const score = computeHealthScore([
    { status: 'active', breakingChanges24h: 0, errorRate24h: 0 },
    { status: 'active', breakingChanges24h: 0, errorRate24h: 0 }
  ]);
  assert.strictEqual(score, 100);
});

test('penalizes inactive services', () => {
  const score = computeHealthScore(baseServices);
  assert.ok(score < 100);
});

test('penalizes breaking changes and errors', () => {
  const withBreaking = computeHealthScore([
    { status: 'active', breakingChanges24h: 2, errorRate24h: 0.5 },
    { status: 'active', breakingChanges24h: 0, errorRate24h: 0 }
  ]);
  const withoutBreaking = computeHealthScore([
    { status: 'active', breakingChanges24h: 0, errorRate24h: 0 },
    { status: 'active', breakingChanges24h: 0, errorRate24h: 0 }
  ]);
  assert.ok(withBreaking < withoutBreaking);
});

test('detects offline services', () => {
  assert.strictEqual(offlineServices(baseServices).length, 1);
});

test('detects services with breaking changes', () => {
  assert.strictEqual(servicesWithBreakingChanges(baseServices).length, 1);
});
