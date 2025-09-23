import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { Service as TypeDIService } from 'typedi';
import { LatencyBatchWriter } from './latency-batch-writer.service';
import { LatencyDataLifecycleService } from './latency-lifecycle.service';
import { LatencySamplingService } from './latency-sampling.service';
import { latencyTelemetry } from './latency-telemetry.service';

@ObjectType()
class BatchWriterMetrics {
  @Field()
  bufferSize: number;

  @Field()
  maxBufferSize: number;

  @Field()
  droppedRecords: number;

  @Field()
  memoryUsageMB: number;

  @Field()
  maxMemoryMB: number;

  @Field()
  circuitBreakerOpen: boolean;

  @Field()
  circuitBreakerFailures: number;

  @Field()
  timeSinceLastFlushMs: number;

  @Field()
  flushInProgress: boolean;

  @Field()
  healthy: boolean;
}

@ObjectType()
class SamplingMetrics {
  @Field()
  baseRate: number;

  @Field()
  errorRate: number;

  @Field()
  totalRecentRequests: number;

  @Field()
  errorRequestsRecent: number;

  @Field()
  slowRequestsRecent: number;

  @Field()
  avgLatencyRecent: number;

  @Field()
  uniqueOperations: number;

  @Field()
  reservoirSize: number;

  @Field()
  memoryUsageKB: number;
}

@ObjectType()
class TelemetryMetrics {
  @Field()
  telemetrySampleRate: number;

  @Field()
  errorSampleRate: number;

  @Field()
  operationNamePoolSize: number;

  @Field()
  serviceNamePoolSize: number;

  @Field()
  applicationNamePoolSize: number;

  @Field()
  memoryEstimateKB: number;
}

@ObjectType()
class LifecycleMetrics {
  @Field()
  retentionDays: number;

  @Field()
  archivalEnabled: boolean;

  @Field()
  compressionEnabled: boolean;

  @Field()
  partitioningEnabled: boolean;

  @Field({ nullable: true })
  lastCleanup?: Date;

  @Field({ nullable: true })
  lastCleanupAgeHours?: number;

  @Field()
  isRunning: boolean;

  @Field()
  healthy: boolean;

  @Field({ nullable: true })
  recordsDeleted?: number;

  @Field({ nullable: true })
  recordsArchived?: number;
}

@ObjectType()
class LatencyTrackingHealth {
  @Field()
  enabled: boolean;

  @Field()
  batchWriter: BatchWriterMetrics;

  @Field()
  sampling: SamplingMetrics;

  @Field()
  telemetry: TelemetryMetrics;

  @Field()
  lifecycle: LifecycleMetrics;

  @Field()
  overallHealthy: boolean;

  @Field()
  version: string;
}

@TypeDIService()
@Resolver()
export class LatencyHealthResolver {
  constructor(
    private readonly batchWriter: LatencyBatchWriter,
    private readonly samplingService: LatencySamplingService,
    private readonly lifecycleService: LatencyDataLifecycleService
  ) {}

  @Query(() => LatencyTrackingHealth, { description: 'Get comprehensive health status of latency tracking system' })
  async latencyTrackingHealth(): Promise<LatencyTrackingHealth> {
    try {
      // Get metrics from all components
      const batchMetrics = this.batchWriter.getMetrics();
      const samplingStats = this.samplingService.getStats();
      const telemetryHealth = latencyTelemetry.getHealthMetrics();
      const lifecycleHealth = this.lifecycleService.getHealthStatus();

      // Determine overall health
      const overallHealthy = batchMetrics.healthy && lifecycleHealth.healthy && !batchMetrics.circuitBreakerOpen;

      return {
        enabled: true,
        batchWriter: {
          bufferSize: batchMetrics.bufferSize,
          maxBufferSize: batchMetrics.maxBufferSize,
          droppedRecords: batchMetrics.droppedRecords,
          memoryUsageMB: batchMetrics.memoryUsageMB,
          maxMemoryMB: batchMetrics.maxMemoryMB,
          circuitBreakerOpen: batchMetrics.circuitBreakerOpen,
          circuitBreakerFailures: batchMetrics.circuitBreakerFailures,
          timeSinceLastFlushMs: batchMetrics.timeSinceLastFlushMs,
          flushInProgress: batchMetrics.flushInProgress,
          healthy: batchMetrics.healthy
        },
        sampling: {
          baseRate: samplingStats.config.baseRate,
          errorRate: samplingStats.config.errorRate,
          totalRecentRequests: samplingStats.metrics.totalRecentRequests,
          errorRequestsRecent: samplingStats.metrics.errorRequestsRecent,
          slowRequestsRecent: samplingStats.metrics.slowRequestsRecent,
          avgLatencyRecent: samplingStats.metrics.avgLatencyRecent,
          uniqueOperations: samplingStats.metrics.uniqueOperations,
          reservoirSize: samplingStats.metrics.reservoirSize,
          memoryUsageKB: samplingStats.metrics.memoryUsageKB
        },
        telemetry: {
          telemetrySampleRate: telemetryHealth.telemetrySampleRate,
          errorSampleRate: telemetryHealth.errorSampleRate,
          operationNamePoolSize: telemetryHealth.poolSizes.operationNames,
          serviceNamePoolSize: telemetryHealth.poolSizes.serviceNames,
          applicationNamePoolSize: telemetryHealth.poolSizes.applicationNames,
          memoryEstimateKB: telemetryHealth.memoryEstimateKB
        },
        lifecycle: {
          retentionDays: lifecycleHealth.policy.retentionDays,
          archivalEnabled: lifecycleHealth.policy.archivalEnabled,
          compressionEnabled: lifecycleHealth.policy.compressionEnabled,
          partitioningEnabled: lifecycleHealth.policy.partitioningEnabled,
          lastCleanup: lifecycleHealth.lastCleanup,
          lastCleanupAgeHours: lifecycleHealth.lastCleanupAgeHours,
          isRunning: lifecycleHealth.isRunning,
          healthy: lifecycleHealth.healthy,
          recordsDeleted: lifecycleHealth.stats?.recordsDeleted,
          recordsArchived: lifecycleHealth.stats?.recordsArchived
        },
        overallHealthy,
        version: '1.0.0'
      };
    } catch (error) {
      // Return minimal health status if components are not available
      return {
        enabled: false,
        batchWriter: {
          bufferSize: 0,
          maxBufferSize: 0,
          droppedRecords: 0,
          memoryUsageMB: 0,
          maxMemoryMB: 0,
          circuitBreakerOpen: true,
          circuitBreakerFailures: 0,
          timeSinceLastFlushMs: 0,
          flushInProgress: false,
          healthy: false
        },
        sampling: {
          baseRate: 0,
          errorRate: 0,
          totalRecentRequests: 0,
          errorRequestsRecent: 0,
          slowRequestsRecent: 0,
          avgLatencyRecent: 0,
          uniqueOperations: 0,
          reservoirSize: 0,
          memoryUsageKB: 0
        },
        telemetry: {
          telemetrySampleRate: 0,
          errorSampleRate: 0,
          operationNamePoolSize: 0,
          serviceNamePoolSize: 0,
          applicationNamePoolSize: 0,
          memoryEstimateKB: 0
        },
        lifecycle: {
          retentionDays: 0,
          archivalEnabled: false,
          compressionEnabled: false,
          partitioningEnabled: false,
          isRunning: false,
          healthy: false
        },
        overallHealthy: false,
        version: '1.0.0'
      };
    }
  }
}
