import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getLogTraceContext, withSpan } from './tracing';

describe('telemetry/tracing', () => {
  it('withSpan creates span and passes it to callback', async () => {
    let innerTraceId: string | undefined;
    await withSpan('test-span', async (span) => {
      innerTraceId = span?.spanContext().traceId;
      return 42;
    });
    assert.ok(innerTraceId, 'span should be provided to callback');
  });

  it('getLogTraceContext returns correlation fields when span passed explicitly', async () => {
    let ctx: any;
    await withSpan('test-log', async (span) => {
      ctx = getLogTraceContext(span);
    });
    assert.ok(ctx.traceId, 'traceId');
    assert.ok(ctx.spanId, 'spanId');
  });
});
