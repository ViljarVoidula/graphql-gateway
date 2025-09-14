import { context, Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

// Single tracer for the gateway
export const tracer = trace.getTracer('graphql-gateway', '1.0.0');

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Run the provided async function within a span and record status/exception.
 */
export async function withSpan<T>(name: string, fn: (span?: Span) => Promise<T>, opts: SpanOptions): Promise<T>;
export async function withSpan<T>(name: string, fn: () => Promise<T>, opts?: SpanOptions): Promise<T>;
export async function withSpan<T>(name: string, fn: (span?: Span) => Promise<T>, opts?: SpanOptions): Promise<T>;
export async function withSpan<T>(
  name: string,
  fn: ((span?: Span) => Promise<T>) | (() => Promise<T>),
  opts: SpanOptions = {}
): Promise<T> {
  const span = tracer.startSpan(name, { kind: opts.kind ?? SpanKind.INTERNAL, attributes: opts.attributes });
  try {
    const active = trace.setSpan(context.active(), span);
    const result = await context.with(active, () => (fn as any)(span));
    return result;
  } catch (err: any) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Get current trace correlation data for logs.
 */
export function getLogTraceContext(explicitSpan?: Span) {
  const span = explicitSpan ?? trace.getSpan(context.active());
  const spanCtx = span?.spanContext();
  if (!span || !spanCtx) return {};
  return {
    traceId: spanCtx.traceId,
    spanId: spanCtx.spanId,
    traceFlags: spanCtx.traceFlags
  };
}

/**
 * Helper to enrich a metadata object for the existing structured logger
 * with the current trace context.
 */
export function withTraceMeta(meta: Record<string, any> = {}, explicitSpan?: Span) {
  return { ...meta, ...getLogTraceContext(explicitSpan) };
}

export default tracer;
