import { Arg, Ctx, Field, ID, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Service as DIService } from 'typedi';
import { Repository } from 'typeorm';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { dataSource } from '../../db/datasource';
import { ApiKey } from '../../entities/api-key.entity';
import { ApiKeyUsage } from '../../entities/api-key-usage.entity';
import { Application } from '../../entities/application.entity';

@ObjectType()
class ApiKeyDailyUsageDTO {
  @Field()
  date!: string;
  @Field(() => Int)
  requestCount!: number;
  @Field(() => Int)
  errorCount!: number;
  @Field(() => Int)
  rateLimitExceededCount!: number;
  @Field(() => ID, { nullable: true })
  serviceId?: string | null;
}

@DIService()
@Resolver()
export class ApiKeyUsageResolver {
  private apiKeyRepo: Repository<ApiKey> = dataSource.getRepository(ApiKey);
  private usageRepo: Repository<ApiKeyUsage> = dataSource.getRepository(ApiKeyUsage);
  private appRepo: Repository<Application> = dataSource.getRepository(Application);

  @Query(() => [ApiKeyDailyUsageDTO], { description: 'Last N days usage buckets for a given API key' })
  async apiKeyUsage(
    @Arg('apiKeyId', () => ID) apiKeyId: string,
    @Arg('limit', () => Int, { defaultValue: 14 }) limit: number,
    @Arg('serviceId', () => ID, { nullable: true }) serviceId: string | null,
    @Ctx() context: ExtendedYogaContext
  ): Promise<ApiKeyDailyUsageDTO[]> {
    const key = await this.apiKeyRepo.findOne({ where: { id: apiKeyId }, relations: ['application'] });
    if (!key) return [];
    const userId = context.user?.id;
    const isAdmin = (context.user?.permissions || []).includes('admin');
    if (!isAdmin && userId !== key.application.ownerId) return [];

    const qb = this.usageRepo
      .createQueryBuilder('u')
      .select([
        "to_char(u.date, 'YYYY-MM-DD') AS date",
        'u.requestCount AS requestCount',
        'u.errorCount AS errorCount',
        'u.rateLimitExceededCount AS rateLimitExceededCount',
        'u.serviceId AS serviceId'
      ])
      .where('u.apiKeyId = :apiKeyId', { apiKeyId });

    if (serviceId) {
      qb.andWhere('u.serviceId = :serviceId', { serviceId });
    }

    const rows = await qb
      .orderBy('u.date', 'DESC')
      .limit(Math.min(Math.max(limit, 1), 90))
      .getRawMany();

    return rows.map((r: any) => {
      // TypeORM raw results from Postgres lower-case unquoted aliases
      const requestCount = r.requestCount ?? r.requestcount;
      const errorCount = r.errorCount ?? r.errorcount;
      const rateLimitExceededCount = r.rateLimitExceededCount ?? r.ratelimitexceededcount;
      const rawDate = r.date;
      const date = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate);
      return {
        date,
        requestCount: Number(requestCount ?? 0),
        errorCount: Number(errorCount ?? 0),
        rateLimitExceededCount: Number(rateLimitExceededCount ?? 0),
        serviceId: r.serviceid ?? r.serviceId ?? null
      } as ApiKeyDailyUsageDTO;
    });
  }
}
