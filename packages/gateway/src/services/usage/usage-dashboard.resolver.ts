import { Arg, Ctx, Field, ID, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { dataSource } from '../../db/datasource';
import { ExtendedYogaContext } from '../../auth/auth.types';

@ObjectType()
class UsageTotalsDTO {
  @Field(() => Int) totalRequests!: number;
  @Field(() => Int) totalErrors!: number;
  @Field(() => Int) totalRateLimited!: number;
}

@ObjectType()
class DailyPointDTO {
  @Field() date!: string;
  @Field(() => Int) requestCount!: number;
}

@ObjectType()
class TopApiKeyDTO {
  @Field(() => ID) apiKeyId!: string;
  @Field(() => Int) requestCount!: number;
}

@Service()
@Resolver()
export class UsageDashboardResolver {
  @Query(() => UsageTotalsDTO)
  async usageTotals(
    @Arg('days', () => Int, { defaultValue: 7 }) days: number,
    @Ctx() ctx: ExtendedYogaContext
  ): Promise<UsageTotalsDTO> {
    if (!ctx.user) return { totalRequests: 0, totalErrors: 0, totalRateLimited: 0 };
    const since = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString().slice(0, 10);
    const sql = `
      SELECT COALESCE(SUM(u."requestCount"),0) AS r, COALESCE(SUM(u."errorCount"),0) AS e, COALESCE(SUM(u."rateLimitExceededCount"),0) AS rl
      FROM application_usage u
      JOIN applications a ON a.id = u."applicationId"
      WHERE a."ownerId" = $1 AND u.date >= $2
    `;
    const rows: any[] = await dataSource.query(sql, [ctx.user.id, since]);
    return {
      totalRequests: Number(rows[0]?.r || 0),
      totalErrors: Number(rows[0]?.e || 0),
      totalRateLimited: Number(rows[0]?.rl || 0)
    };
  }

  @Query(() => [DailyPointDTO])
  async usageDailyRequests(
    @Arg('days', () => Int, { defaultValue: 14 }) days: number,
    @Ctx() ctx: ExtendedYogaContext
  ): Promise<DailyPointDTO[]> {
    if (!ctx.user) return [];
    const since = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString().slice(0, 10);
    const sql = `
      SELECT to_char(u.date, 'YYYY-MM-DD') AS date, SUM(u."requestCount") AS r
      FROM application_usage u
      JOIN applications a ON a.id = u."applicationId"
      WHERE a."ownerId" = $1 AND u.date >= $2
      GROUP BY u.date
      ORDER BY u.date ASC
    `;
    const rows: any[] = await dataSource.query(sql, [ctx.user.id, since]);
    return rows.map((r: any) => ({
      date: String(r.date),
      requestCount: Number(r.r || 0)
    }));
  }

  @Query(() => [TopApiKeyDTO])
  async usageTopApiKeys(
    @Arg('days', () => Int, { defaultValue: 7 }) days: number,
    @Arg('limit', () => Int, { defaultValue: 10 }) limit: number,
    @Ctx() ctx: ExtendedYogaContext
  ): Promise<TopApiKeyDTO[]> {
    if (!ctx.user) return [];
    const since = new Date(Date.now() - Math.max(1, days) * 86400000).toISOString().slice(0, 10);
    const sql = `
      SELECT aku."apiKeyId" AS apiKeyId, SUM(aku."requestCount") AS r
      FROM api_key_usage aku
      JOIN applications a ON a.id = aku."applicationId"
      WHERE a."ownerId" = $1 AND aku.date >= $2
      GROUP BY aku."apiKeyId"
      ORDER BY r DESC
      LIMIT $3
    `;
    const rows: any[] = await dataSource.query(sql, [ctx.user.id, since, Math.min(Math.max(limit, 1), 50)]);
    return rows.map((r) => ({ apiKeyId: r.apikeyid ?? r.apiKeyId, requestCount: Number(r.r || 0) }));
  }
}
