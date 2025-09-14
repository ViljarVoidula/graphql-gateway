import { metrics } from '@opentelemetry/api';
import type Koa from 'koa';

// Get a meter from the global provider (NodeSDK sets it)
export const meter = metrics.getMeter('graphql-gateway', '1.0.0');

// Standard HTTP server request duration (ms)
const httpServerDuration = meter.createHistogram('http.server.duration', {
  unit: 'ms',
  description: 'HTTP server request duration in milliseconds'
});

// GraphQL operation duration (ms)
const graphqlOperationDuration = meter.createHistogram('graphql.operation.duration', {
  unit: 'ms',
  description: 'GraphQL operation duration in milliseconds'
});

// Outbound remote service call duration (ms)
const remoteCallDuration = meter.createHistogram('remote.service.duration', {
  unit: 'ms',
  description: 'Remote service call duration in milliseconds'
});

// Counters for requests/calls
const httpRequestsTotal = meter.createCounter('http.server.requests', {
  description: 'Total number of HTTP requests'
});
const remoteCallsTotal = meter.createCounter('remote.service.calls', {
  description: 'Total number of outbound remote service calls'
});

// Heartbeat metric to verify pipeline end-to-end
const heartbeat = meter.createCounter('gateway.heartbeat', {
  description: 'Periodic heartbeat to verify OTEL export pipeline'
});

// Basic process metrics (observables)
meter
  .createObservableGauge('process.memory.rss', {
    description: 'Resident set size in bytes'
  })
  .addCallback((obs) => {
    obs.observe(process.memoryUsage().rss);
  });
meter
  .createObservableGauge('process.uptime.seconds', {
    description: 'Process uptime in seconds'
  })
  .addCallback((obs) => {
    obs.observe(process.uptime());
  });

function nowMs(): number {
  const t = process.hrtime.bigint();
  return Number(t / 1_000_000n);
}

export function koaMetrics(): Koa.Middleware {
  return async (ctx, next) => {
    const start = nowMs();
    try {
      await next();
      const duration = nowMs() - start;
      const attrs = {
        'http.method': ctx.method,
        'http.route': (ctx as any)._matchedRoute || ctx.path,
        'http.status_code': ctx.status,
        'net.host.name': ctx.host
      } as const;
      httpServerDuration.record(duration, attrs as any);
      httpRequestsTotal.add(1, attrs as any);
    } catch (err) {
      const duration = nowMs() - start;
      const attrs = {
        'http.method': ctx.method,
        'http.route': (ctx as any)._matchedRoute || ctx.path,
        'http.status_code': ctx.status || 500,
        error: true
      } as const;
      httpServerDuration.record(duration, attrs as any);
      httpRequestsTotal.add(1, attrs as any);
      throw err;
    }
  };
}

// Helper to record GraphQL operation metrics from resolvers/plugins
export function recordGraphQLOperation(params: {
  operationName?: string;
  operationType?: 'query' | 'mutation' | 'subscription';
  success: boolean;
  durationMs: number;
}) {
  const attrs = {
    'graphql.operation.name': params.operationName || 'anonymous',
    'graphql.operation.type': params.operationType || 'query',
    success: params.success
  } as const;
  graphqlOperationDuration.record(params.durationMs, attrs as any);
}

// Use this for explicit timing of remote calls (if you wrap your executor)
export async function withRemoteCallMetrics<T>(opts: {
  service?: string;
  url?: string;
  operation?: string;
  method?: string;
  attributes?: Record<string, string | number | boolean>;
  fn: () => Promise<T>;
}): Promise<T> {
  const start = nowMs();
  try {
    const res = await opts.fn();
    const duration = nowMs() - start;
    const attrs = {
      'remote.service.name': opts.service || 'unknown',
      'url.full': opts.url || 'unknown',
      'http.method': opts.method || 'POST',
      operation: opts.operation || 'request',
      success: true,
      ...(opts.attributes || {})
    } as const;
    remoteCallDuration.record(duration, attrs as any);
    remoteCallsTotal.add(1, attrs as any);
    return res;
  } catch (err) {
    const duration = nowMs() - start;
    const attrs = {
      'remote.service.name': opts.service || 'unknown',
      'url.full': opts.url || 'unknown',
      'http.method': opts.method || 'POST',
      operation: opts.operation || 'request',
      success: false,
      error: true,
      ...(opts.attributes || {})
    } as const;
    remoteCallDuration.record(duration, attrs as any);
    remoteCallsTotal.add(1, attrs as any);
    throw err;
  }
}

// Emit heartbeat every 10s in non-test environments to ensure visibility
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    heartbeat.add(1, { service: 'graphql-gateway' } as any);
  }, 10_000).unref?.();
}

export default meter;
