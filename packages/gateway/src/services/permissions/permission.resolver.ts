import {
  Arg,
  Directive,
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  Mutation,
  Query,
  Resolver,
} from 'type-graphql';
import { Service as DIService } from 'typedi';
import { PermissionTemplate } from '../../entities/permission-template.entity';
import {
  PermissionAccessLevel,
  ServicePermission,
} from '../../entities/service-permission.entity';
import { UserServiceRole } from '../../entities/user-service-role.entity';
import { PermissionService } from './permission.service';

@InputType()
class UpdateServicePermissionInput {
  @Field(() => PermissionAccessLevel, { nullable: true })
  accessLevel?: PermissionAccessLevel;

  @Field({ nullable: true })
  active?: boolean;
}

@InputType()
class CreatePermissionTemplateInput {
  @Field(() => ID, { nullable: true })
  templateId?: string;

  @Field(() => ID)
  serviceId!: string;

  @Field()
  name!: string;

  @Field()
  roleKey!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field(() => [String], { nullable: true })
  permissions?: string[];
}

@InputType()
class CreateServicePermissionInput {
  @Field(() => ID)
  serviceId!: string;

  @Field()
  operationType!: string;

  @Field()
  operationName!: string;

  @Field({ nullable: true })
  fieldPath?: string;

  @Field(() => PermissionAccessLevel)
  accessLevel!: PermissionAccessLevel;

  @Field({ defaultValue: true })
  active!: boolean;
}

@InputType()
class AssignUserServiceRoleInput {
  @Field(() => ID, { nullable: true })
  roleId?: string;

  @Field(() => ID)
  userId!: string;

  @Field(() => ID)
  serviceId!: string;

  @Field()
  roleKey!: string;

  @Field(() => ID, { nullable: true })
  templateId?: string;

  @Field(() => [String], { nullable: true })
  permissions?: string[];

  @Field({ nullable: true })
  displayName?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  expiresAt?: Date;
}

@Resolver()
@DIService()
export class PermissionResolver {
  constructor(private readonly permissionService: PermissionService) {}

  @Query(() => [ServicePermission])
  @Directive('@authz(rules: ["isAdmin"])')
  async servicePermissions(
    @Arg('serviceId', () => ID) serviceId: string,
    @Arg('includeArchived', () => Boolean, { defaultValue: false })
    includeArchived: boolean
  ): Promise<ServicePermission[]> {
    return this.permissionService.listPermissionsForService(
      serviceId,
      includeArchived
    );
  }

  @Query(() => [PermissionTemplate])
  @Directive('@authz(rules: ["isAdmin"])')
  async servicePermissionTemplates(
    @Arg('serviceId', () => ID) serviceId: string
  ): Promise<PermissionTemplate[]> {
    return this.permissionService.getServicePermissionTemplates(serviceId);
  }

  @Query(() => [UserServiceRole])
  @Directive('@authz(rules: ["isAdmin"])')
  async serviceUserRoles(
    @Arg('serviceId', () => ID) serviceId: string
  ): Promise<UserServiceRole[]> {
    return this.permissionService.getServiceUserRoles(serviceId);
  }

  @Mutation(() => ServicePermission)
  @Directive('@authz(rules: ["isAdmin"])')
  async updateServicePermission(
    @Arg('permissionId', () => ID) permissionId: string,
    @Arg('input') input: UpdateServicePermissionInput
  ): Promise<ServicePermission> {
    return this.permissionService.updateServicePermission(permissionId, input);
  }

  @Mutation(() => PermissionTemplate)
  @Directive('@authz(rules: ["isAdmin"])')
  async setPermissionTemplatePermissions(
    @Arg('templateId', () => ID) templateId: string,
    @Arg('permissions', () => [String]) permissions: string[]
  ): Promise<PermissionTemplate> {
    return this.permissionService.setTemplatePermissions(
      templateId,
      permissions
    );
  }

  @Mutation(() => UserServiceRole)
  @Directive('@authz(rules: ["isAdmin"])')
  async assignUserServiceRole(
    @Arg('input') input: AssignUserServiceRoleInput
  ): Promise<UserServiceRole> {
    return this.permissionService.assignUserServiceRole({
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      permissions: input.permissions ?? [],
    });
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async removeUserServiceRole(
    @Arg('roleId', () => ID) roleId: string
  ): Promise<boolean> {
    return this.permissionService.removeUserServiceRole(roleId);
  }

  @Mutation(() => PermissionTemplate)
  @Directive('@authz(rules: ["isAdmin"])')
  async createPermissionTemplate(
    @Arg('input') input: CreatePermissionTemplateInput
  ): Promise<PermissionTemplate> {
    return this.permissionService.createOrUpdateTemplate({
      id: input.templateId,
      serviceId: input.serviceId,
      name: input.name,
      roleKey: input.roleKey,
      description: input.description,
      tags: input.tags,
      permissions: input.permissions || [],
    });
  }

  @Mutation(() => PermissionTemplate)
  @Directive('@authz(rules: ["isAdmin"])')
  async updatePermissionTemplate(
    @Arg('input') input: CreatePermissionTemplateInput
  ): Promise<PermissionTemplate> {
    if (!input.templateId) {
      throw new Error('Template ID is required for updates');
    }
    return this.permissionService.createOrUpdateTemplate({
      id: input.templateId,
      serviceId: input.serviceId,
      name: input.name,
      roleKey: input.roleKey,
      description: input.description,
      tags: input.tags,
      permissions: input.permissions || [],
    });
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async deletePermissionTemplate(
    @Arg('templateId', () => ID) templateId: string
  ): Promise<boolean> {
    return this.permissionService.deleteTemplate(templateId);
  }

  @Mutation(() => ServicePermission)
  @Directive('@authz(rules: ["isAdmin"])')
  async createServicePermission(
    @Arg('input') input: CreateServicePermissionInput
  ): Promise<ServicePermission> {
    return this.permissionService.createCustomPermission({
      serviceId: input.serviceId,
      operationType: input.operationType as any,
      operationName: input.operationName,
      fieldPath: input.fieldPath,
      accessLevel: input.accessLevel,
      active: input.active,
    });
  }

  @Mutation(() => Boolean)
  @Directive('@authz(rules: ["isAdmin"])')
  async syncServicePermissions(
    @Arg('serviceId', () => ID) serviceId: string,
    @Arg('sdl') sdl: string
  ): Promise<boolean> {
    return this.permissionService.syncServicePermissionsFromSDL(serviceId, sdl);
  }
}
