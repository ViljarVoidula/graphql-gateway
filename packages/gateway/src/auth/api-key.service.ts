import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { dataSource } from '../db/datasource';
import { ApiKey, ApiKeyStatus } from '../entities/api-key.entity';
import { Application } from '../entities/application.entity';
import crypto from 'crypto';

@Service()
export class ApiKeyService {
  private apiKeyRepository: Repository<ApiKey>;
  private applicationRepository: Repository<Application>;

  constructor() {
    this.apiKeyRepository = dataSource.getRepository(ApiKey);
    this.applicationRepository = dataSource.getRepository(Application);
  }

  /**
   * Validate an API key and return the associated application and user context
   */
  async validateApiKey(apiKey: string): Promise<{
    application: Application;
    apiKeyEntity: ApiKey;
    user: { id: string; permissions: string[] };
  } | null> {
    if (!apiKey || !apiKey.startsWith('app_')) {
      return null;
    }

    const keyPrefix = apiKey.substring(0, 12); // "app_" + 8 chars
    const hashedKey = this.hashApiKey(apiKey);

    const apiKeyEntity = await this.apiKeyRepository.findOne({
      where: { keyPrefix, hashedKey, status: ApiKeyStatus.ACTIVE },
      relations: ['application', 'application.owner', 'application.whitelistedServices'],
    });

    if (!apiKeyEntity) {
      return null;
    }

    // Check if key is expired
    if (apiKeyEntity.expiresAt && apiKeyEntity.expiresAt < new Date()) {
      await this.apiKeyRepository.update(apiKeyEntity.id, { status: ApiKeyStatus.EXPIRED });
      return null;
    }

    // Update last used timestamp
    await this.apiKeyRepository.update(apiKeyEntity.id, { lastUsedAt: new Date() });

    return {
      application: apiKeyEntity.application,
      apiKeyEntity,
      user: {
        id: apiKeyEntity.application.owner.id,
        permissions: [...(apiKeyEntity.application.owner.permissions || []), 'api-key-user'],
      },
    };
  }

  /**
   * Generate a new API key
   */
  async generateApiKey(applicationId: string, name: string, scopes: string[] = [], expiresAt?: Date): Promise<{ apiKey: string; entity: ApiKey }> {
    const rawKey = this.generateRawApiKey();
    const keyPrefix = rawKey.substring(0, 12);
    const hashedKey = this.hashApiKey(rawKey);

    const apiKeyEntity = this.apiKeyRepository.create({
      keyPrefix,
      hashedKey,
      name,
      scopes,
      expiresAt,
      applicationId,
      status: ApiKeyStatus.ACTIVE,
    });

    await this.apiKeyRepository.save(apiKeyEntity);

    return {
      apiKey: rawKey,
      entity: apiKeyEntity,
    };
  }

  private generateRawApiKey(): string {
    const randomBytes = crypto.randomBytes(32);
    return `app_${randomBytes.toString('hex')}`;
  }

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }
}
