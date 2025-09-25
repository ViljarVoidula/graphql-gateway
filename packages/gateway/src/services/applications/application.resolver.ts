import { GraphQLError } from 'graphql';
import {
  Arg,
  Ctx,
  Directive,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Repository } from 'typeorm';
import { ApiKeyService } from '../../auth/api-key.service';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { dataSource } from '../../db/datasource';
import { ApiKey, ApiKeyStatus } from '../../entities/api-key.entity';
import { Application } from '../../entities/application.entity';
import {
  AuditCategory,
  AuditEventType,
  AuditSeverity,
} from '../../entities/audit-log.entity';
import {
  Service as ServiceEntity,
  ServiceStatus,
} from '../../entities/service.entity';
import { AuditLogService } from '../audit/audit-log.service';

@Service()
@Resolver(Application)
export class ApplicationResolver {
  constructor(
    @Inject('ApplicationRepository')
    private readonly applicationRepository: Repository<Application>,
    @Inject('ServiceRepository')
    private readonly serviceRepository: Repository<ServiceEntity>,
    @Inject() private readonly apiKeyService: ApiKeyService
  ) {}

  @Query(() => [Application])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async myApplications(
    @Ctx() context: ExtendedYogaContext
  ): Promise<Application[]> {
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

  @Query(() => [Application])
  @Directive('@authz(rules: ["isAdmin"])')
  async applicationsByUser(
    @Arg('userId', () => ID) userId: string
  ): Promise<Application[]> {
    return this.applicationRepository.find({
      where: { ownerId: userId },
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
    const saved = await this.applicationRepository.save(application);
    const audit = new AuditLogService();
    await audit.log(AuditEventType.APPLICATION_CREATED, {
      applicationId: saved.id,
      userId: context.user!.id,
      metadata: { name },
    });
    return saved;
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
    if (
      application.ownerId !== context.user!.id &&
      !context.user?.permissions?.includes('admin')
    ) {
      throw new GraphQLError('Insufficient permissions');
    }

    // Check if service is externally accessible
    const service = await this.serviceRepository.findOne({
      where: {
        id: serviceId,
        externally_accessible: true,
        status: ServiceStatus.ACTIVE,
      },
    });

    if (!service) {
      throw new GraphQLError('Service not found or not externally accessible');
    }

    // Check if already whitelisted
    if (application.whitelistedServices.some((s) => s.id === serviceId)) {
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
    if (
      application.ownerId !== context.user!.id &&
      !context.user?.permissions?.includes('admin')
    ) {
      throw new GraphQLError('Insufficient permissions');
    }

    application.whitelistedServices = application.whitelistedServices.filter(
      (s) => s.id !== serviceId
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
    if (
      application.ownerId !== context.user!.id &&
      !context.user?.permissions?.includes('admin')
    ) {
      throw new GraphQLError('Insufficient permissions');
    }

    const { apiKey } = await this.apiKeyService.generateApiKey(
      applicationId,
      name,
      scopes,
      expiresAt
    );
    const audit = new AuditLogService();
    await audit.log(AuditEventType.API_KEY_CREATED, {
      applicationId,
      userId: context.user!.id,
      metadata: { name, scopes, expiresAt },
      category: AuditCategory.SECURITY,
      severity: AuditSeverity.INFO,
      action: 'create_api_key',
      success: true,
      resourceType: 'api_key',
      resourceId: applicationId,
    } as any);
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
    if (
      apiKey.application.ownerId !== context.user!.id &&
      !context.user?.permissions?.includes('admin')
    ) {
      throw new GraphQLError('Insufficient permissions');
    }

    await dataSource
      .getRepository(ApiKey)
      .update(apiKeyId, { status: ApiKeyStatus.REVOKED });
    const audit = new AuditLogService();
    await audit.log(AuditEventType.API_KEY_REVOKED, {
      applicationId: apiKey.application.id,
      userId: context.user!.id,
      metadata: { apiKeyId },
      category: AuditCategory.SECURITY,
      severity: AuditSeverity.LOW,
      action: 'revoke_api_key',
      success: true,
      resourceType: 'api_key',
      resourceId: apiKeyId,
    } as any);
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
    if (
      application.ownerId !== context.user!.id &&
      !context.user?.permissions?.includes('admin')
    ) {
      throw new GraphQLError('Insufficient permissions');
    }

    return application.whitelistedServices;
  }

  @Query(() => [ApiKey])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async getApplicationApiKeys(
    @Arg('applicationId', () => ID) applicationId: string,
    @Ctx() context: ExtendedYogaContext
  ): Promise<ApiKey[]> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['owner', 'apiKeys'],
    });

    if (!application) {
      throw new GraphQLError('Application not found');
    }

    // Check ownership or admin rights
    if (
      application.ownerId !== context.user!.id &&
      !context.user?.permissions?.includes('admin')
    ) {
      throw new GraphQLError('Insufficient permissions');
    }

    return application.apiKeys;
  }

  @Mutation(() => Application)
  @Directive('@authz(rules: ["isAdmin"])')
  async updateApplicationRateLimits(
    @Arg('applicationId', () => ID) applicationId: string,
    @Arg('perMinute', () => Int, { nullable: true }) perMinute: number,
    @Arg('perDay', () => Int, { nullable: true }) perDay: number,
    @Arg('disabled', { nullable: true }) disabled: boolean
  ): Promise<Application> {
    const app = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });
    if (!app) throw new GraphQLError('Application not found');
    app.rateLimitPerMinute = perMinute ?? app.rateLimitPerMinute ?? null;
    app.rateLimitPerDay = perDay ?? app.rateLimitPerDay ?? null;
    if (disabled !== undefined) app.rateLimitDisabled = disabled;
    return this.applicationRepository.save(app);
  }
}
