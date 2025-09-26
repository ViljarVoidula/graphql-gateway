import { Inject, Service } from 'typedi';
import { Repository } from 'typeorm';
import {
  ServiceKey,
  ServiceKeyStatus,
} from '../../entities/service-key.entity';
import {
  Service as ServiceEntity,
  ServiceStatus,
} from '../../entities/service.entity';
import { keyManager } from '../../security/keyManager';
import { log } from '../../utils/logger';
import { User } from '../users/user.entity';

@Service()
export class ServiceRegistryService {
  constructor(
    @Inject('ServiceRepository')
    private serviceRepository: Repository<ServiceEntity>,
    @Inject('ServiceKeyRepository')
    private serviceKeyRepository: Repository<ServiceKey>,
    @Inject('UserRepository')
    private userRepository: Repository<User>
  ) {}

  async getAllServices(): Promise<ServiceEntity[]> {
    return this.serviceRepository.find({
      relations: ['keys', 'owner'],
      where: { status: ServiceStatus.ACTIVE },
    });
  }

  /**
   * Return services that should be considered for polling by the SchemaLoader.
   * We include ACTIVE and INACTIVE so the gateway can attempt to recover
   * previously unhealthy (marked inactive) services automatically.
   * MAINTENANCE is excluded so deliberate maintenance windows are respected.
   */
  async getPollableServices(): Promise<ServiceEntity[]> {
    return this.serviceRepository.find({
      relations: ['keys', 'owner'],
      where: [
        { status: ServiceStatus.ACTIVE },
        { status: ServiceStatus.INACTIVE },
      ],
    });
  }

  async getServiceById(id: string): Promise<ServiceEntity | null> {
    return this.serviceRepository.findOne({
      where: { id },
      relations: ['keys', 'owner'],
    });
  }

  async getServicesByOwner(ownerId: string): Promise<ServiceEntity[]> {
    return this.serviceRepository.find({
      where: { ownerId, status: ServiceStatus.ACTIVE },
      relations: ['keys', 'owner'],
    });
  }

  // Returns services for an owner regardless of status (active/inactive/maintenance)
  async getServicesByOwnerIncludingInactive(
    ownerId: string
  ): Promise<ServiceEntity[]> {
    return this.serviceRepository.find({
      where: { ownerId },
      relations: ['keys', 'owner'],
    });
  }

  // Returns all services regardless of status
  async getAllServicesIncludingInactive(): Promise<ServiceEntity[]> {
    return this.serviceRepository.find({
      relations: ['keys', 'owner'],
    });
  }

  async getServiceByUrl(url: string): Promise<ServiceEntity | null> {
    return this.serviceRepository.findOne({
      where: { url },
      relations: ['keys', 'owner'],
    });
  }

  async registerService(data: {
    name: string;
    url: string;
    ownerId: string;
    description?: string;
    version?: string;
    enableHMAC?: boolean;
    timeout?: number;
    enableBatching?: boolean;
    externally_accessible?: boolean;
    // New subscription configuration fields
    subscriptionTransport?: any;
    subscriptionPath?: string | null;
  }): Promise<{ service: ServiceEntity; hmacKey?: any }> {
    // Disallow registering internal gateway pseudo endpoints
    if (data.url.startsWith('internal://')) {
      throw new Error('Cannot register internal gateway endpoints');
    }
    // Verify owner exists
    const owner = await this.userRepository.findOne({
      where: { id: data.ownerId },
    });

    if (!owner) {
      throw new Error('Owner not found');
    }

    const service = this.serviceRepository.create({
      ...data,
      externally_accessible: data.externally_accessible !== false,
      ownerId: owner.id,
      status: ServiceStatus.ACTIVE,
      // Persist subscription configuration if provided
      subscriptionTransport: data.subscriptionTransport,
      subscriptionPath: data.subscriptionPath ?? null,
    });

    const savedService = await this.serviceRepository.save(service);

    let hmacKey = null;
    if (data.enableHMAC !== false) {
      // Generate HMAC key
      const keyData = this.generateServiceKey(data.url);

      // Store in database
      const serviceKey = this.serviceKeyRepository.create({
        keyId: keyData.keyId,
        secretKey: keyData.secretKey,
        serviceId: savedService.id,
        status: ServiceKeyStatus.ACTIVE,
      });

      await this.serviceKeyRepository.save(serviceKey);

      hmacKey = {
        keyId: keyData.keyId,
        secretKey: keyData.secretKey,
        instructions: keyData.instructions,
      };
    }

    // Return service with owner populated
    const serviceWithOwner = await this.getServiceById(savedService.id);

    // Invalidate cache and trigger gateway reload
    ServiceCacheManager.invalidateServiceCache();

    // Trigger gateway reload asynchronously (don't wait for it)
    ServiceCacheManager.triggerGatewayReload().catch((error) => {
      log.error('Failed to trigger gateway reload:', error);
    });

    return { service: serviceWithOwner, hmacKey };
  }

  async updateService(
    id: string,
    data: Partial<ServiceEntity>,
    requestingUserId?: string
  ): Promise<ServiceEntity> {
    const service = await this.getServiceById(id);
    if (!service) {
      throw new Error('Service not found');
    }

    // Check if requesting user is the owner or admin
    if (requestingUserId && service.ownerId !== requestingUserId) {
      const requestingUser = await this.userRepository.findOne({
        where: { id: requestingUserId },
      });
      if (!requestingUser?.permissions?.includes('admin')) {
        throw new Error('Not authorized to update this service');
      }
    }

    await this.serviceRepository.update(id, data);

    // Invalidate cache and trigger gateway reload
    ServiceCacheManager.invalidateServiceCache();
    ServiceCacheManager.triggerGatewayReload().catch((error) => {
      log.error('Failed to trigger gateway reload:', error);
    });

    return this.getServiceById(id);
  }

  async removeService(id: string, requestingUserId?: string): Promise<boolean> {
    const service = await this.getServiceById(id);
    if (!service) return false;

    // Protect internal gateway pseudo service if ever present
    if (service.url === 'internal://gateway') {
      throw new Error('Cannot remove internal gateway service');
    }

    // Check if requesting user is the owner or admin
    if (requestingUserId && service.ownerId !== requestingUserId) {
      const requestingUser = await this.userRepository.findOne({
        where: { id: requestingUserId },
      });
      if (!requestingUser?.permissions?.includes('admin')) {
        throw new Error('Not authorized to remove this service');
      }
    }

    // Revoke all keys for this service
    await this.serviceKeyRepository.update(
      { serviceId: id },
      { status: ServiceKeyStatus.REVOKED }
    );

    // Remove from keyManager
    keyManager.removeService(service.url);

    // Soft delete - mark as inactive
    await this.serviceRepository.update(id, { status: ServiceStatus.INACTIVE });

    // Invalidate cache and trigger gateway reload
    ServiceCacheManager.invalidateServiceCache();
    ServiceCacheManager.triggerGatewayReload().catch((error) => {
      log.error('Failed to trigger gateway reload:', error);
    });

    return true;
  }

  async rotateServiceKey(
    serviceId: string,
    requestingUserId?: string
  ): Promise<{ oldKeyId?: string; newKey: any }> {
    const service = await this.getServiceById(serviceId);
    if (!service) throw new Error('Service not found');

    // Check if requesting user is the owner or admin/service-manager
    if (requestingUserId && service.ownerId !== requestingUserId) {
      const requestingUser = await this.userRepository.findOne({
        where: { id: requestingUserId },
      });
      if (
        !requestingUser?.permissions?.some((permission) =>
          ['admin', 'service-manager'].includes(permission)
        )
      ) {
        throw new Error('Not authorized to rotate keys for this service');
      }
    }

    // Get current active key
    const activeKey = await this.serviceKeyRepository.findOne({
      where: { serviceId, status: ServiceKeyStatus.ACTIVE },
    });

    // Generate new key
    const newKeyData = this.generateServiceKey(service.url);

    // Store new key
    const newServiceKey = this.serviceKeyRepository.create({
      keyId: newKeyData.keyId,
      secretKey: newKeyData.secretKey,
      serviceId: service.id,
      status: ServiceKeyStatus.ACTIVE,
    });

    await this.serviceKeyRepository.save(newServiceKey);

    // Mark old key as expired (with grace period)
    if (activeKey) {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour grace period
      await this.serviceKeyRepository.update(activeKey.id, {
        status: ServiceKeyStatus.EXPIRED,
        expiresAt,
      });
    }

    return {
      oldKeyId: activeKey?.keyId,
      newKey: {
        keyId: newKeyData.keyId,
        secretKey: newKeyData.secretKey,
        instructions: `Key rotated for service: ${service.name}. Old key will expire in 1 hour.`,
      },
    };
  }

  async getServiceKeys(serviceId: string): Promise<ServiceKey[]> {
    return this.serviceKeyRepository.find({
      where: { serviceId },
      relations: ['service'],
    });
  }

  async revokeServiceKey(keyId: string): Promise<boolean> {
    const result = await this.serviceKeyRepository.update(
      { keyId },
      { status: ServiceKeyStatus.REVOKED }
    );

    // Also revoke from keyManager
    keyManager.revokeKey(keyId);

    return result.affected > 0;
  }

  async loadServicesIntoKeyManager(): Promise<void> {
    const services = await this.getAllServices();

    for (const service of services) {
      const activeKey = service.keys.find(
        (k) => k.status === ServiceKeyStatus.ACTIVE
      );
      if (activeKey && service.enableHMAC) {
        // Load key into keyManager by storing it directly
        // This simulates the keyManager having the key
        keyManager.getKey(activeKey.keyId) ||
          keyManager.generateKey(service.url);
      }
    }
  }

  private generateServiceKey(url: string): {
    keyId: string;
    secretKey: string;
    instructions: string;
  } {
    // Generate a unique key ID
    const keyId = `sk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate or get the secret key from keyManager
    const serviceKey = keyManager.generateKey(url);

    return {
      keyId,
      secretKey: serviceKey.secretKey,
      instructions: `Service key generated for: ${url}. Store this securely - it won't be shown again.`,
    };
  }

  async getExternallyAccessibleServices(): Promise<ServiceEntity[]> {
    return this.serviceRepository.find({
      where: { externally_accessible: true, status: ServiceStatus.ACTIVE },
      relations: ['owner'],
    });
  }
}

// Cache invalidation utilities
export class ServiceCacheManager {
  private static serviceEndpointCache = new Map<
    string,
    { endpoints: string[]; lastUpdated: number }
  >();
  private static schemaLoader: any = null;

  static setSchemaLoader(loader: any) {
    this.schemaLoader = loader;
  }

  static setServiceCache(
    cache: Map<string, { endpoints: string[]; lastUpdated: number }>
  ) {
    this.serviceEndpointCache = cache;
  }

  static invalidateServiceCache() {
    log.debug('Invalidating service endpoint cache');
    this.serviceEndpointCache.clear();

    // Also clear schema cache to force re-introspection
    const { schemaCache } = require('../../SchemaLoader');
    if (schemaCache) {
      schemaCache.clear();
      log.debug('Cleared schema cache');
    }
  }

  static async triggerGatewayReload() {
    if (this.schemaLoader) {
      log.debug('Triggering gateway schema reload');
      await this.schemaLoader.reload();
    }
  }
}
