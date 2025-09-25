import { Container } from 'typedi';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { dataSource } from '../db/datasource';
// Entities and services to mirror DI wiring from gateway bootstrap
import { ApiKeyUsage } from '../entities/api-key-usage.entity';
import { ApplicationUsage } from '../entities/application-usage.entity';
import { Application } from '../entities/application.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { RequestLatency } from '../entities/request-latency.entity';
import { SchemaChange } from '../entities/schema-change.entity';
import { ServiceKey } from '../entities/service-key.entity';
import { Service as ServiceEntity } from '../entities/service.entity';
import { Session } from '../entities/session.entity';
import { ServiceRegistryService } from '../services/service-registry/service-registry.service';
import { SessionService } from '../services/sessions/session.service';
import { User } from '../services/users/user.entity';

/**
 * Test Database Manager for managing database lifecycle in tests
 * Provides isolated database state for each test by dropping and recreating schema
 */
export class TestDatabaseManager {
  private static initialized = false;
  private static dataSourceInstance: DataSource;
  private static initPromise: Promise<void> | null = null;

  /**
   * Initialize the test database connection
   * Note: Migrations are handled by global test setup, this only ensures connection exists
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      this.dataSourceInstance = dataSource;

      if (!this.dataSourceInstance.isInitialized) {
        await this.dataSourceInstance.initialize();
      }

      // Note: Migrations are now handled by global test setup
      // This initialization only ensures database connection exists

      try {
        // Repositories
        Container.set(
          'UserRepository',
          this.dataSourceInstance.getRepository(User)
        );
        Container.set(
          'SessionRepository',
          this.dataSourceInstance.getRepository(Session)
        );
        Container.set(
          'ApplicationRepository',
          this.dataSourceInstance.getRepository(Application)
        );
        Container.set(
          'ServiceRepository',
          this.dataSourceInstance.getRepository(ServiceEntity)
        );
        Container.set(
          'ServiceKeyRepository',
          this.dataSourceInstance.getRepository(ServiceKey)
        );
        Container.set(
          'AuditLogRepository',
          this.dataSourceInstance.getRepository(AuditLog)
        );
        Container.set(
          'SchemaChangeRepository',
          this.dataSourceInstance.getRepository(SchemaChange)
        );
        Container.set(
          'ApplicationUsageRepository',
          this.dataSourceInstance.getRepository(ApplicationUsage)
        );
        Container.set(
          'ApiKeyUsageRepository',
          this.dataSourceInstance.getRepository(ApiKeyUsage)
        );
        Container.set(
          'RequestLatencyRepository',
          this.dataSourceInstance.getRepository(RequestLatency)
        );

        Container.set('SessionService', Container.get(SessionService));
        Container.set(
          'ServiceRegistryService',
          Container.get(ServiceRegistryService)
        );

        try {
          const registry = Container.get(ServiceRegistryService);
          await registry.loadServicesIntoKeyManager();
        } catch {}
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          '[TestDatabaseManager] Failed to fully configure DI container:',
          e
        );
      }

      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Get a repository for the given entity
   * Same interface as TypeORM DataSource.getRepository()
   */
  static async getRepository<Entity extends ObjectLiteral>(
    target: EntityTarget<Entity>
  ): Promise<Repository<Entity>> {
    if (!this.initialized || !this.dataSourceInstance?.isInitialized) {
      if (!this.initPromise) {
        console.warn(
          'TestDatabaseManager was not initialized. Automatically initializing now.'
        );
      }
      await this.initialize();
      return this.dataSourceInstance.getRepository(target);
    }
    return this.dataSourceInstance.getRepository(target);
  }

  /**
   * Clean the database by dropping all tables and recreating the schema
   * This provides complete isolation between tests
   */
  static async cleanDatabase(): Promise<void> {
    if (!this.initialized || !this.dataSourceInstance?.isInitialized) {
      return;
    }

    try {
      // Acquire a global advisory lock to avoid concurrent truncations across test files.
      // Use a single 64-bit bigint key to avoid int4 overflow issues.
      const lockKey = '3544952156018063168'; // arbitrary stable bigint within signed 64-bit range
      await this.dataSourceInstance.query(
        'SELECT pg_advisory_lock($1::bigint)',
        [lockKey]
      );

      // TRUNCATE all non-migration tables for fast cleanup between tests
      const excludeTables = [
        // Keep migration history and internal metadata intact
        'migrations',
        'typeorm_metadata',
      ];

      // Discover all public base tables excluding the above
      const rows: Array<{ table_schema: string; table_name: string }> =
        await this.dataSourceInstance.query(
          `
          SELECT table_schema, table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND NOT (table_name = ANY($1))
        `,
          [excludeTables]
        );

      const fqtns = rows.map(
        (r) =>
          `"${r.table_schema.replace(/"/g, '""')}"."${r.table_name.replace(/"/g, '""')}"`
      );

      if (fqtns.length > 0) {
        await this.dataSourceInstance.query(
          `TRUNCATE TABLE ${fqtns.join(', ')} RESTART IDENTITY CASCADE`
        );
      }
    } catch (error) {
      console.error('Error cleaning database:', error);
      throw error;
    } finally {
      // Always release the advisory lock
      try {
        const lockKey = '3544952156018063168';
        await this.dataSourceInstance.query(
          'SELECT pg_advisory_unlock($1::bigint)',
          [lockKey]
        );
      } catch {
        // ignore unlock errors
      }
    }
  }

  /**
   * Set up a clean database state before each test
   * Call this in beforeEach hooks
   */
  static async setupTest(): Promise<void> {
    await this.initialize();
    await this.cleanDatabase();
  }

  /**
   * Clean up after tests
   * Call this after test suites complete
   */
  static async cleanup(): Promise<void> {
    if (this.dataSourceInstance?.isInitialized) {
      await this.dataSourceInstance.destroy();
    }
    this.initialized = false;
  }

  // Compatibility helpers used in some test files
  static async setupDatabase(): Promise<void> {
    // Fast initialization - migrations handled by global setup
    await this.initialize();
  }

  static async clearDatabase(): Promise<void> {
    await this.cleanDatabase();
  }

  static async teardownDatabase(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Get the underlying DataSource instance
   * Use sparingly - prefer getRepository() for most cases
   */
  static getDataSource(): DataSource {
    if (!this.initialized || !this.dataSourceInstance?.isInitialized) {
      throw new Error('TestDatabaseManager must be initialized before use.');
    }
    return this.dataSourceInstance;
  }

  /**
   * Execute raw SQL queries for advanced test scenarios
   */
  static async query(sql: string, parameters?: any[]): Promise<any> {
    return this.getDataSource().query(sql, parameters);
  }

  /**
   * Start a transaction for test scenarios requiring transaction control
   */
  static async startTransaction() {
    return this.getDataSource().createQueryRunner();
  }
}

/**
 * Helper function for test setup
 * Use this in test files that need database access
 */
export async function setupTestDatabase(): Promise<void> {
  await TestDatabaseManager.setupTest();
}

/**
 * Helper function for test cleanup
 * Use this in test cleanup or after hooks
 */
export async function cleanupTestDatabase(): Promise<void> {
  await TestDatabaseManager.cleanup();
}
