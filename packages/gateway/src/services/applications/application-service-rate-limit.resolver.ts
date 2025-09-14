import { GraphQLError } from 'graphql';
import { Arg, Ctx, Directive, ID, Mutation, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { dataSource } from '../../db/datasource';
import { ApplicationServiceRateLimit } from '../../entities/application-service-rate-limit.entity';
import { Application } from '../../entities/application.entity';
import { Service as ServiceEntity } from '../../entities/service.entity';

@Service()
@Resolver(ApplicationServiceRateLimit)
export class ApplicationServiceRateLimitResolver {
  private repo: Repository<ApplicationServiceRateLimit>;
  private appRepo: Repository<Application>;
  private serviceRepo: Repository<ServiceEntity>;

  constructor() {
    this.repo = dataSource.getRepository(ApplicationServiceRateLimit);
    this.appRepo = dataSource.getRepository(Application);
    this.serviceRepo = dataSource.getRepository(ServiceEntity);
  }

  @Query(() => [ApplicationServiceRateLimit])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async applicationServiceRateLimits(
    @Arg('applicationId', () => ID) applicationId: string,
    @Ctx() ctx: ExtendedYogaContext
  ): Promise<ApplicationServiceRateLimit[]> {
    const app = await this.appRepo.findOne({ where: { id: applicationId } });
    if (!app) throw new GraphQLError('Application not found');
    if (app.ownerId !== ctx.user!.id && !ctx.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }
    return this.repo.find({ where: { applicationId } });
  }

  @Mutation(() => ApplicationServiceRateLimit)
  @Directive('@authz(rules: ["isAdmin"])')
  async setApplicationServiceRateLimit(
    @Arg('applicationId', () => ID) applicationId: string,
    @Arg('serviceId', () => ID) serviceId: string,
    @Arg('perMinute', { nullable: true }) perMinute: number,
    @Arg('perDay', { nullable: true }) perDay: number,
    @Arg('disabled', { nullable: true }) disabled?: boolean
  ): Promise<ApplicationServiceRateLimit> {
    const app = await this.appRepo.findOne({ where: { id: applicationId } });
    if (!app) throw new GraphQLError('Application not found');
    const service = await this.serviceRepo.findOne({ where: { id: serviceId } });
    if (!service) throw new GraphQLError('Service not found');

    let existing = await this.repo.findOne({ where: { applicationId, serviceId } });
    if (!existing) {
      existing = this.repo.create({ applicationId, serviceId });
    }
    existing.perMinute = perMinute ?? existing.perMinute ?? null;
    existing.perDay = perDay ?? existing.perDay ?? null;
    if (disabled !== undefined) existing.disabled = disabled;
    return this.repo.save(existing);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async deleteApplicationServiceRateLimit(@Arg('id', () => ID) id: string): Promise<boolean> {
    const res = await this.repo.delete(id);
    return (res.affected || 0) > 0;
  }
}
