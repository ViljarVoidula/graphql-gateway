import { GraphQLError } from 'graphql';
import { Arg, Ctx, Directive, ID, Int, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { dataSource } from '../../db/datasource';
import { ApplicationUsage } from '../../entities/application-usage.entity';
import { Application } from '../../entities/application.entity';

@Service()
@Resolver(ApplicationUsage)
export class ApplicationUsageResolver {
  private readonly applicationUsageRepository: Repository<ApplicationUsage>;
  private readonly applicationRepository: Repository<Application>;

  constructor() {
    this.applicationUsageRepository = dataSource.getRepository(ApplicationUsage);
    this.applicationRepository = dataSource.getRepository(Application);
  }

  @Query(() => [ApplicationUsage])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async applicationUsage(
    @Arg('applicationId', () => ID) applicationId: string,
    @Arg('limit', () => Int, { defaultValue: 30, nullable: true }) limit: number,
    @Ctx() context: ExtendedYogaContext
  ): Promise<ApplicationUsage[]> {
    // Check if user owns the application or is admin
    const application = await this.applicationRepository.findOne({ where: { id: applicationId } });

    if (!application) {
      throw new GraphQLError('Application not found');
    }

    if (application.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    return this.applicationUsageRepository.find({
      where: { applicationId },
      relations: ['service'],
      order: { date: 'DESC' },
      take: Math.min(limit, 100) // Cap at 100 records
    });
  }

  @Query(() => [ApplicationUsage])
  @Directive('@authz(rules: ["isAdmin"])')
  async allApplicationUsage(@Arg('limit', () => Int, { defaultValue: 100 }) limit: number): Promise<ApplicationUsage[]> {
    return this.applicationUsageRepository.find({
      relations: ['application', 'service'],
      order: { date: 'DESC' },
      take: Math.min(limit, 200) // Cap at 200 records for admins
    });
  }
}
