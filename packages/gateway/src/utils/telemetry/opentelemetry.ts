import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
// Note: OpenTelemetry Logs export is disabled here to avoid SDK API mismatches.
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AggregationTemporality, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
// Avoid importing the app logger before instrumentation patches modules.
// We'll use console for early logs and lazy-load the logger after SDK startup.

// Optional SDK diagnostic logs (enabled via env)
if (process.env.OTEL_DIAG_LOG_LEVEL) {
  const level = (DiagLogLevel as any)[String(process.env.OTEL_DIAG_LOG_LEVEL).toUpperCase()] ?? DiagLogLevel.WARN;
  diag.setLogger(new DiagConsoleLogger(), level);
}

const COLLECTOR = process.env.OTEL_COLLECTOR_ENDPOINT || 'http://localhost:4318';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'graphql-gateway';
const SERVICE_VERSION = process.env.npm_package_version || process.env.SERVICE_VERSION || '0.0.0';
const ENV = process.env.DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development';
const SAMPLE_RATIO = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? process.env.TRACE_SAMPLE_RATIO ?? 1.0);

// Ensure resource attributes are present for the env resource detector
(() => {
  const attrsEnv = process.env.OTEL_RESOURCE_ATTRIBUTES || '';
  const parts = attrsEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ensure = (k: string, v: string) => {
    if (!parts.some((p) => p.startsWith(`${k}=`))) parts.push(`${k}=${v}`);
  };
  ensure('service.name', SERVICE_NAME);
  ensure('service.version', SERVICE_VERSION);
  ensure('deployment.environment', ENV);
  process.env.OTEL_RESOURCE_ATTRIBUTES = parts.join(',');
})();

let started = false;
let sdk: NodeSDK | undefined;

export async function initializeTelemetry(): Promise<void> {
  if (started) return;

  // In test environment we don't start the SDK to allow tests to install custom providers/exporters
  if (process.env.NODE_ENV === 'test') {
    started = true;
    return;
  }
  const traceExporter = new OTLPTraceExporter({
    url: `${COLLECTOR}/v1/traces`
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${COLLECTOR}/v1/metrics`,
      temporalityPreference: AggregationTemporality.DELTA
    }),
    exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS ?? 60000),
    exportTimeoutMillis: Number(process.env.OTEL_METRIC_EXPORT_TIMEOUT_MS ?? 45000)
  });

  const instrumentations = getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-dataloader': { enabled: true },
    '@opentelemetry/instrumentation-http': {
      enabled: true,
      ignoreIncomingPaths: [/^\/health$/, /^\/admin\/?/, /^\/static\/?/]
    },
    '@opentelemetry/instrumentation-koa': { enabled: true },
    '@opentelemetry/instrumentation-undici': { enabled: true },
    '@opentelemetry/instrumentation-graphql': {
      enabled: true,
      ignoreTrivialResolveSpans: true,
      mergeItems: true
    },
    '@opentelemetry/instrumentation-pg': { enabled: true },
    '@opentelemetry/instrumentation-redis': { enabled: true },
    '@opentelemetry/instrumentation-winston': { enabled: true },
    // Reduce noise/errors in some environments
    '@opentelemetry/instrumentation-fs': { enabled: false }
  } as any);

  sdk = new NodeSDK({
    traceExporter,
    metricReaders: [metricReader],
    instrumentations
  });

  // Early log without importing the app logger (prevents patch ordering issues)
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Starting OpenTelemetry',
      metadata: { collector: COLLECTOR, service: SERVICE_NAME, version: SERVICE_VERSION, env: ENV, sampleRatio: SAMPLE_RATIO }
    })
  );
  await sdk.start();
  started = true;
  // Emit a tiny startup span so we can verify traces appear in the backend immediately
  try {
    const tracer = trace.getTracer('bootstrap');
    const span = tracer.startSpan('gateway.startup');
    span.setAttribute('service.name', SERVICE_NAME);
    span.setAttribute('deployment.environment', ENV);
    span.end();
  } catch {
    // ignore
  }
  try {
    const { log } = await import('../logger');
    log.info('OpenTelemetry initialized', {
      metadata: { collector: COLLECTOR, service: SERVICE_NAME, version: SERVICE_VERSION, env: ENV, sampleRatio: SAMPLE_RATIO }
    });
  } catch {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'OpenTelemetry initialized',
        metadata: { collector: COLLECTOR, service: SERVICE_NAME, version: SERVICE_VERSION, env: ENV, sampleRatio: SAMPLE_RATIO }
      })
    );
  }

  const shutdown = async (signal: string) => {
    try {
      await sdk?.shutdown();
      try {
        const { log } = await import('../logger');
        log.info('OpenTelemetry shut down', { metadata: { signal } });
      } catch {
        console.log(JSON.stringify({ level: 'info', message: 'OpenTelemetry shut down', metadata: { signal } }));
      }
    } catch (err) {
      try {
        const { log } = await import('../logger');
        log.error('OpenTelemetry shutdown error', { error: err });
      } catch {
        console.error(JSON.stringify({ level: 'error', message: 'OpenTelemetry shutdown error', error: String(err) }));
      }
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

export default sdk;
