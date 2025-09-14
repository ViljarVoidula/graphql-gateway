import { Arg, Field, Float, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { In, Repository } from 'typeorm';
import { dataSource } from '../../db/datasource';
import { ApplicationUsage } from '../../entities/application-usage.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { SchemaChange, SchemaChangeClassification } from '../../entities/schema-change.entity';
import { Service as ServiceEntity } from '../../entities/service.entity';

@ObjectType()
class SeverityCount {
  @Field()
  severity: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
class ActionCount {
  @Field()
  action: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
class AuditLogSummary {
  @Field(() => Int)
  totalLast24h: number;

  @Field(() => [SeverityCount])
  bySeverity: SeverityCount[];

  @Field(() => [ActionCount])
  topActions: ActionCount[];

  @Field({ nullable: true })
  lastEventAt?: Date;
}

@ObjectType()
class ServiceHealth {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  status: string;

  @Field(() => Int)
  breakingChanges24h: number;

  @Field(() => Float)
  errorRate24h: number; // 0..1

  @Field(() => Int)
  requestCount24h: number;

  @Field({ nullable: true })
  lastSchemaChangeAt?: Date;
}

@ObjectType()
class TopServiceUsage {
  @Field()
  serviceId: string;
  @Field()
  serviceName: string;
  @Field(() => Int)
  requestCount24h: number;
  @Field(() => Float)
  errorRate24h: number; // 0..1
}

@ObjectType()
class TopApplicationUsage {
  @Field()
  applicationId: string;
  @Field()
  applicationName: string;
  @Field(() => Int)
  requestCount24h: number;
  @Field(() => Int)
  apiKeyCount: number;
}

@ObjectType()
class UsageSummary {
  @Field(() => [TopServiceUsage])
  topServices: TopServiceUsage[];
  @Field(() => [TopApplicationUsage])
  topApplications: TopApplicationUsage[];
  @Field()
  generatedAt: Date;
}

@Service()
@Resolver()
export class HealthResolver {
  /**
   * Performance Notes:
   * - Methods apply a lightweight in-process TTL cache (default 5s) to shield the DB from rapid dashboard polling.
   *   Configure via HEALTH_RESOLVER_TTL_MS (set to 0 or negative to disable caching).
   * - Aggregations are written to minimize round trips (auditLogSummary uses a CTE & json_agg for severity buckets
   *   and window-style aggregates for total & last event timestamp in a single query).
   * - Additional helper indexes added in migration 1760000000000-AdditionalHealthPerfIndexes.ts:
   *     * audit_logs(createdAt DESC, severity) & (createdAt DESC, action)
   *     * schema_changes(serviceId, createdAt DESC, classification)
   *     * application_usage(serviceId, date) & (applicationId, date)
   * - For very large audit_logs volumes (millions/day) consider time-partitioning with a composite primary key
   *   including createdAt; current migration leaves table unpartitioned due to single-column PK constraint.
   */
  private auditRepo: Repository<AuditLog> = dataSource.getRepository(AuditLog);
  private serviceRepo: Repository<ServiceEntity> = dataSource.getRepository(ServiceEntity);
  private schemaChangeRepo: Repository<SchemaChange> = dataSource.getRepository(SchemaChange);
  private usageRepo: Repository<ApplicationUsage> = dataSource.getRepository(ApplicationUsage);

  // --- Simple in-memory TTL cache (process local) ---
  private cache = new Map<string, { expires: number; value: any }>();
  private ttlMs = parseInt(process.env.HEALTH_RESOLVER_TTL_MS || '5000', 10); // default 5s
  private getCached<T>(key: string): T | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expires) {
      this.cache.delete(key);
      return null;
    }
    return hit.value as T;
  }
  private setCached(key: string, value: any) {
    if (this.ttlMs <= 0) return; // disabled if ttl <=0
    this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  @Query(() => AuditLogSummary)
  async auditLogSummary(@Arg('hours', () => Int, { defaultValue: 24 }) hours: number): Promise<AuditLogSummary> {
    const cacheKey = `audit:${hours}`;
    const cached = this.getCached<AuditLogSummary>(cacheKey);
    if (cached) return cached;
    const since = new Date(Date.now() - hours * 3600 * 1000);
    // Total (createdAt > since)
    // Combined severity aggregation with window total and max createdAt using CTE for fewer round trips.
    const severityAgg = await this.auditRepo.query(
      `WITH filtered AS (
         SELECT severity, "createdAt" FROM audit_logs WHERE "createdAt" > $1
       )
       , dist AS (
         SELECT severity, COUNT(*)::bigint AS count FROM filtered WHERE severity IS NOT NULL GROUP BY severity
       )
       SELECT (SELECT COUNT(*) FROM filtered) AS total,
              (SELECT MAX("createdAt") FROM filtered) AS last_event_at,
              json_agg(json_build_object('severity', d.severity::text, 'count', d.count) ORDER BY d.count DESC) AS buckets,
              (SELECT COUNT(*) FROM filtered WHERE severity IS NULL) AS null_severity
       FROM dist d
       LIMIT 1;`,
      [since]
    );
    const sevRow = severityAgg[0] || { total: 0, last_event_at: null, buckets: null, null_severity: 0 };
    const total = parseInt(sevRow.total, 10) || 0;
    const lastEventAt = sevRow.last_event_at ? new Date(sevRow.last_event_at) : null;
    const severityBuckets: { severity: string; count: number }[] = Array.isArray(sevRow.buckets)
      ? sevRow.buckets.map((b: any) => ({ severity: b.severity, count: parseInt(b.count, 10) }))
      : [];
    const nullSeverityCount = parseInt(sevRow.null_severity, 10) || 0;
    const actionRaw = await this.auditRepo
      .createQueryBuilder('a')
      .select('COALESCE(a.action, :empty)', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('a."createdAt" > :since', { since, empty: 'unknown' })
      .groupBy('action')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();
    const result: AuditLogSummary = {
      totalLast24h: total,
      bySeverity: [...severityBuckets, ...(nullSeverityCount > 0 ? [{ severity: 'none', count: nullSeverityCount }] : [])],
      topActions: actionRaw.map((r) => ({ action: r.action, count: parseInt(r.count, 10) })),
      lastEventAt
    };
    this.setCached(cacheKey, result);
    return result;
  }

  @Query(() => [ServiceHealth])
  async serviceHealth(@Arg('hours', () => Int, { defaultValue: 24 }) hours: number): Promise<ServiceHealth[]> {
    const cacheKey = `svcHealth:${hours}`;
    const cached = this.getCached<ServiceHealth[]>(cacheKey);
    if (cached) return cached;
    const since = new Date(Date.now() - hours * 3600 * 1000);
    const services = await this.serviceRepo.find();
    if (services.length === 0) return [];
    // Breaking changes counts
    const breakingRaw = await this.schemaChangeRepo
      .createQueryBuilder('sc')
      .select('sc.serviceId', 'serviceId')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('MAX(sc."createdAt")', 'last')
      .where('sc."createdAt" > :since', { since })
      .andWhere('sc.classification = :cls', { cls: SchemaChangeClassification.BREAKING })
      .groupBy('sc.serviceId')
      .getRawMany();
    const breakingMap: Record<string, { cnt: number; last: Date }> = {};
    for (const r of breakingRaw) breakingMap[r.serviceId] = { cnt: parseInt(r.cnt, 10), last: r.last };
    // Application usage aggregated by serviceId for today (approx last 24h; date granularity)
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const dateStrings = Array.from(new Set([today.toISOString().substring(0, 10), yesterday.toISOString().substring(0, 10)]));
    const usageRaw = await this.usageRepo
      .createQueryBuilder('u')
      .select('u.serviceId', 'serviceId')
      .addSelect('SUM(u.requestCount)', 'req')
      .addSelect('SUM(u.errorCount)', 'err')
      .where('u.date IN (:...dates)', { dates: dateStrings })
      .groupBy('u.serviceId')
      .getRawMany();
    const usageMap: Record<string, { req: number; err: number }> = {};
    for (const r of usageRaw) usageMap[r.serviceId] = { req: parseInt(r.req, 10), err: parseInt(r.err, 10) };
    const result = services.map((s) => {
      const br = breakingMap[s.id];
      const us = usageMap[s.id];
      const requestCount24h = us?.req || 0;
      const errorRate24h = requestCount24h > 0 ? (us!.err || 0) / requestCount24h : 0;
      return {
        id: s.id,
        name: s.name,
        status: s.status,
        breakingChanges24h: br?.cnt || 0,
        errorRate24h,
        requestCount24h,
        lastSchemaChangeAt: br?.last || null
      };
    });
    this.setCached(cacheKey, result);
    return result;
  }

  @Query(() => UsageSummary)
  async usageSummary(@Arg('limit', () => Int, { defaultValue: 5 }) limit: number): Promise<UsageSummary> {
    const cacheKey = `usage:${limit}`;
    const cached = this.getCached<UsageSummary>(cacheKey);
    if (cached) return cached;
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const dateStrings = Array.from(new Set([today.toISOString().substring(0, 10), yesterday.toISOString().substring(0, 10)]));
    const rawService = await this.usageRepo
      .createQueryBuilder('u')
      .select('u.serviceId', 'serviceId')
      .addSelect('SUM(u.requestCount)', 'req')
      .addSelect('SUM(u.errorCount)', 'err')
      .where('u.date IN (:...dates)', { dates: dateStrings })
      .groupBy('u.serviceId')
      .orderBy('req', 'DESC')
      .limit(limit)
      .getRawMany();
    const serviceIds = rawService.map((r) => r.serviceId);
    const services = serviceIds.length ? await this.serviceRepo.find({ where: { id: In(serviceIds) } }) : [];
    const serviceNameMap: Record<string, string> = {};
    for (const s of services) serviceNameMap[s.id] = s.name;
    const topServices: TopServiceUsage[] = rawService.map((r) => ({
      serviceId: r.serviceId,
      serviceName: serviceNameMap[r.serviceId] || 'unknown',
      requestCount24h: parseInt(r.req, 10),
      errorRate24h: parseInt(r.req, 10) > 0 ? parseInt(r.err, 10) / parseInt(r.req, 10) : 0
    }));

    // Applications
    const rawApp = await this.usageRepo
      .createQueryBuilder('u')
      .select('u.applicationId', 'applicationId')
      .addSelect('SUM(u.requestCount)', 'req')
      .where('u.date IN (:...dates)', { dates: dateStrings })
      .groupBy('u.applicationId')
      .orderBy('req', 'DESC')
      .limit(limit)
      .getRawMany();
    const appIds = rawApp.map((r) => r.applicationId);
    let appNameMap: Record<string, { name: string; apiKeyCount: number }> = {};
    if (appIds.length) {
      const rows = await dataSource.query(
        `SELECT a.id, a.name, COUNT(k.id) as keyCount FROM applications a LEFT JOIN api_keys k ON k."applicationId" = a.id WHERE a.id = ANY($1) GROUP BY a.id`,
        [appIds]
      );
      for (const r of rows) appNameMap[r.id] = { name: r.name, apiKeyCount: parseInt(r.keycount ?? r.keyCount ?? '0', 10) };
    }
    const topApplications: TopApplicationUsage[] = rawApp.map((r) => ({
      applicationId: r.applicationId,
      applicationName: appNameMap[r.applicationId]?.name || 'unknown',
      requestCount24h: parseInt(r.req, 10),
      apiKeyCount: appNameMap[r.applicationId]?.apiKeyCount || 0
    }));
    const result: UsageSummary = { topServices, topApplications, generatedAt: new Date() };
    this.setCached(cacheKey, result);
    return result;
  }
}
