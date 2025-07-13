import { Resolver, Query, Mutation, Arg, Ctx, ID, Directive } from 'type-graphql';
import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { GraphQLError } from 'graphql';
import { dataSource } from '../../db/datasource';
import { Application } from '../../entities/application.entity';
import { ApiKey, ApiKeyStatus } from '../../entities/api-key.entity';
import { Service as ServiceEntity, ServiceStatus } from '../../entities/service.entity';
import { ApiKeyService } from '../../auth/api-key.service';
import { AuthorizationService } from '../../auth/authorization.service';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { Container } from 'typedi';

@Service()
@Resolver(Application)
export class ApplicationResolver {
  private applicationRepository: Repository<Application>;
  private serviceRepository: Repository<ServiceEntity>;
  private apiKeyService: ApiKeyService;
  private authorizationService: AuthorizationService;

  constructor() {
    this.applicationRepository = dataSource.getRepository(Application);
    this.serviceRepository = dataSource.getRepository(ServiceEntity);
    this.apiKeyService = Container.get(ApiKeyService);
    this.authorizationService = Container.get(AuthorizationService);
  }

  @Query(() => [Application])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async myApplications(@Ctx() context: ExtendedYogaContext): Promise<Application[]> {
    return this.applicationRepository.find({
      where: { ownerId: context.user!.id },
      relations: ['owner', 'apiKeys', 'whitelistedServices'],
    });
  }

  @Query(() => [Application])
  @Directive('@authz(rules: ["isAdmin"])')
  async allApplications(): Promise<Application[]> {
    return this.applicationRepository.find({
      relations: ['owner', 'apiKeys', 'whitelistedServices'],
    });
  }

  @Mutation(() => Application)
  @Directive('@authz(rules: ["isAuthenticated"])')
  async createApplication(
    @Arg('name') name: string,
    @Arg('description', { nullable: true }) description: string,
    @Ctx() context: ExtendedYogaContext
  ): Promise<Application> {
    const application = this.applicationRepository.create({
      name,
      description,
      ownerId: context.user!.id,
    });

    return this.applicationRepository.save(application);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAuthenticated"])')
  async addServiceToApplication(
    @Arg('applicationId', () => ID) applicationId: string,
    @Arg('serviceId', () => ID) serviceId: string,
    @Ctx() context: ExtendedYogaContext
  ): Promise<boolean> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['whitelistedServices'],
    });

    if (!application) {
      throw new GraphQLError('Application not found');
    }

    // Check ownership (unless admin)
    if (application.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    // Check if service is externally accessible
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId, externally_accessible: true, status: ServiceStatus.ACTIVE },
    });

    if (!service) {
      throw new GraphQLError('Service not found or not externally accessible');
    }

    // Check if already whitelisted
    if (application.whitelistedServices.some(s => s.id === serviceId)) {
      return true; // Already whitelisted
    }

    application.whitelistedServices.push(service);
    await this.applicationRepository.save(application);
    return true;
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAuthenticated"])')
  async removeServiceFromApplication(
    @Arg('applicationId', () => ID) applicationId: string,
    @Arg('serviceId', () => ID) serviceId: string,
    @Ctx() context: ExtendedYogaContext
  ): Promise<boolean> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['whitelistedServices'],
    });

    if (!application) {
      throw new GraphQLError('Application not found');
    }

    // Check ownership (unless admin)
    if (application.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    application.whitelistedServices = application.whitelistedServices.filter(
      s => s.id !== serviceId
    );

    await this.applicationRepository.save(application);
    return true;
  }

  @Mutation(() => String)
  @Directive('@authz(rules: ["isAuthenticated"])')
  async createApiKey(
    @Arg('applicationId', () => ID) applicationId: string,
    @Arg('name') name: string,
    @Arg('scopes', () => [String], { defaultValue: [] }) scopes: string[],
    @Arg('expiresAt', { nullable: true }) expiresAt: Date,
    @Ctx() context: ExtendedYogaContext
  ): Promise<string> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['owner'],
    });

    if (!application) {
      throw new GraphQLError('Application not found');
    }

    // Check ownership (unless admin)
    if (application.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    const { apiKey } = await this.apiKeyService.generateApiKey(applicationId, name, scopes, expiresAt);
    
    // Only return the key once - it won't be shown again
    return apiKey;
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAuthenticated"])')
  async revokeApiKey(
    @Arg('apiKeyId', () => ID) apiKeyId: string,
    @Ctx() context: ExtendedYogaContext
  ): Promise<boolean> {
    const apiKey = await dataSource.getRepository(ApiKey).findOne({
      where: { id: apiKeyId },
      relations: ['application'],
    });

    if (!apiKey) {
      throw new GraphQLError('API key not found');
    }

    // Check ownership (unless admin)
    if (apiKey.application.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    await dataSource.getRepository(ApiKey).update(apiKeyId, { status: ApiKeyStatus.REVOKED });
    return true;
  }

  @Query(() => [ServiceEntity])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async getApplicationAccessibleServices(
    @Arg('applicationId', () => ID) applicationId: string,
    @Ctx() context: ExtendedYogaContext
  ): Promise<ServiceEntity[]> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['owner', 'whitelistedServices'],
    });

    if (!application) {
      throw new GraphQLError('Application not found');
    }

    // Check ownership or admin rights
    if (application.ownerId !== context.user!.id && !context.user?.permissions?.includes('admin')) {
      throw new GraphQLError('Insufficient permissions');
    }

    return application.whitelistedServices;
  }
}
