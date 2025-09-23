import { Inject, Service as TypeDIService } from 'typedi';
import { Repository } from 'typeorm';
import { RequestLatency } from '../../entities/request-latency.entity';
import { log } from '../../utils/logger';

export interface LatencyTrackingData {
  serviceId: string;
  applicationId: string;
  userId?: string;
  operationName: string;
  operationType: string;
  latencyMs: number;
  hasErrors: boolean;
  statusCode?: number;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
  authType: string;
}

export interface LatencyMetrics {
  averageLatency: number;
  p50Latency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;
  minLatency: number;
  totalRequests: number;
  errorRate: number;
}

export interface LatencyAnalysisFilters {
  serviceIds?: string[];
  applicationIds?: string[];
  userIds?: string[];
  startDate?: string;
  endDate?: string;
  operationNames?: string[];
  operationTypes?: string[];
  hasErrors?: boolean;
  minLatency?: number;
  maxLatency?: number;
  authTypes?: string[];
  latencyTypes?: string[]; // 'gateway_operation' or 'downstream_service'
}

@TypeDIService()
export class RequestLatencyService {
  constructor(@Inject('RequestLatencyRepository') private readonly repository: Repository<RequestLatency>) {}

  /**
   * Record a single request latency measurement
   */
  async recordLatency(data: LatencyTrackingData): Promise<void> {
    try {
      const now = new Date();
      const latencyRecord = this.repository.create({
        ...data,
        date: now.toISOString().split('T')[0], // YYYY-MM-DD
        hour: now.getUTCHours(),
        latencyType: 'gateway_operation', // Default to gateway operation
        createdAt: now
      });

      await this.repository.save(latencyRecord);

      log.debug('Request latency recorded', {
        operation: 'latencyTracking',
        serviceId: data.serviceId,
        applicationId: data.applicationId,
        latencyMs: data.latencyMs,
        operationName: data.operationName
      });
    } catch (error) {
      log.error('Failed to record request latency', {
        operation: 'latencyTrackingError',
        error,
        data
      });
      // Don't throw - latency tracking shouldn't break requests
    }
  }

  /**
   * Record downstream service call latency
   */
  async recordDownstreamLatency(data: {
    serviceId: string;
    applicationId: string;
    userId?: string;
    serviceUrl: string;
    latencyMs: number;
    success: boolean;
    statusCode?: number;
    httpMethod: string;
    operationName?: string;
    errorClass?: string;
    errorMessage?: string;
    correlationId?: string;
    requestSizeBytes?: number;
    responseSizeBytes?: number;
  }): Promise<void> {
    try {
      const now = new Date();
      const latencyRecord = this.repository.create({
        serviceId: data.serviceId,
        applicationId: data.applicationId,
        userId: data.userId,
        operationName: data.operationName || 'downstream_call',
        operationType: 'downstream',
        latencyMs: data.latencyMs,
        hasErrors: !data.success,
        statusCode: data.statusCode || (data.success ? 200 : 500),
        correlationId: data.correlationId,
        requestSizeBytes: data.requestSizeBytes,
        responseSizeBytes: data.responseSizeBytes,
        authType: 'api_key', // Downstream calls typically use API keys
        latencyType: 'downstream_service',
        date: now.toISOString().split('T')[0], // YYYY-MM-DD
        hour: now.getUTCHours(),
        createdAt: now
      });

      await this.repository.save(latencyRecord);

      log.debug('Downstream service latency recorded', {
        operation: 'downstreamLatencyTracking',
        serviceId: data.serviceId,
        applicationId: data.applicationId,
        latencyMs: data.latencyMs,
        serviceUrl: data.serviceUrl,
        success: data.success
      });
    } catch (error) {
      log.error('Failed to record downstream service latency', {
        operation: 'downstreamLatencyTrackingError',
        error,
        data
      });
      // Don't throw - latency tracking shouldn't break requests
    }
  }

  /**
   * Get aggregated latency metrics for services, applications, or users
   */
  async getLatencyMetrics(filters: LatencyAnalysisFilters = {}): Promise<LatencyMetrics[]> {
    try {
      const query = this.repository
        .createQueryBuilder('rl')
        .select([
          'AVG(rl.latencyMs) as averageLatency',
          'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rl.latencyMs) as p50Latency',
          'PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY rl.latencyMs) as p90Latency',
          'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.latencyMs) as p95Latency',
          'PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rl.latencyMs) as p99Latency',
          'MAX(rl.latencyMs) as maxLatency',
          'MIN(rl.latencyMs) as minLatency',
          'COUNT(*) as totalRequests',
          'ROUND(AVG(CASE WHEN rl.hasErrors THEN 1.0 ELSE 0.0 END) * 100, 2) as errorRate'
        ]);

      this.applyFilters(query, filters);

      const result = await query.getRawOne();

      return [
        {
          averageLatency: parseFloat(result.averagelatency || result.averageLatency) || 0,
          p50Latency: parseFloat(result.p50latency || result.p50Latency) || 0,
          p90Latency: parseFloat(result.p90latency || result.p90Latency) || 0,
          p95Latency: parseFloat(result.p95latency || result.p95Latency) || 0,
          p99Latency: parseFloat(result.p99latency || result.p99Latency) || 0,
          maxLatency: parseFloat(result.maxlatency || result.maxLatency) || 0,
          minLatency: parseFloat(result.minlatency || result.minLatency) || 0,
          totalRequests: parseInt(result.totalrequests || result.totalRequests) || 0,
          errorRate: parseFloat(result.errorrate || result.errorRate) || 0
        }
      ];
    } catch (error) {
      log.error('Failed to get latency metrics', { error, filters });
      throw error;
    }
  }

  /**
   * Get slowest services ranked by average latency
   */
  async getSlowestServices(
    limit: number = 10,
    filters: LatencyAnalysisFilters = {}
  ): Promise<
    Array<{
      serviceId: string;
      serviceName: string;
      averageLatency: number;
      p95Latency: number;
      totalRequests: number;
      errorRate: number;
    }>
  > {
    try {
      const query = this.repository
        .createQueryBuilder('rl')
        .leftJoin('rl.service', 's')
        .select([
          'rl.serviceId as serviceId',
          's.name as serviceName',
          'AVG(rl.latencyMs) as averageLatency',
          'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.latencyMs) as p95Latency',
          'COUNT(*) as totalRequests',
          'ROUND(AVG(CASE WHEN rl.hasErrors THEN 1.0 ELSE 0.0 END) * 100, 2) as errorRate'
        ])
        .groupBy('rl.serviceId, s.name')
        .orderBy('averageLatency', 'DESC')
        .limit(limit);

      this.applyFilters(query, filters);

      const results = await query.getRawMany();

      return results.map((result) => ({
        serviceId: result.serviceid || result.serviceId,
        serviceName: result.servicename || result.serviceName || 'Unknown',
        averageLatency: parseFloat(result.averagelatency || result.averageLatency) || 0,
        p95Latency: parseFloat(result.p95latency || result.p95Latency) || 0,
        totalRequests: parseInt(result.totalrequests || result.totalRequests) || 0,
        errorRate: parseFloat(result.errorrate || result.errorRate) || 0
      }));
    } catch (error) {
      log.error('Failed to get slowest services', { error, filters });
      throw error;
    }
  }

  /**
   * Get most active applications by request volume and their performance
   */
  async getMostActiveApplications(
    limit: number = 10,
    filters: LatencyAnalysisFilters = {}
  ): Promise<
    Array<{
      applicationId: string;
      applicationName: string;
      totalRequests: number;
      averageLatency: number;
      p95Latency: number;
      errorRate: number;
    }>
  > {
    try {
      const query = this.repository
        .createQueryBuilder('rl')
        .leftJoin('rl.application', 'a')
        .select([
          'rl.applicationId as applicationId',
          'a.name as applicationName',
          'COUNT(*) as totalRequests',
          'AVG(rl.latencyMs) as averageLatency',
          'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.latencyMs) as p95Latency',
          'ROUND(AVG(CASE WHEN rl.hasErrors THEN 1.0 ELSE 0.0 END) * 100, 2) as errorRate'
        ])
        .groupBy('rl.applicationId, a.name')
        .orderBy('totalRequests', 'DESC')
        .limit(limit);

      this.applyFilters(query, filters);

      const results = await query.getRawMany();

      return results.map((result) => ({
        applicationId: result.applicationid || result.applicationId,
        applicationName: result.applicationname || result.applicationName || 'Unknown',
        totalRequests: parseInt(result.totalrequests || result.totalRequests) || 0,
        averageLatency: parseFloat(result.averagelatency || result.averageLatency) || 0,
        p95Latency: parseFloat(result.p95latency || result.p95Latency) || 0,
        errorRate: parseFloat(result.errorrate || result.errorRate) || 0
      }));
    } catch (error) {
      log.error('Failed to get most active applications', { error, filters });
      throw error;
    }
  }

  /**
   * Get latency trends over time (hourly aggregation)
   */
  async getLatencyTrends(filters: LatencyAnalysisFilters = {}): Promise<
    Array<{
      date: string;
      hour: number;
      averageLatency: number;
      p95Latency: number;
      totalRequests: number;
      errorRate: number;
    }>
  > {
    try {
      const query = this.repository
        .createQueryBuilder('rl')
        .select([
          'rl.date as date',
          'rl.hour as hour',
          'AVG(rl.latencyMs) as averageLatency',
          'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.latencyMs) as p95Latency',
          'COUNT(*) as totalRequests',
          'ROUND(AVG(CASE WHEN rl.hasErrors THEN 1.0 ELSE 0.0 END) * 100, 2) as errorRate'
        ])
        .groupBy('rl.date, rl.hour')
        .orderBy('rl.date', 'DESC')
        .addOrderBy('rl.hour', 'DESC')
        .limit(168); // Last 7 days * 24 hours

      this.applyFilters(query, filters);

      const results = await query.getRawMany();

      return results.map((result) => ({
        date: result.date,
        hour: parseInt(result.hour),
        averageLatency: parseFloat(result.averagelatency || result.averageLatency) || 0,
        p95Latency: parseFloat(result.p95latency || result.p95Latency) || 0,
        totalRequests: parseInt(result.totalrequests || result.totalRequests) || 0,
        errorRate: parseFloat(result.errorrate || result.errorRate) || 0
      }));
    } catch (error) {
      log.error('Failed to get latency trends', { error, filters });
      throw error;
    }
  }

  /**
   * Get slowest operations across all services
   */
  async getSlowestOperations(
    limit: number = 20,
    filters: LatencyAnalysisFilters = {}
  ): Promise<
    Array<{
      operationName: string;
      operationType: string;
      serviceId: string;
      serviceName: string;
      averageLatency: number;
      p95Latency: number;
      totalRequests: number;
      errorRate: number;
    }>
  > {
    try {
      const query = this.repository
        .createQueryBuilder('rl')
        .leftJoin('rl.service', 's')
        .select([
          'rl.operationName as operationName',
          'rl.operationType as operationType',
          'rl.serviceId as serviceId',
          's.name as serviceName',
          'AVG(rl.latencyMs) as averageLatency',
          'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.latencyMs) as p95Latency',
          'COUNT(*) as totalRequests',
          'ROUND(AVG(CASE WHEN rl.hasErrors THEN 1.0 ELSE 0.0 END) * 100, 2) as errorRate'
        ])
        .groupBy('rl.operationName, rl.operationType, rl.serviceId, s.name')
        .orderBy('averageLatency', 'DESC')
        .limit(limit);

      this.applyFilters(query, filters);

      const results = await query.getRawMany();

      return results.map((result) => ({
        operationName: result.operationname || result.operationName,
        operationType: result.operationtype || result.operationType,
        serviceId: result.serviceid || result.serviceId,
        serviceName: result.servicename || result.serviceName || 'Unknown',
        averageLatency: parseFloat(result.averagelatency || result.averageLatency) || 0,
        p95Latency: parseFloat(result.p95latency || result.p95Latency) || 0,
        totalRequests: parseInt(result.totalrequests || result.totalRequests) || 0,
        errorRate: parseFloat(result.errorrate || result.errorRate) || 0
      }));
    } catch (error) {
      log.error('Failed to get slowest operations', { error, filters });
      throw error;
    }
  }

  /**
   * Apply filters to a query builder
   */
  private applyFilters(query: any, filters: LatencyAnalysisFilters): void {
    if (filters.serviceIds?.length) {
      query.andWhere('rl.serviceId IN (:...serviceIds)', { serviceIds: filters.serviceIds });
    }

    if (filters.applicationIds?.length) {
      query.andWhere('rl.applicationId IN (:...applicationIds)', { applicationIds: filters.applicationIds });
    }

    if (filters.userIds?.length) {
      query.andWhere('rl.userId IN (:...userIds)', { userIds: filters.userIds });
    }

    if (filters.startDate) {
      query.andWhere('rl.date >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      query.andWhere('rl.date <= :endDate', { endDate: filters.endDate });
    }

    if (filters.operationNames?.length) {
      query.andWhere('rl.operationName IN (:...operationNames)', { operationNames: filters.operationNames });
    }

    if (filters.operationTypes?.length) {
      query.andWhere('rl.operationType IN (:...operationTypes)', { operationTypes: filters.operationTypes });
    }

    if (filters.hasErrors !== undefined) {
      query.andWhere('rl.hasErrors = :hasErrors', { hasErrors: filters.hasErrors });
    }

    if (filters.minLatency !== undefined) {
      query.andWhere('rl.latencyMs >= :minLatency', { minLatency: filters.minLatency });
    }

    if (filters.maxLatency !== undefined) {
      query.andWhere('rl.latencyMs <= :maxLatency', { maxLatency: filters.maxLatency });
    }

    if (filters.authTypes?.length) {
      query.andWhere('rl.authType IN (:...authTypes)', { authTypes: filters.authTypes });
    }

    if (filters.latencyTypes?.length) {
      query.andWhere('rl.latencyType IN (:...latencyTypes)', { latencyTypes: filters.latencyTypes });
    }
  }

  /**
   * Get raw request latency records with pagination and filtering
   */
  async getRequestLatencies(
    limit: number = 10,
    offset: number = 0,
    filters: LatencyAnalysisFilters = {}
  ): Promise<RequestLatency[]> {
    try {
      let query = this.repository
        .createQueryBuilder('rl')
        .leftJoinAndSelect('rl.service', 'service')
        .leftJoinAndSelect('rl.application', 'application')
        .leftJoinAndSelect('rl.user', 'user')
        .orderBy('rl.createdAt', 'DESC')
        .limit(limit)
        .offset(offset);

      this.applyFilters(query, filters);
      return await query.getMany();
    } catch (error) {
      log.error('Failed to get request latencies', { error, filters, limit, offset });
      return [];
    }
  }
}
