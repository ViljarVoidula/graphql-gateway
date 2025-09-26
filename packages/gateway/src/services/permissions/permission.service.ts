import { GraphQLSchema, buildSchema } from 'graphql';
import { Service as DIService } from 'typedi';
import { In, IsNull, Repository } from 'typeorm';
import { dataSource } from '../../db/datasource';
import {
  PermissionTemplate,
  PermissionTemplateScope,
} from '../../entities/permission-template.entity';
import {
  PermissionAccessLevel,
  PermissionOperationType,
  ServicePermission,
} from '../../entities/service-permission.entity';
import { Service, ServiceStatus, SubscriptionTransport } from '../../entities/service.entity';
import { UserServiceRole } from '../../entities/user-service-role.entity';
import { log } from '../../utils/logger';
import { User } from '../users/user.entity';
import {
  DEFAULT_PERMISSION_TEMPLATES,
  PERMISSION_KEY_PREFIX,
  PERMISSION_PROFILE_TTL_MS,
  LOCAL_SERVICE_URL,
  setLocalServiceId,
} from './permission.constants';
import {
  OperationDescriptor,
  PermissionClaim,
  PermissionClaimEntry,
  PermissionProfile,
} from './permission.types';

interface PermissionProfileCacheEntry {
  profile: PermissionProfile;
  expiresAt: number;
}

interface UpdateServicePermissionInput {
  accessLevel?: PermissionAccessLevel;
  active?: boolean;
}

interface AssignUserRoleOptions {
  roleId?: string;
  userId: string;
  serviceId: string;
  roleKey: string;
  templateId?: string | null;
  permissions?: string[] | null;
  displayName?: string | null;
  expiresAt?: Date | null;
}

@DIService()
export class PermissionService {
  private readonly servicePermissionRepo: Repository<ServicePermission>;
  private readonly templateRepo: Repository<PermissionTemplate>;
  private readonly userRoleRepo: Repository<UserServiceRole>;
  private readonly serviceRepo: Repository<Service>;
  private readonly userRepo: Repository<User>;

  private readonly profileCache = new Map<string, PermissionProfileCacheEntry>();
  private readonly operationIndex = new Map<string, Set<string>>();
  private readonly permissionCache = new Map<string, ServicePermission>();

  constructor() {
    this.servicePermissionRepo = dataSource.getRepository(ServicePermission);
    this.templateRepo = dataSource.getRepository(PermissionTemplate);
    this.userRoleRepo = dataSource.getRepository(UserServiceRole);
    this.serviceRepo = dataSource.getRepository(Service);
    this.userRepo = dataSource.getRepository(User);
  }

  async initialize(): Promise<void> {
    await this.hydrateCaches();
    const services = await this.serviceRepo.find();
    if (services.length) {
      await Promise.all(
        services.map((service) => this.ensureServiceTemplates(service))
      );
    }
  }

  private async hydrateCaches(): Promise<void> {
    this.permissionCache.clear();
    this.operationIndex.clear();

    const permissions = await this.servicePermissionRepo.find();
    for (const permission of permissions) {
      this.permissionCache.set(permission.permissionKey, permission);
      if (permission.active && !permission.archivedAt) {
        const key = `${permission.operationType}:${permission.operationName}`;
        if (!this.operationIndex.has(key)) {
          this.operationIndex.set(key, new Set());
        }
        this.operationIndex.get(key)!.add(permission.serviceId);
      }
    }
  }

  /**
   * Build canonical permission key with hierarchical segments
   */
  buildPermissionKey(params: {
    serviceId: string;
    operationType: PermissionOperationType;
    operationName: string;
    fieldPath?: string | null;
  }): string {
    const field =
      params.fieldPath && params.fieldPath.length > 0 ? params.fieldPath : '*';
    return [
      PERMISSION_KEY_PREFIX,
      params.serviceId,
      params.operationType,
      params.operationName,
      field,
    ].join(':');
  }

  /**
   * Resolve service ids registered for a given operation. Used during request authorization.
   */
  getServiceIdsForOperation(
    operationType: PermissionOperationType,
    operationName: string
  ): string[] {
    const key = `${operationType}:${operationName}`;
    return Array.from(this.operationIndex.get(key) ?? []);
  }

  getPermissionByKey(permissionKey: string): ServicePermission | undefined {
    return this.permissionCache.get(permissionKey);
  }

  /**
   * Synchronize service permissions with latest schema SDL
   */
  async syncServicePermissions(service: Service, sdl: string): Promise<void> {
    try {
      const schema = this.safeBuildSchema(sdl);
      const operations = this.extractOperationsFromSchema(schema, service);
      await this.persistOperations(service, operations, {
        serviceEntity: service,
      });
    } catch (error) {
      log.error('Failed to sync service permissions', {
        operation: 'PermissionService.syncServicePermissions',
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { serviceId: service.id, serviceName: service.name },
      });
    }
  }

  /**
   * Synchronize local gateway schema permissions (for admin resolvers)
   */
  async syncLocalSchemaPermissions(
    schema: GraphQLSchema | null
  ): Promise<void> {
    if (!schema) return;

    // Ensure the local gateway service exists in the database
    let localService = await this.serviceRepo.findOne({
      where: { url: LOCAL_SERVICE_URL },
    });

    if (!localService) {
      const adminUser = await this.userRepo.findOne({
        where: {},
        order: { createdAt: 'ASC' },
      });
      if (!adminUser) return; // defer until a user exists
      localService = await this.serviceRepo.save(
        this.serviceRepo.create({
          name: 'Gateway',
          url: LOCAL_SERVICE_URL,
          description: 'Gateway Local Schema',
          status: ServiceStatus.ACTIVE,
          version: 'local',
          enableHMAC: false,
          timeout: 0,
          enableBatching: false,
          useMsgPack: false,
          enablePermissionChecks: false,
          externally_accessible: false,
          ownerId: adminUser.id,
          subscriptionTransport: SubscriptionTransport.AUTO,
          subscriptionPath: null,
        })
      );
    }

    setLocalServiceId(localService.id);

    const pseudoService: Service = {
      // reflect whichever internal service record we are using (may not match canonical id)
      id: localService.id,
      name: localService.name || 'Gateway',
      url: localService.url,
      description: localService.description || 'Gateway Local Schema',
      status: null as any,
      version: null as any,
      sdl: null as any,
      enableHMAC: false,
      timeout: 0,
      enableBatching: false,
      useMsgPack: false,
      enablePermissionChecks: false,
      externally_accessible: false,
      owner: null as any,
      ownerId: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date(),
      updatedAt: new Date(),
      keys: [],
      subscriptionTransport: null as any,
      subscriptionPath: null,
      permissions: [],
      userRoles: [],
    };
    const operations: OperationDescriptor[] = [];
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
    const subscriptionType = schema.getSubscriptionType();
    if (queryType) {
      operations.push(
        ...Object.keys(queryType.getFields()).map((name) => ({
          operationType: PermissionOperationType.QUERY,
          operationName: name,
          fieldPath: '*',
          accessLevel: PermissionAccessLevel.READ,
          serviceId: pseudoService.id,
          serviceName: pseudoService.name,
        }))
      );
    }
    if (mutationType) {
      operations.push(
        ...Object.keys(mutationType.getFields()).map((name) => ({
          operationType: PermissionOperationType.MUTATION,
          operationName: name,
          fieldPath: '*',
          accessLevel: PermissionAccessLevel.WRITE,
          serviceId: pseudoService.id,
          serviceName: pseudoService.name,
        }))
      );
    }
    if (subscriptionType) {
      operations.push(
        ...Object.keys(subscriptionType.getFields()).map((name) => ({
          operationType: PermissionOperationType.SUBSCRIPTION,
          operationName: name,
          fieldPath: '*',
          accessLevel: PermissionAccessLevel.SUBSCRIBE,
          serviceId: pseudoService.id,
          serviceName: pseudoService.name,
        }))
      );
    }

    await this.persistOperations(pseudoService, operations, {
      skipTemplates: true,
    });
  }

  /**
   * Retrieve cached permission profile for user
   */
  async getPermissionProfileForUser(
    userId: string
  ): Promise<PermissionProfile | null> {
    const now = Date.now();
    const cached = this.profileCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.profile;
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      this.profileCache.delete(userId);
      return null;
    }

    const roles = await this.userRoleRepo.find({
      where: { userId, archivedAt: IsNull() },
      relations: ['template'],
    });

    const templateIds = roles
      .map((role) => role.templateId)
      .filter((id): id is string => !!id);
    const templates = templateIds.length
      ? await this.templateRepo.find({ where: { id: In(templateIds) } })
      : [];

    const claims = this.buildClaimsFromRoles(roles, templates);
    const profile = this.buildPermissionProfile(user, roles, templates, claims);

    this.profileCache.set(userId, {
      profile,
      expiresAt: now + PERMISSION_PROFILE_TTL_MS,
    });

    return profile;
  }

  invalidateUserProfile(userId: string) {
    this.profileCache.delete(userId);
  }

  /**
   * Evaluate whether user context has access to operation
   */
  async hasPermission(options: {
    userId?: string | null;
    basePermissions?: string[];
    serviceId: string;
    operationType: PermissionOperationType;
    operationName: string;
    fieldPath?: string | null;
    requiredAccess?: PermissionAccessLevel;
    allowApiKeyFallback?: boolean;
    applicationWhitelistedServices?: string[];
  }): Promise<boolean> {
    const {
      userId,
      basePermissions = [],
      serviceId,
      operationType,
      operationName,
      fieldPath,
      requiredAccess,
      allowApiKeyFallback,
      applicationWhitelistedServices,
    } = options;

    if (!userId) {
      if (allowApiKeyFallback && applicationWhitelistedServices) {
        const key = this.buildPermissionKey({
          serviceId,
          operationType,
          operationName,
          fieldPath,
        });
        const perm = this.permissionCache.get(key);
        if (!perm) return false;

        const isReadLike = perm.accessLevel === PermissionAccessLevel.READ;
        if (isReadLike && applicationWhitelistedServices.includes(serviceId)) {
          return true; // allow read-only access for whitelisted services when API key
        }
      }
      return false;
    }

    if (basePermissions.includes('admin')) {
      return true;
    }

    const profile = await this.getPermissionProfileForUser(userId);
    if (!profile) {
      return false;
    }

    if (profile.isAdmin) {
      return true;
    }

    const permissionKey = this.buildPermissionKey({
      serviceId,
      operationType,
      operationName,
      fieldPath,
    });

    const permissionEntity = this.permissionCache.get(permissionKey);
    if (!permissionEntity || !permissionEntity.active) {
      // Attempt wildcard fallback (operation-level)
      const wildcardKey = this.buildPermissionKey({
        serviceId,
        operationType,
        operationName,
        fieldPath: '*',
      });
      const wildcardEntity = this.permissionCache.get(wildcardKey);
      if (!wildcardEntity || !wildcardEntity.active) {
        return false;
      }
    }

    return this.claimsAllow(
      profile.claims.map((claim) => claim.key),
      permissionKey,
      requiredAccess
    );
  }

  /**
   * List permissions for admin usages
   */
  async listPermissionsForService(
    serviceId: string,
    includeArchived = false
  ): Promise<ServicePermission[]> {
    const where = includeArchived
      ? { serviceId }
      : { serviceId, archivedAt: IsNull(), active: true };
    const permissions = await this.servicePermissionRepo.find({
      where,
      order: { operationType: 'ASC', operationName: 'ASC' },
    });
    permissions.forEach((perm) =>
      this.permissionCache.set(perm.permissionKey, perm)
    );
    return permissions;
  }

  async getServicePermissionTemplates(
    serviceId: string
  ): Promise<PermissionTemplate[]> {
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
    });
    if (!service) {
      throw new Error('Service not found');
    }
    await this.ensureServiceTemplates(service);
    return this.templateRepo.find({
      where: {
        serviceId,
        scope: PermissionTemplateScope.SERVICE,
      },
      order: {
        roleKey: 'ASC',
      },
    });
  }

  async setTemplatePermissions(
    templateId: string,
    permissionKeys: string[]
  ): Promise<PermissionTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId },
    });
    if (!template) {
      throw new Error('Permission template not found');
    }

    const uniqueKeys = Array.from(
      new Set(
        permissionKeys.filter(
          (key): key is string => typeof key === 'string' && key.length > 0
        )
      )
    );

    await this.validatePermissionKeys(
      uniqueKeys,
      template.scope === PermissionTemplateScope.SERVICE
        ? (template.serviceId ?? undefined)
        : undefined
    );

    template.permissions = uniqueKeys;
    const saved = await this.templateRepo.save(template);

    const roles = await this.userRoleRepo.find({
      where: { templateId: template.id },
    });
    roles.forEach((role) => this.invalidateUserProfile(role.userId));

    return saved;
  }

  async updateServicePermission(
    permissionId: string,
    input: UpdateServicePermissionInput
  ): Promise<ServicePermission> {
    const permission = await this.servicePermissionRepo.findOne({
      where: { id: permissionId },
    });
    if (!permission) {
      throw new Error('Service permission not found');
    }

    let mutated = false;
    if (typeof input.active === 'boolean') {
      permission.active = input.active;
      permission.archivedAt = input.active ? null : new Date();
      mutated = true;
    }

    if (input.accessLevel && input.accessLevel !== permission.accessLevel) {
      permission.accessLevel = input.accessLevel;
      mutated = true;
    }

    if (!mutated) {
      return permission;
    }

    const saved = await this.servicePermissionRepo.save(permission);
    this.permissionCache.set(saved.permissionKey, saved);
    this.updateOperationIndexForPermission(saved);

    return saved;
  }

  async getServiceUserRoles(serviceId: string): Promise<UserServiceRole[]> {
    return this.userRoleRepo.find({
      where: {
        serviceId,
        archivedAt: IsNull(),
      },
      relations: ['user', 'template', 'service'],
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async assignUserServiceRole(
    options: AssignUserRoleOptions
  ): Promise<UserServiceRole> {
    const {
      roleId,
      userId,
      serviceId,
      roleKey,
      templateId,
      permissions = [],
      displayName,
      expiresAt,
    } = options;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
    });
    if (!service) {
      throw new Error('Service not found');
    }

    await this.ensureServiceTemplates(service);

    let template: PermissionTemplate | null = null;
    if (templateId) {
      template = await this.templateRepo.findOne({ where: { id: templateId } });
      if (!template) {
        throw new Error('Permission template not found');
      }
      if (
        template.scope === PermissionTemplateScope.SERVICE &&
        template.serviceId !== serviceId
      ) {
        throw new Error('Template does not belong to the specified service');
      }
    }

    const normalizedPermissions = Array.from(
      new Set(
        permissions.filter(
          (key): key is string => typeof key === 'string' && key.length > 0
        )
      )
    );

    await this.validatePermissionKeys(
      normalizedPermissions,
      template?.scope === PermissionTemplateScope.SERVICE
        ? (template.serviceId ?? serviceId)
        : serviceId
    );

    let role: UserServiceRole | null = null;
    if (roleId) {
      role = await this.userRoleRepo.findOne({ where: { id: roleId } });
    }

    if (!role) {
      role = await this.userRoleRepo.findOne({
        where: {
          userId,
          serviceId,
          roleKey,
        },
      });
    }

    if (!role) {
      role = this.userRoleRepo.create({
        userId,
        serviceId,
        roleKey,
        permissions: normalizedPermissions,
        templateId: template?.id ?? null,
        displayName: displayName ?? null,
        expiresAt: expiresAt ?? null,
        roleNamespace: `service:${serviceId}`,
        archivedAt: null,
      });
    } else {
      role.userId = userId;
      role.serviceId = serviceId;
      role.roleKey = roleKey;
      role.permissions = normalizedPermissions;
      role.templateId = template?.id ?? null;
      role.displayName = displayName ?? role.displayName ?? null;
      role.expiresAt = expiresAt ?? null;
      role.roleNamespace = role.roleNamespace ?? `service:${serviceId}`;
      role.archivedAt = null;
    }

    const saved = await this.userRoleRepo.save(role);

    this.invalidateUserProfile(saved.userId);

    return (await this.userRoleRepo.findOne({
      where: { id: saved.id },
      relations: ['user', 'service', 'template'],
    })) as UserServiceRole;
  }

  async removeUserServiceRole(roleId: string): Promise<boolean> {
    const role = await this.userRoleRepo.findOne({ where: { id: roleId } });
    if (!role) {
      return false;
    }

    role.archivedAt = new Date();
    await this.userRoleRepo.save(role);

    this.invalidateUserProfile(role.userId);

    return true;
  }

  async ensureServiceTemplates(
    service: Service
  ): Promise<PermissionTemplate[]> {
    const existing = await this.templateRepo.find({
      where: {
        serviceId: service.id,
        scope: PermissionTemplateScope.SERVICE,
      },
    });

    const existingMap = new Map(existing.map((tpl) => [tpl.roleKey, tpl]));
    const toCreate: PermissionTemplate[] = [];

    const ensureTemplate = (
      roleKey: string,
      name: string,
      description: string,
      defaultPermissions: string[]
    ) => {
      const current = existingMap.get(roleKey);
      if (current) {
        const merged = Array.from(
          new Set([...current.permissions, ...defaultPermissions])
        );
        if (merged.length !== current.permissions.length) {
          current.permissions = merged;
          toCreate.push(current);
        }
        return;
      }
      const template = this.templateRepo.create({
        name,
        roleKey,
        description,
        scope: PermissionTemplateScope.SERVICE,
        serviceId: service.id,
        permissions: Array.from(new Set(defaultPermissions)),
        tags: ['default'],
      });
      toCreate.push(template);
    };

    ensureTemplate(
      DEFAULT_PERMISSION_TEMPLATES.READER,
      `${service.name} Reader`,
      'Read-only access to service queries and subscriptions',
      []
    );
    ensureTemplate(
      DEFAULT_PERMISSION_TEMPLATES.WRITER,
      `${service.name} Writer`,
      'Read and write access to service operations',
      []
    );
    ensureTemplate(
      DEFAULT_PERMISSION_TEMPLATES.SUBSCRIBER,
      `${service.name} Subscriber`,
      'Subscription access to service streams',
      []
    );
    ensureTemplate(
      DEFAULT_PERMISSION_TEMPLATES.ADMIN,
      `${service.name} Admin`,
      'Full administrative access to service operations',
      []
    );

    if (toCreate.length) {
      await this.templateRepo.save(toCreate);
    }

    return this.templateRepo.find({
      where: {
        serviceId: service.id,
        scope: PermissionTemplateScope.SERVICE,
      },
    });
  }

  private safeBuildSchema(sdl: string): GraphQLSchema {
    try {
      return buildSchema(sdl);
    } catch (error) {
      log.error('Failed to build GraphQL schema for permission sync', {
        error,
      });
      throw error;
    }
  }

  private extractOperationsFromSchema(
    schema: GraphQLSchema,
    service: Service
  ): OperationDescriptor[] {
    const operations: OperationDescriptor[] = [];

    const queryType = schema.getQueryType();
    if (queryType) {
      const fields = queryType.getFields();
      for (const fieldName of Object.keys(fields)) {
        operations.push({
          operationType: PermissionOperationType.QUERY,
          operationName: fieldName,
          fieldPath: '*',
          accessLevel: PermissionAccessLevel.READ,
          serviceId: service.id,
          serviceName: service.name,
        });
      }
    }
    const mutationType = schema.getMutationType();
    if (mutationType) {
      const fields = mutationType.getFields();
      for (const fieldName of Object.keys(fields)) {
        operations.push({
          operationType: PermissionOperationType.MUTATION,
          operationName: fieldName,
          fieldPath: '*',
          accessLevel: PermissionAccessLevel.WRITE,
          serviceId: service.id,
          serviceName: service.name,
        });
      }
    }
    const subscriptionType = schema.getSubscriptionType();
    if (subscriptionType) {
      const fields = subscriptionType.getFields();
      for (const fieldName of Object.keys(fields)) {
        operations.push({
          operationType: PermissionOperationType.SUBSCRIPTION,
          operationName: fieldName,
          fieldPath: '*',
          accessLevel: PermissionAccessLevel.SUBSCRIBE,
          serviceId: service.id,
          serviceName: service.name,
        });
      }
    }
    return operations;
  }

  private async persistOperations(
    service: { id: string; name: string },
    operations: OperationDescriptor[],
    options: { serviceEntity?: Service; skipTemplates?: boolean } = {}
  ): Promise<void> {
    const existing = await this.servicePermissionRepo.find({
      where: { serviceId: service.id },
    });
    const existingMap = new Map<string, ServicePermission>();
    existing.forEach((perm) => {
      existingMap.set(perm.permissionKey, perm);
      this.permissionCache.set(perm.permissionKey, perm);
    });

    const nextKeys = new Set<string>();
    const upserts: ServicePermission[] = [];

    for (const operation of operations) {
      const permissionKey = this.buildPermissionKey(operation);
      nextKeys.add(permissionKey);
      const current = existingMap.get(permissionKey);
      if (current) {
        if (!current.active || current.archivedAt) {
          current.active = true;
          current.archivedAt = null;
        }
        current.accessLevel = operation.accessLevel;
        current.metadata = {
          ...(current.metadata || {}),
          serviceName: operation.serviceName,
        };
        upserts.push(current);
      } else {
        const permission = this.servicePermissionRepo.create({
          serviceId: service.id,
          operationType: operation.operationType,
          operationName: operation.operationName,
          fieldPath: operation.fieldPath,
          permissionKey,
          accessLevel: operation.accessLevel,
          metadata: {
            serviceName: operation.serviceName,
          },
          active: true,
        });
        upserts.push(permission);
      }
    }

    if (upserts.length) {
      await this.servicePermissionRepo.save(upserts);
      upserts.forEach((perm) =>
        this.permissionCache.set(perm.permissionKey, perm)
      );
    }

    const toArchive = existing.filter(
      (perm) => !nextKeys.has(perm.permissionKey)
    );
    if (toArchive.length) {
      const now = new Date();
      toArchive.forEach((perm) => {
        perm.active = false;
        perm.archivedAt = now;
        this.permissionCache.set(perm.permissionKey, perm);
      });
      await this.servicePermissionRepo.save(toArchive);
      await this.removePermissionFromTemplates(
        toArchive.map((perm) => perm.permissionKey)
      );
      await this.removePermissionFromRoles(
        toArchive.map((perm) => perm.permissionKey)
      );
    }

    if (!options.skipTemplates && options.serviceEntity) {
      const ensured = await this.ensureServiceTemplates(options.serviceEntity);
      await this.appendNewPermissionsToTemplates(
        options.serviceEntity,
        operations,
        ensured
      );
    }
    this.updateOperationIndex(service, operations, toArchive);
  }

  private updateOperationIndexForPermission(permission: ServicePermission) {
    const key = `${permission.operationType}:${permission.operationName}`;
    if (!this.operationIndex.has(key)) {
      this.operationIndex.set(key, new Set());
    }

    if (permission.active && !permission.archivedAt) {
      this.operationIndex.get(key)!.add(permission.serviceId);
    } else {
      const set = this.operationIndex.get(key);
      if (set) {
        set.delete(permission.serviceId);
        if (set.size === 0) {
          this.operationIndex.delete(key);
        }
      }
    }
  }

  private async appendNewPermissionsToTemplates(
    service: Service,
    operations: OperationDescriptor[],
    templates?: PermissionTemplate[]
  ) {
    const list = templates ?? (await this.ensureServiceTemplates(service));
    if (!list.length) return;

    const templateMap = new Map(list.map((tpl) => [tpl.roleKey, tpl]));
    let dirty = false;

    for (const operation of operations) {
      const key = this.buildPermissionKey(operation);
      const appendToTemplate = (roleKey: string) => {
        const template = templateMap.get(roleKey);
        if (!template) return;
        if (!template.permissions.includes(key)) {
          template.permissions.push(key);
          dirty = true;
        }
      };

      appendToTemplate(DEFAULT_PERMISSION_TEMPLATES.ADMIN);

      switch (operation.accessLevel) {
        case PermissionAccessLevel.READ:
          appendToTemplate(DEFAULT_PERMISSION_TEMPLATES.READER);
          appendToTemplate(DEFAULT_PERMISSION_TEMPLATES.WRITER);
          break;
        case PermissionAccessLevel.WRITE:
          appendToTemplate(DEFAULT_PERMISSION_TEMPLATES.WRITER);
          break;
        case PermissionAccessLevel.SUBSCRIBE:
          appendToTemplate(DEFAULT_PERMISSION_TEMPLATES.SUBSCRIBER);
          appendToTemplate(DEFAULT_PERMISSION_TEMPLATES.ADMIN);
          break;
      }
    }

    if (dirty) {
      await this.templateRepo.save([...templateMap.values()]);
    }
  }

  private async removePermissionFromTemplates(permissionKeys: string[]) {
    if (!permissionKeys.length) return;
    const templates = await this.templateRepo
      .createQueryBuilder('template')
      .where(':...keys && template.permissions', { keys: permissionKeys })
      .getMany();

    if (!templates.length) return;

    templates.forEach((tpl) => {
      tpl.permissions = tpl.permissions.filter(
        (perm) => !permissionKeys.includes(perm)
      );
    });
    await this.templateRepo.save(templates);
  }

  private async removePermissionFromRoles(permissionKeys: string[]) {
    if (!permissionKeys.length) return;
    const roles = await this.userRoleRepo
      .createQueryBuilder('role')
      .where(':...keys && role.permissions', { keys: permissionKeys })
      .getMany();

    if (!roles.length) return;

    roles.forEach((role) => {
      role.permissions = role.permissions.filter(
        (perm) => !permissionKeys.includes(perm)
      );
    });

    await this.userRoleRepo.save(roles);
    roles.forEach((role) => this.invalidateUserProfile(role.userId));
  }

  private updateOperationIndex(
    service: { id: string },
    operations: OperationDescriptor[],
    archived: ServicePermission[]
  ) {
    for (const operation of operations) {
      const key = `${operation.operationType}:${operation.operationName}`;
      if (!this.operationIndex.has(key)) {
        this.operationIndex.set(key, new Set());
      }
      this.operationIndex.get(key)!.add(service.id);
    }

    // Remove archived operations from index
    for (const archivedPermission of archived) {
      const key = `${archivedPermission.operationType}:${archivedPermission.operationName}`;
      const set = this.operationIndex.get(key);
      if (!set) continue;
      set.delete(service.id);
      if (set.size === 0) {
        this.operationIndex.delete(key);
      }
    }
  }

  private buildClaimsFromRoles(
    roles: UserServiceRole[],
    templates: PermissionTemplate[]
  ): PermissionClaimEntry[] {
    const entries: PermissionClaimEntry[] = [];
    const templateMap = new Map(templates.map((tpl) => [tpl.id, tpl]));

    for (const role of roles) {
      const template = role.templateId
        ? templateMap.get(role.templateId)
        : null;
      const permissionKeys = new Set<string>();
      if (template) {
        template.permissions.forEach((perm) => permissionKeys.add(perm));
      }
      role.permissions.forEach((perm) => permissionKeys.add(perm));

      permissionKeys.forEach((permissionKey) => {
        const servicePermission = this.permissionCache.get(permissionKey);
        if (servicePermission && servicePermission.active) {
          entries.push({
            key: permissionKey,
            servicePermission,
          });
        }
      });
    }

    return entries;
  }

  private buildPermissionProfile(
    user: User,
    roles: UserServiceRole[],
    templates: PermissionTemplate[],
    claims: PermissionClaimEntry[]
  ): PermissionProfile {
    const claimObjects: PermissionClaim[] = claims.map((claim) => ({
      key: claim.key,
      operationType: claim.servicePermission.operationType,
      operationName: claim.servicePermission.operationName,
      fieldPath: claim.servicePermission.fieldPath,
      accessLevel: claim.servicePermission.accessLevel,
      serviceId: claim.servicePermission.serviceId,
      serviceName:
        (claim.servicePermission.metadata as any)?.serviceName || undefined,
    }));

    const basePermissions = Array.isArray(user.permissions)
      ? [...user.permissions]
      : [];

    if (basePermissions.includes('admin')) {
      const wildcardKey = [PERMISSION_KEY_PREFIX, '*', '*', '*', '*'].join(':');
      claimObjects.push({
        key: wildcardKey,
        operationType: PermissionOperationType.QUERY,
        operationName: '*',
        fieldPath: '*',
        accessLevel: PermissionAccessLevel.ADMIN,
        serviceId: '*',
        serviceName: 'Wildcard',
      });
    }

    return {
      userId: user.id,
      basePermissions,
      claims: claimObjects,
      roles,
      templates,
      refreshedAt: new Date(),
      isAdmin: basePermissions.includes('admin'),
    };
  }

  private claimsAllow(
    claimKeys: string[],
    permissionKey: string,
    requiredAccess?: PermissionAccessLevel
  ): boolean {
    const requiredParts = permissionKey.split(':');
    for (const claim of claimKeys) {
      const claimParts = claim.split(':');
      if (claimParts.length !== requiredParts.length) continue;
      let matches = true;
      for (let i = 0; i < requiredParts.length; i += 1) {
        const actual = claimParts[i];
        const expected = requiredParts[i];
        if (actual === '*') continue;
        if (actual !== expected) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      if (!requiredAccess) {
        return true;
      }

      const permission = this.permissionCache.get(claim);
      if (!permission) {
        return true;
      }
      if (!permission.active) {
        continue;
      }

      if (this.accessLevelSatisfies(permission.accessLevel, requiredAccess)) {
        return true;
      }
    }
    return false;
  }

  private accessLevelSatisfies(
    actual: PermissionAccessLevel,
    required: PermissionAccessLevel
  ): boolean {
    if (actual === PermissionAccessLevel.ADMIN) return true;
    if (required === PermissionAccessLevel.ADMIN) return false;

    if (required === PermissionAccessLevel.READ) {
      return (
        actual === PermissionAccessLevel.READ ||
        actual === PermissionAccessLevel.WRITE ||
        actual === PermissionAccessLevel.SUBSCRIBE
      );
    }
    if (required === PermissionAccessLevel.WRITE) {
      return actual === PermissionAccessLevel.WRITE;
    }
    if (required === PermissionAccessLevel.SUBSCRIBE) {
      return actual === PermissionAccessLevel.SUBSCRIBE;
    }
    return false;
  }

  private async resolvePermissionsByKeys(
    permissionKeys: string[]
  ): Promise<ServicePermission[]> {
    if (!permissionKeys.length) {
      return [];
    }

    const uniqueKeys = Array.from(new Set(permissionKeys));
    const resolved: ServicePermission[] = [];
    const missing: string[] = [];

    for (const key of uniqueKeys) {
      const cached = this.permissionCache.get(key);
      if (cached) {
        resolved.push(cached);
      } else {
        missing.push(key);
      }
    }

    if (missing.length) {
      const found = await this.servicePermissionRepo.find({
        where: {
          permissionKey: In(missing),
        },
      });
      found.forEach((perm) =>
        this.permissionCache.set(perm.permissionKey, perm)
      );

      if (found.length !== missing.length) {
        const foundKeys = new Set(found.map((perm) => perm.permissionKey));
        const notFound = missing.filter((key) => !foundKeys.has(key));
        throw new Error(`Unknown permission keys: ${notFound.join(', ')}`);
      }

      resolved.push(...found);
    }

    return resolved;
  }

  async createOrUpdateTemplate(options: {
    id?: string;
    serviceId: string;
    name: string;
    roleKey: string;
    description?: string;
    tags?: string[];
    permissions: string[];
  }): Promise<PermissionTemplate> {
    const { id, serviceId, name, roleKey, description, tags, permissions } =
      options;

    // Validate service exists
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
    });
    if (!service) {
      throw new Error('Service not found');
    }

    // Validate permissions belong to this service
    await this.validatePermissionKeys(permissions, serviceId);

    let template: PermissionTemplate;
    if (id) {
      // Update existing template
      const existing = await this.templateRepo.findOne({ where: { id } });
      if (!existing) {
        throw new Error('Template not found');
      }
      template = existing;
    } else {
      // Check for duplicate role key within service
      const duplicate = await this.templateRepo.findOne({
        where: {
          serviceId,
          roleKey,
          scope: PermissionTemplateScope.SERVICE,
        },
      });
      if (duplicate) {
        throw new Error(
          `Template with role key '${roleKey}' already exists for this service`
        );
      }

      template = this.templateRepo.create({
        serviceId,
        scope: PermissionTemplateScope.SERVICE,
      });
    }

    template.name = name;
    template.roleKey = roleKey;
    template.description = description || null;
    template.tags = tags && tags.length ? tags : null;
    template.permissions = Array.from(new Set(permissions));

    const saved = await this.templateRepo.save(template);

    // Invalidate cache for users with roles using this template
    const roles = await this.userRoleRepo.find({
      where: { templateId: template.id },
    });
    roles.forEach((role) => this.invalidateUserProfile(role.userId));

    return saved;
  }

  async deleteTemplate(templateId: string): Promise<boolean> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId },
    });
    if (!template) {
      return false;
    }

    // Check if template is in use by any roles
    const rolesCount = await this.userRoleRepo.count({
      where: { templateId, archivedAt: IsNull() },
    });

    if (rolesCount > 0) {
      throw new Error(
        `Cannot delete template '${template.name}' as it is currently assigned to ${rolesCount} user role(s). Please remove all role assignments first.`
      );
    }

    await this.templateRepo.remove(template);
    return true;
  }

  async createCustomPermission(options: {
    serviceId: string;
    operationType: PermissionOperationType;
    operationName: string;
    fieldPath?: string;
    accessLevel: PermissionAccessLevel;
    active: boolean;
  }): Promise<ServicePermission> {
    const {
      serviceId,
      operationType,
      operationName,
      fieldPath,
      accessLevel,
      active,
    } = options;

    // Validate service exists
    const service = await this.serviceRepo.findOne({
      where: { id: serviceId },
    });
    if (!service) {
      throw new Error('Service not found');
    }

    const permissionKey = this.buildPermissionKey({
      serviceId,
      operationType,
      operationName,
      fieldPath,
    });

    // Check if permission already exists
    const existing = await this.servicePermissionRepo.findOne({
      where: { permissionKey },
    });

    if (existing) {
      throw new Error(
        `Permission for ${operationType} ${operationName}${fieldPath ? `.${fieldPath}` : ''} already exists for this service`
      );
    }

    const permission = this.servicePermissionRepo.create({
      serviceId,
      operationType,
      operationName,
      fieldPath: fieldPath || '*',
      permissionKey,
      accessLevel,
      active,
      metadata: {
        serviceName: service.name,
        createdManually: true,
      },
    });

    const saved = await this.servicePermissionRepo.save(permission);

    // Update cache
    this.permissionCache.set(saved.permissionKey, saved);
    this.updateOperationIndexForPermission(saved);

    return saved;
  }

  async syncServicePermissionsFromSDL(
    serviceId: string,
    sdl: string
  ): Promise<boolean> {
    try {
      const service = await this.serviceRepo.findOne({
        where: { id: serviceId },
      });
      if (!service) {
        throw new Error('Service not found');
      }

      await this.syncServicePermissions(service, sdl);
      return true;
    } catch (error) {
      log.error('Failed to sync service permissions from SDL', {
        operation: 'PermissionService.syncServicePermissionsFromSDL',
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { serviceId },
      });
      throw error;
    }
  }

  private async validatePermissionKeys(
    permissionKeys: string[],
    serviceId?: string | null
  ): Promise<void> {
    if (!permissionKeys.length) {
      return;
    }

    const permissions = await this.resolvePermissionsByKeys(permissionKeys);

    if (!serviceId) {
      return;
    }

    const invalid = permissions.filter(
      (perm) =>
  perm.serviceId !== serviceId
    );

    if (invalid.length) {
      throw new Error(
        `Permission ${invalid[0].permissionKey} does not belong to the specified service`
      );
    }
  }
}
