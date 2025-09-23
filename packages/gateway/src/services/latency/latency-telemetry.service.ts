import { metrics } from '@opentelemetry/api';
import { Container } from 'typedi';
import { log } from '../../utils/logger';

/**
 * High-performance OpenTelemetry metrics for billion-request scale
 * Optimized for minimal memory footprint and CPU overhead
 */
export class LatencyTelemetryService {
  private static instance: LatencyTelemetryService;
  private meter = metrics.getMeter('graphql-gateway-latency', '1.0.0');

  // Pre-created instruments to avoid repeated creation overhead
  private requestLatencyHistogram = this.meter.createHistogram('graphql_request_duration_ms', {
    description: 'Duration of GraphQL requests in milliseconds',
    unit: 'ms',
    advice: {
      // Optimized buckets for typical GraphQL latencies
      explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
    }
  });

  private requestCounter = this.meter.createCounter('graphql_requests_total', {
    description: 'Total number of GraphQL requests'
  });

  private errorCounter = this.meter.createCounter('graphql_request_errors_total', {
    description: 'Total number of GraphQL request errors'
  });

  // String pools to reduce memory allocation for common labels
  private operationNamePool = new Map<string, string>();
  private serviceNamePool = new Map<string, string>();
  private appNamePool = new Map<string, string>();

  // Sampling for telemetry to reduce overhead at scale
  private telemetrySampleRate: number;
  private errorSampleRate: number;

  private constructor() {
    this.telemetrySampleRate = parseFloat(process.env.TELEMETRY_SAMPLE_RATE || '0.1'); // 10% default
    this.errorSampleRate = parseFloat(process.env.TELEMETRY_ERROR_SAMPLE_RATE || '1.0'); // 100% errors
  }

  static getInstance(): LatencyTelemetryService {
    if (!LatencyTelemetryService.instance) {
      LatencyTelemetryService.instance = new LatencyTelemetryService();
    }
    return LatencyTelemetryService.instance;
  }

  /**
   * Record request latency with optimized sampling and pooled labels
   */
  recordRequestLatency(data: {
    latencyMs: number;
    serviceId: string;
    serviceName?: string;
    applicationId: string;
    applicationName?: string;
    operationName: string;
    operationType: string;
    hasErrors: boolean;
    authType: string;
    statusCode?: number;
  }): void {
    try {
      // Apply sampling (always record errors)
      const shouldRecord = data.hasErrors ? Math.random() < this.errorSampleRate : Math.random() < this.telemetrySampleRate;

      if (!shouldRecord) return;

      // Use pooled strings to reduce memory allocation
      const operationName = this.getPooledString(this.operationNamePool, data.operationName);
      const serviceName = this.getPooledString(this.serviceNamePool, data.serviceName || 'unknown');
      const appName = this.getPooledString(this.appNamePool, data.applicationName || 'unknown');

      // Minimal label set for high-cardinality metrics
      const coreLabels = {
        operation_type: data.operationType,
        auth_type: data.authType,
        has_errors: String(data.hasErrors)
      };

      // Extended labels for counters (lower volume)
      const extendedLabels = {
        ...coreLabels,
        operation_name: operationName,
        service_name: serviceName,
        application_name: appName
      };

      // Record core metrics
      this.requestLatencyHistogram.record(data.latencyMs, coreLabels);
      this.requestCounter.add(1, extendedLabels);

      // Record errors separately
      if (data.hasErrors) {
        this.errorCounter.add(1, extendedLabels);
      }
    } catch (error) {
      // Minimal error handling to avoid telemetry impacting requests
      if (Math.random() < 0.0001) {
        // Log 0.01% of telemetry errors
        log.debug('Telemetry recording error', { error });
      }
    }
  }

  /**
   * String interning to reduce memory usage for repeated labels
   */
  private getPooledString(pool: Map<string, string>, value: string): string {
    let pooled = pool.get(value);
    if (!pooled) {
      // Limit pool size to prevent memory leaks
      if (pool.size > 10000) {
        pool.clear();
      }
      pooled = value;
      pool.set(value, pooled);
    }
    return pooled;
  }

  /**
   * Record business metrics with minimal overhead
   */
  recordBusinessMetric(metricName: string, value: number, labels: Record<string, string>): void {
    try {
      if (Math.random() < 0.01) {
        // 1% sampling for business metrics
        const counter = this.meter.createCounter(`graphql_business_${metricName}`, {
          description: `Business metric: ${metricName}`
        });
        counter.add(value, labels);
      }
    } catch (error) {
      // Silent failure for business metrics
    }
  }

  /**
   * Get telemetry health metrics
   */
  getHealthMetrics() {
    return {
      telemetrySampleRate: this.telemetrySampleRate,
      errorSampleRate: this.errorSampleRate,
      poolSizes: {
        operationNames: this.operationNamePool.size,
        serviceNames: this.serviceNamePool.size,
        applicationNames: this.appNamePool.size
      },
      memoryEstimateKB: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage of string pools
   */
  private estimateMemoryUsage(): number {
    let total = 0;

    for (const [key, value] of this.operationNamePool) {
      total += key.length + value.length;
    }

    for (const [key, value] of this.serviceNamePool) {
      total += key.length + value.length;
    }

    for (const [key, value] of this.appNamePool) {
      total += key.length + value.length;
    }

    return total / 1024; // Convert to KB
  }

  /**
   * Clear string pools (for maintenance)
   */
  clearPools(): void {
    this.operationNamePool.clear();
    this.serviceNamePool.clear();
    this.appNamePool.clear();
  }

  /**
   * Update sampling rates at runtime
   */
  updateSampleRates(telemetryRate?: number, errorRate?: number): void {
    if (telemetryRate !== undefined) {
      this.telemetrySampleRate = Math.max(0, Math.min(1, telemetryRate));
    }
    if (errorRate !== undefined) {
      this.errorSampleRate = Math.max(0, Math.min(1, errorRate));
    }

    log.info('Telemetry sample rates updated', {
      telemetrySampleRate: this.telemetrySampleRate,
      errorSampleRate: this.errorSampleRate
    });
  }
}

// Export singleton instance
export const latencyTelemetry = LatencyTelemetryService.getInstance();

// Helper function to register this service with TypeDI if needed
export function registerLatencyTelemetryService(): void {
  if (!Container.has('LatencyTelemetryService')) {
    Container.set('LatencyTelemetryService', latencyTelemetry);
  }
}
