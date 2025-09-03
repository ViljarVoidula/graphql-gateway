import { GraphQLError } from 'graphql';
import { Arg, Ctx, Directive, ID, Query, Resolver } from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Repository } from 'typeorm';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { ApiKey } from '../../entities/api-key.entity';
import { Application } from '../../entities/application.entity';

@Service()
@Resolver(ApiKey)
export class ApiKeyResolver {
  constructor(@Inject('ApplicationRepository') private readonly applicationRepository: Repository<Application>) {}

  @Query(() => [ApiKey])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async getApiKeysForApplication(
    @Arg('applicationId', () => ID) applicationId: string,
    @Ctx() context: ExtendedYogaContext
  ): Promise<ApiKey[]> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['owner', 'apiKeys']
    });

    if (!application) {
      throw new GraphQLError('Application not found');
    }

    // Check ownership or admin rights
    if (application.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    return application.apiKeys;
  }
}
