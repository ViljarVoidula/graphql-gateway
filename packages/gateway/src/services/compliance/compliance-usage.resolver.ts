import { Arg, Ctx, Directive, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { dataSource } from '../../db/datasource';
import { log } from '../../utils/logger';

@ObjectType()
class SessionApplicationDailyUsage {
  @Field()
  sessionId!: string; // '∅' placeholder possible

  @Field()
  applicationId!: string; // '∅' placeholder possible

  @Field(() => Date)
  usageDate!: Date;

  @Field(() => Int)
  requestCount!: number;

  @Field(() => Int)
  errorCount!: number;

  @Field(() => Int)
  distinctOperations!: number;

  @Field(() => Date)
  firstSeenAt!: Date;

  @Field(() => Date)
  lastSeenAt!: Date;
}

@Service()
@Resolver(SessionApplicationDailyUsage)
export class ComplianceUsageResolver {
  /**
   * Returns daily session/application aggregates. Prefers materialized view; falls back to live aggregation
   * if MV row(s) missing or MV absent. Admin only due to potential sensitivity.
   */
  @Query(() => [SessionApplicationDailyUsage])
  @Directive('@authz(rules: ["isAdmin"])')
  async sessionApplicationDailyUsage(
    @Arg('sessionId', { nullable: true }) sessionId: string | null,
    @Arg('applicationId', { nullable: true }) applicationId: string | null,
    @Arg('days', () => Int, { defaultValue: 7 }) days: number,
    @Ctx() _context: ExtendedYogaContext
  ): Promise<SessionApplicationDailyUsage[]> {
    const ds = dataSource;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Try MV first
    try {
      const params: any[] = [since];
      const filters: string[] = ['usage_date >= $1'];
      if (sessionId) {
        params.push(sessionId);
        filters.push('session_id = $' + params.length);
      }
      if (applicationId) {
        params.push(applicationId);
        filters.push('application_id = $' + params.length);
      }
      const sql = `SELECT session_id as "sessionId", application_id as "applicationId", usage_date as "usageDate", request_count as "requestCount", error_count as "errorCount", distinct_operations as "distinctOperations", first_seen_at as "firstSeenAt", last_seen_at as "lastSeenAt" FROM mv_session_application_daily_usage WHERE ${filters.join(' AND ')} ORDER BY usage_date DESC, session_id LIMIT 500`;
      const rows = await ds.query(sql, params);
      if (rows.length > 0) return rows;
    } catch (e) {
      log.debug('MV query failed (falling back to live aggregation)', {
        operation: 'complianceUsageMV',
        error: e instanceof Error ? e : String(e)
      });
    }

    // Fallback: aggregate live from audit_logs (bounded by days window)
    try {
      const params: any[] = [since];
      const filters: string[] = ['"createdAt" >= $1', '"eventType" = \'api_request\''];
      if (sessionId) {
        params.push(sessionId);
        filters.push('"sessionId" = $' + params.length);
      }
      if (applicationId) {
        params.push(applicationId);
        filters.push('"applicationId" = $' + params.length);
      }
      const sql = `SELECT COALESCE("sessionId"::text, 'none') as "sessionId", COALESCE("applicationId"::text, 'none') as "applicationId", date_trunc('day', "createdAt")::date as "usageDate", COUNT(*)::int as "requestCount", COUNT(*) FILTER (WHERE success = false)::int as "errorCount", COUNT(DISTINCT (metadata->>'operationName'))::int as "distinctOperations", MIN("createdAt") as "firstSeenAt", MAX("createdAt") as "lastSeenAt" FROM audit_logs WHERE ${filters.join(' AND ')} GROUP BY 1,2,3 ORDER BY 3 DESC, 1 LIMIT 500`;
      return await ds.query(sql, params);
    } catch (e) {
      log.error('Failed live aggregation for compliance usage', {
        operation: 'complianceUsageLive',
        error: e instanceof Error ? e : String(e)
      });
      return [];
    }
  }
}
