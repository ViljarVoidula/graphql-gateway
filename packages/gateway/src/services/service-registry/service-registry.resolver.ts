import { Arg, Ctx, Directive, Field, ID, InputType, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';
import { YogaContext } from '../../auth/session.config';
import { ServiceKey } from '../../entities/service-key.entity';
import { Service as ServiceEntity, ServiceStatus } from '../../entities/service.entity';
import { ServiceRegistryService } from './service-registry.service';

@ObjectType()
class HMACKeyResult {
  @Field()
  keyId: string;

  @Field()
  secretKey: string;

  @Field()
  instructions: string;
}

@ObjectType()
class ServiceRegistrationResult {
  @Field(() => ServiceEntity)
  service: ServiceEntity;

  @Field(() => HMACKeyResult, { nullable: true })
  hmacKey?: HMACKeyResult;

  @Field()
  success: boolean;
}

@ObjectType()
class ServiceKeyRotationResult {
  @Field({ nullable: true })
  oldKeyId?: string;

  @Field(() => HMACKeyResult)
  newKey: HMACKeyResult;

  @Field()
  success: boolean;
}

@InputType()
class RegisterServiceInput {
  @Field()
  name: string;

  @Field()
  url: string;

  @Field(() => ID, { nullable: true })
  ownerId?: string; // Optional - defaults to current user

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  version?: string;

  @Field({ defaultValue: true })
  enableHMAC: boolean;

  @Field({ defaultValue: 5000 })
  timeout: number;

  @Field({ defaultValue: true })
  enableBatching: boolean;

  @Field({ defaultValue: false })
  useMsgPack: boolean;

  @Field({ defaultValue: true })
  externally_accessible?: boolean;
}

@InputType()
class UpdateServiceInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  url?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  version?: string;

  @Field({ nullable: true })
  enableHMAC?: boolean;

  @Field({ nullable: true })
  timeout?: number;

  @Field({ nullable: true })
  enableBatching?: boolean;

  @Field({ nullable: true })
  useMsgPack?: boolean;

  @Field(() => ServiceStatus, { nullable: true })
  status?: ServiceStatus;
}

@Service()
@Resolver(() => ServiceEntity)
export class ServiceRegistryResolver {
  constructor(private serviceRegistryService: ServiceRegistryService) {}

  @Query(() => [ServiceEntity])
  async services(): Promise<ServiceEntity[]> {
    return this.serviceRegistryService.getAllServices();
  }

  @Query(() => [ServiceEntity])
  async myServices(@Ctx() ctx: YogaContext): Promise<ServiceEntity[]> {
    if (!ctx.user) throw new Error('User not authenticated');
    return this.serviceRegistryService.getServicesByOwner(ctx.user.id);
  }

  @Query(() => ServiceEntity, { nullable: true })
  async service(@Arg('id', () => ID) id: string): Promise<ServiceEntity | null> {
    return this.serviceRegistryService.getServiceById(id);
  }

  @Query(() => [ServiceKey])
  async serviceKeys(@Arg('serviceId', () => ID) serviceId: string, @Ctx() ctx: YogaContext): Promise<ServiceKey[]> {
    // Check if user owns the service or is admin
    const service = await this.serviceRegistryService.getServiceById(serviceId);
    if (!service) throw new Error('Service not found');

    if (service.ownerId !== ctx.user?.id && !ctx.user?.permissions?.includes('admin')) {
      throw new Error('Not authorized to view keys for this service');
    }

    return this.serviceRegistryService.getServiceKeys(serviceId);
  }

  @Mutation(() => ServiceRegistrationResult)
  async registerService(
    @Arg('input') input: RegisterServiceInput,
    @Ctx() ctx: YogaContext
  ): Promise<ServiceRegistrationResult> {
    if (!ctx.user) {
      throw new Error('User not authenticated');
    }

    // Only admins can register new services
    if (!ctx.user.permissions?.includes('admin')) {
      throw new Error('Only administrators can register new services');
    }

    // Use current user as owner if not specified, or check admin permissions if specified
    const ownerId = input.ownerId || ctx.user.id;

    // Admins may assign ownership to someone else; no extra check needed beyond admin gate above

    const serviceData = {
      ...input,
      externally_accessible: input.externally_accessible !== false,
      ownerId
    };

    // Prevent registering internal pseudo endpoints
    if (serviceData.url.startsWith('internal://')) {
      throw new Error('Cannot register internal gateway endpoints');
    }

    const { service, hmacKey } = await this.serviceRegistryService.registerService(serviceData);

    // Trigger schema reload
    if ((ctx as any).schemaLoader) {
      await (ctx as any).schemaLoader.reload();
    }

    return {
      service,
      hmacKey,
      success: true
    };
  }

  @Mutation(() => Boolean)
  async updateService(
    @Arg('id', () => ID) id: string,
    @Arg('input') input: UpdateServiceInput,
    @Ctx() ctx: YogaContext
  ): Promise<boolean> {
    const service = await this.serviceRegistryService.updateService(id, input, ctx.user?.id);

    if ((ctx as any).schemaLoader) {
      await (ctx as any).schemaLoader.reload();
    }

    return !!service;
  }

  @Mutation(() => Boolean)
  async removeService(@Arg('id', () => ID) id: string, @Ctx() ctx: YogaContext): Promise<boolean> {
    const svc = await this.serviceRegistryService.getServiceById(id);
    if (svc?.url === 'internal://gateway') {
      throw new Error('Cannot remove internal gateway service');
    }

    const success = await this.serviceRegistryService.removeService(id, ctx.user?.id);

    if (success && (ctx as any).schemaLoader) {
      await (ctx as any).schemaLoader.reload();
    }

    return success;
  }

  @Mutation(() => ServiceKeyRotationResult)
  async rotateServiceKey(
    @Arg('serviceId', () => ID) serviceId: string,
    @Ctx() ctx: YogaContext
  ): Promise<ServiceKeyRotationResult> {
    const result = await this.serviceRegistryService.rotateServiceKey(serviceId, ctx.user?.id);

    return {
      ...result,
      success: true
    };
  }

  @Mutation(() => Boolean)
  async revokeServiceKey(@Arg('keyId') keyId: string): Promise<boolean> {
    return this.serviceRegistryService.revokeServiceKey(keyId);
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async transferServiceOwnership(
    @Arg('serviceId', () => ID) serviceId: string,
    @Arg('newOwnerId', () => ID) newOwnerId: string,
    @Ctx() ctx: YogaContext
  ): Promise<boolean> {
    // Only admins can transfer service ownership
    if (!ctx.user?.permissions?.includes('admin')) {
      throw new Error('Only administrators can transfer service ownership');
    }

    const service = await this.serviceRegistryService.updateService(serviceId, {
      ownerId: newOwnerId
    });

    return !!service;
  }

  @Query(() => [ServiceEntity])
  @Directive('@authz(rules: ["isAuthenticated"])')
  async externallyAccessibleServices(): Promise<ServiceEntity[]> {
    return this.serviceRegistryService.getExternallyAccessibleServices();
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async setServiceExternallyAccessible(
    @Arg('serviceId', () => ID) serviceId: string,
    @Arg('externally_accessible') externally_accessible: boolean
  ): Promise<boolean> {
    const service = await this.serviceRegistryService.updateService(serviceId, {
      externally_accessible
    });

    return !!service;
  }
}
