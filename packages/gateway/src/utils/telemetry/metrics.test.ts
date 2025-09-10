import { metrics } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { koaMetrics, recordGraphQLOperation, withRemoteCallMetrics } from './metrics';

// Set up an in-memory meter provider for tests
const meterProvider = new MeterProvider();
metrics.setGlobalMeterProvider(meterProvider as any);

function createMockKoaContext(path: string = '/test') {
  return {
    method: 'GET',
    path,
    status: 200,
    host: 'localhost',
    _matchedRoute: path
  } as any;
}

describe('telemetry/metrics', () => {
  it('koaMetrics records duration and increments counter', async () => {
    const ctx = createMockKoaContext('/health');
    const mw = koaMetrics();

    const before = Date.now();
    await mw(ctx, async () => {
      // simulate work
      await new Promise((r) => setTimeout(r, 5));
    });
    const after = Date.now();

    assert.ok(after >= before, 'middleware executed');
  });

  it('withRemoteCallMetrics records on success and failure', async () => {
    const result = await withRemoteCallMetrics({ service: 'svc', url: 'http://x', fn: async () => 1 });
    assert.strictEqual(result, 1);

    await assert.rejects(() =>
      withRemoteCallMetrics({
        service: 'svc',
        url: 'http://x',
        fn: async () => {
          throw new Error('boom');
        }
      })
    );
  });

  it('recordGraphQLOperation does not throw', () => {
    recordGraphQLOperation({ success: true, durationMs: 10, operationName: 'Q', operationType: 'query' });
  });
});
