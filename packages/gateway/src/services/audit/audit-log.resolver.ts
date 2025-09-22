import { GraphQLError } from 'graphql';
import { Arg, Ctx, Directive, ID, Int, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { dataSource } from '../../db/datasource';
import { Application } from '../../entities/application.entity';
import { AuditCategory, AuditLog, AuditSeverity } from '../../entities/audit-log.entity';
import { Service as ServiceEntity } from '../../entities/service.entity';

@Service()
@Resolver(AuditLog)
export class AuditLogResolver {
  private readonly auditLogRepository: Repository<AuditLog>;
  private readonly applicationRepository: Repository<Application>;
  private readonly serviceRepository: Repository<ServiceEntity>;

  constructor() {
    this.auditLogRepository = dataSource.getRepository(AuditLog);
    this.applicationRepository = dataSource.getRepository(Application);
    this.serviceRepository = dataSource.getRepository(ServiceEntity);
  }

  @Query(() => [AuditLog])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async applicationAuditLogs(
    @Arg('applicationId', () => ID) applicationId: string,
    @Arg('limit', () => Int, { defaultValue: 50, nullable: true }) limit: number,
    @Arg('category', () => AuditCategory, { nullable: true }) category: AuditCategory | null,
    @Arg('severity', () => AuditSeverity, { nullable: true }) severity: AuditSeverity | null,
    @Ctx() context: ExtendedYogaContext
  ): Promise<AuditLog[]> {
    // Check if user owns the application or is admin
    const application = await this.applicationRepository.findOne({ where: { id: applicationId } });

    if (!application) {
      throw new GraphQLError('Application not found');
    }

    if (application.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    const where: any = { applicationId };
    if (category) where.category = category;
    if (severity) where.severity = severity;

    return this.auditLogRepository.find({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100) // Cap at 100 records
    });
  }

  @Query(() => [AuditLog])
  @Directive('@authz(rules: ["isAdmin"])')
  async allAuditLogs(
    @Arg('limit', () => Int, { defaultValue: 100 }) limit: number,
    @Arg('category', () => AuditCategory, { nullable: true }) category: AuditCategory | null,
    @Arg('severity', () => AuditSeverity, { nullable: true }) severity: AuditSeverity | null
  ): Promise<AuditLog[]> {
    const where: any = {};
    if (category) where.category = category;
    if (severity) where.severity = severity;
    return this.auditLogRepository.find({
      where,
      relations: ['user', 'application'],
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200) // Cap at 200 records for admins
    });
  }

  @Query(() => [AuditLog])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async userAuditLogs(
    @Arg('userId', () => ID) userId: string,
    @Arg('limit', () => Int, { defaultValue: 50, nullable: true }) limit: number,
    @Arg('category', () => AuditCategory, { nullable: true }) category: AuditCategory | null,
    @Arg('severity', () => AuditSeverity, { nullable: true }) severity: AuditSeverity | null,
    @Ctx() context: ExtendedYogaContext
  ): Promise<AuditLog[]> {
    // Only the user themselves or an admin can fetch
    if (context.user?.id !== userId && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }
    const where: any = { userId };
    if (category) where.category = category;
    if (severity) where.severity = severity;
    return this.auditLogRepository.find({
      where,
      relations: ['user', 'application'],
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100)
    });
  }

  @Query(() => [AuditLog])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async serviceAuditLogs(
    @Arg('serviceId', () => ID) serviceId: string,
    @Arg('limit', () => Int, { defaultValue: 50, nullable: true }) limit: number,
    @Arg('category', () => AuditCategory, { nullable: true }) category: AuditCategory | null,
    @Arg('severity', () => AuditSeverity, { nullable: true }) severity: AuditSeverity | null,
    @Ctx() context: ExtendedYogaContext
  ): Promise<AuditLog[]> {
    // Check if user owns the service or is admin
    const service = await this.serviceRepository.findOne({ where: { id: serviceId } });

    if (!service) {
      throw new GraphQLError('Service not found');
    }

    if (service.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    const where: any = { resourceType: 'service', resourceId: serviceId };
    if (category) where.category = category;
    if (severity) where.severity = severity;

    return this.auditLogRepository.find({
      where,
      relations: ['user', 'application'],
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100)
    });
  }
}
