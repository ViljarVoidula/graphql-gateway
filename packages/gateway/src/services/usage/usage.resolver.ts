import { Arg, Ctx, Directive, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Service as DIService } from 'typedi';
import { Repository } from 'typeorm';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { dataSource } from '../../db/datasource';
import { ApplicationUsage } from '../../entities/application-usage.entity';
import { Application } from '../../entities/application.entity';
import { AuditEventType, AuditLog } from '../../entities/audit-log.entity';

@ObjectType()
class ApplicationDailyUsageSummary {
  @Field(() => String)
  date: string;
  @Field(() => Int)
  requestCount: number;
  @Field(() => Int)
  errorCount: number;
  @Field(() => Int)
  rateLimitExceededCount: number;
}

@DIService()
@Resolver(Application)
export class UsageResolver {
  private usageRepo: Repository<ApplicationUsage>;
  private auditRepo: Repository<AuditLog>;
  constructor() {
    this.usageRepo = dataSource.getRepository(ApplicationUsage);
    this.auditRepo = dataSource.getRepository(AuditLog);
  }

  @Query(() => [ApplicationUsage])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async applicationUsage(
    @Arg('applicationId') applicationId: string,
    @Arg('from', { nullable: true }) from?: string,
    @Arg('to', { nullable: true }) to?: string,
    @Ctx() context?: ExtendedYogaContext
  ): Promise<ApplicationUsage[]> {
    // Ownership check simple (TODO: optimize)
    const qb = this.usageRepo.createQueryBuilder('u').where('u.applicationId = :applicationId', { applicationId });
    if (from) qb.andWhere('u.date >= :from', { from });
    if (to) qb.andWhere('u.date <= :to', { to });
    return qb.orderBy('u.date', 'DESC').limit(500).getMany();
  }

  @Query(() => [AuditLog])
  @Directive('@authz(rules: ["isAdmin"])')
  async auditLogs(
    @Arg('applicationId', { nullable: true }) applicationId?: string,
    @Arg('eventType', () => AuditEventType, { nullable: true }) eventType?: AuditEventType
  ): Promise<AuditLog[]> {
    const qb = this.auditRepo.createQueryBuilder('a');
    if (applicationId) qb.andWhere('a.applicationId = :applicationId', { applicationId });
    if (eventType) qb.andWhere('a.eventType = :eventType', { eventType });
    return qb.orderBy('a.createdAt', 'DESC').limit(1000).getMany();
  }
}
