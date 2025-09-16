import { log } from './logger';

type HealthRecord = {
  consecutiveFailures: number;
  lastSuccess?: number;
  lastFailure?: number;
  unhealthySince?: number;
};

/**
 * Tracks per-service health based on schema fetches.
 * - After 2 consecutive failures, a service is considered unhealthy.
 * - Applies exponential backoff for retry attempts while unhealthy.
 */
class ServiceHealthMonitor {
  private records = new Map<string, HealthRecord>();
  private readonly threshold = 2; // failures to mark unhealthy
  private readonly baseBackoffMs = 5_000; // 5s
  private readonly maxBackoffMs = 5 * 60_000; // 5m

  private get(url: string): HealthRecord {
    let rec = this.records.get(url);
    if (!rec) {
      rec = { consecutiveFailures: 0 };
      this.records.set(url, rec);
    }
    return rec;
  }

  recordSuccess(url: string): boolean {
    const rec = this.get(url);
    const wasUnhealthy = this.isUnhealthy(url);
    rec.consecutiveFailures = 0;
    rec.lastSuccess = Date.now();
    rec.unhealthySince = undefined;
    if (wasUnhealthy) {
      log.info('Service recovered from unhealthy state', {
        operation: 'serviceHealth',
        metadata: { url }
      });
    }
    return wasUnhealthy; // indicates transition to healthy
  }

  recordFailure(url: string, error?: unknown): boolean {
    const rec = this.get(url);
    rec.consecutiveFailures += 1;
    rec.lastFailure = Date.now();
    if (rec.consecutiveFailures === this.threshold) {
      rec.unhealthySince = rec.lastFailure;
      log.warn('Service marked unhealthy (consecutive failures threshold reached)', {
        operation: 'serviceHealth',
        metadata: { url, consecutiveFailures: rec.consecutiveFailures }
      });
    }
    if (error) {
      log.debug('Service failure recorded', {
        operation: 'serviceHealth',
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { url, consecutiveFailures: rec.consecutiveFailures }
      });
    }
    return rec.consecutiveFailures === this.threshold; // indicates transition to unhealthy
  }

  isUnhealthy(url: string): boolean {
    return this.get(url).consecutiveFailures >= this.threshold;
  }

  /**
   * Returns whether we should attempt a fetch now.
   * If unhealthy, we honor exponential backoff based on consecutive failures.
   */
  shouldAttempt(url: string): boolean {
    const rec = this.get(url);
    if (!this.isUnhealthy(url)) return true;
    if (!rec.lastFailure) return true;
    const delay = this.nextRetryDelay(url);
    return Date.now() - rec.lastFailure >= delay;
  }

  nextRetryDelay(url: string): number {
    const rec = this.get(url);
    // failures over threshold control the backoff exponent
    const over = Math.max(0, rec.consecutiveFailures - this.threshold);
    const delay = this.baseBackoffMs * Math.pow(2, over);
    return Math.min(this.maxBackoffMs, delay);
  }

  summary() {
    const all = Array.from(this.records.entries()).map(([url, r]) => ({ url, ...r }));
    const unhealthy = all.filter((r) => r.consecutiveFailures >= this.threshold).map((r) => r.url);
    return {
      totalTracked: all.length,
      unhealthyCount: unhealthy.length,
      unhealthy,
      records: all
    };
  }
}

export const healthMonitor = new ServiceHealthMonitor();
