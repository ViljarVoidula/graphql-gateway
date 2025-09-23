import { Service as TypeDIService } from 'typedi';
import { log } from '../../utils/logger';

interface SamplingConfig {
  baseRate: number; // Base sampling rate (0.0-1.0)
  errorRate: number; // Always sample errors at this rate (0.0-1.0)
  slowRequestThresholdMs: number; // Always sample requests slower than this
  highVolumeThresholdRps: number; // Reduce sampling when RPS exceeds this
  adaptiveEnabled: boolean; // Enable adaptive sampling based on load
}

interface RequestMetrics {
  timestamp: number;
  operationName: string;
  serviceId: string;
  applicationId: string;
  latencyMs: number;
  hasErrors: boolean;
}

/**
 * Intelligent sampling service optimized for billion-request scale
 * Uses multiple strategies to minimize overhead while maintaining data quality
 */
@TypeDIService()
export class LatencySamplingService {
  private config: SamplingConfig;
  private recentRequests: RequestMetrics[] = [];
  private requestCounts = new Map<string, number>(); // operationName -> count
  private lastCleanup = Date.now();
  private readonly cleanupInterval = 60000; // 1 minute
  private readonly metricsWindow = 300000; // 5 minutes

  // Reservoir sampling for high-value requests
  private highValueReservoir: RequestMetrics[] = [];
  private readonly reservoirSize = 1000;
  private reservoirIndex = 0;

  // Pre-computed hash values for fast sampling decisions
  private readonly hashMultiplier = 0x9e3779b9; // Golden ratio hash
  private readonly hashMask = 0xffffffff;

  constructor() {
    this.config = {
      baseRate: parseFloat(process.env.LATENCY_SAMPLING_BASE_RATE || '0.01'), // 1% default
      errorRate: parseFloat(process.env.LATENCY_SAMPLING_ERROR_RATE || '1.0'), // 100% errors
      slowRequestThresholdMs: parseInt(process.env.LATENCY_SAMPLING_SLOW_THRESHOLD_MS || '2000'),
      highVolumeThresholdRps: parseInt(process.env.LATENCY_SAMPLING_HIGH_VOLUME_RPS || '10000'),
      adaptiveEnabled: process.env.LATENCY_SAMPLING_ADAPTIVE_ENABLED !== 'false'
    };

    log.info('Latency sampling service initialized', { config: this.config });
  }

  /**
   * Ultra-fast sampling decision (optimized for hot path)
   * Returns true if this request should be tracked
   */
  shouldSample(
    operationName: string,
    serviceId: string,
    applicationId: string,
    latencyMs: number,
    hasErrors: boolean,
    requestId: string
  ): boolean {
    // Always sample errors (high value)
    if (hasErrors && Math.random() < this.config.errorRate) {
      return true;
    }

    // Always sample slow requests (high value)
    if (latencyMs > this.config.slowRequestThresholdMs) {
      return true;
    }

    // Use hash-based sampling for consistent decisions
    const hash = this.fastHash(requestId);
    const threshold = this.calculateDynamicThreshold(operationName, serviceId, applicationId);

    return (hash & this.hashMask) < threshold * this.hashMask;
  }

  /**
   * Record request metrics for adaptive sampling (non-blocking)
   */
  recordRequest(operationName: string, serviceId: string, applicationId: string, latencyMs: number, hasErrors: boolean): void {
    const now = Date.now();

    // Periodic cleanup to prevent memory leaks
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanup();
      this.lastCleanup = now;
    }

    // Update operation counts for adaptive sampling
    const currentCount = this.requestCounts.get(operationName) || 0;
    this.requestCounts.set(operationName, currentCount + 1);

    // Track high-value requests in reservoir
    if (hasErrors || latencyMs > this.config.slowRequestThresholdMs) {
      this.addToReservoir({
        timestamp: now,
        operationName,
        serviceId,
        applicationId,
        latencyMs,
        hasErrors
      });
    }

    // Keep recent metrics for adaptive calculation (limited size)
    if (this.recentRequests.length < 10000) {
      // Cap memory usage
      this.recentRequests.push({
        timestamp: now,
        operationName,
        serviceId,
        applicationId,
        latencyMs,
        hasErrors
      });
    }
  }

  /**
   * Calculate dynamic sampling threshold based on current load
   */
  private calculateDynamicThreshold(operationName: string, serviceId: string, applicationId: string): number {
    if (!this.config.adaptiveEnabled) {
      return this.config.baseRate;
    }

    // Get current request rate for this operation
    const operationCount = this.requestCounts.get(operationName) || 0;
    const timeWindow = Math.min(Date.now() - this.lastCleanup, this.cleanupInterval);
    const operationRps = operationCount / (timeWindow / 1000);

    // Reduce sampling rate for high-volume operations
    if (operationRps > this.config.highVolumeThresholdRps) {
      const reductionFactor = Math.min(operationRps / this.config.highVolumeThresholdRps, 10);
      return Math.max(this.config.baseRate / reductionFactor, 0.001); // Minimum 0.1%
    }

    // Increase sampling for new or rare operations
    if (operationCount < 100) {
      return Math.min(this.config.baseRate * 2, 0.1); // Maximum 10%
    }

    return this.config.baseRate;
  }

  /**
   * Fast hash function for sampling decisions
   */
  private fastHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) * this.hashMultiplier;
  }

  /**
   * Add high-value request to reservoir using reservoir sampling algorithm
   */
  private addToReservoir(metrics: RequestMetrics): void {
    if (this.highValueReservoir.length < this.reservoirSize) {
      this.highValueReservoir.push(metrics);
    } else {
      // Replace random element with probability k/n
      const randomIndex = Math.floor(Math.random() * (this.reservoirIndex + 1));
      if (randomIndex < this.reservoirSize) {
        this.highValueReservoir[randomIndex] = metrics;
      }
    }
    this.reservoirIndex++;
  }

  /**
   * Cleanup old metrics to prevent memory leaks
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.metricsWindow;

    // Clean recent requests
    this.recentRequests = this.recentRequests.filter((r) => r.timestamp > cutoff);

    // Clean high-value reservoir
    this.highValueReservoir = this.highValueReservoir.filter((r) => r.timestamp > cutoff);

    // Reset operation counts
    this.requestCounts.clear();
    this.reservoirIndex = 0;

    log.debug('Latency sampling cleanup completed', {
      recentRequestsCount: this.recentRequests.length,
      reservoirCount: this.highValueReservoir.length
    });
  }

  /**
   * Get sampling statistics and health metrics
   */
  getStats() {
    const now = Date.now();
    const recentWindow = 60000; // 1 minute
    const recentRequests = this.recentRequests.filter((r) => r.timestamp > now - recentWindow);

    const totalRecent = recentRequests.length;
    const errorRecent = recentRequests.filter((r) => r.hasErrors).length;
    const slowRecent = recentRequests.filter((r) => r.latencyMs > this.config.slowRequestThresholdMs).length;

    return {
      config: this.config,
      metrics: {
        totalRecentRequests: totalRecent,
        errorRequestsRecent: errorRecent,
        slowRequestsRecent: slowRecent,
        avgLatencyRecent: totalRecent > 0 ? recentRequests.reduce((sum, r) => sum + r.latencyMs, 0) / totalRecent : 0,
        uniqueOperations: this.requestCounts.size,
        reservoirSize: this.highValueReservoir.length,
        memoryUsageKB: this.estimateMemoryUsage()
      }
    };
  }

  /**
   * Estimate current memory usage
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: each request metrics ~200 bytes
    const recentMemory = this.recentRequests.length * 200;
    const reservoirMemory = this.highValueReservoir.length * 200;
    const countsMemory = this.requestCounts.size * 50;

    return (recentMemory + reservoirMemory + countsMemory) / 1024; // Convert to KB
  }

  /**
   * Update sampling configuration at runtime
   */
  updateConfig(newConfig: Partial<SamplingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    log.info('Latency sampling configuration updated', { config: this.config });
  }

  /**
   * Get high-value requests from reservoir (for analysis)
   */
  getHighValueRequests(): RequestMetrics[] {
    return [...this.highValueReservoir];
  }

  /**
   * Force cleanup (for testing/maintenance)
   */
  forceCleanup(): void {
    this.cleanup();
  }
}
