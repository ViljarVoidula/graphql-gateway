import { after, before, beforeEach, describe } from 'node:test';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Container } from 'typedi';
import { initializeRedis, redisClient } from '../auth/session.config';
import { dataSource } from '../db/datasource';
import { ApiKey } from '../entities/api-key.entity';
import { Application } from '../entities/application.entity';
import { ServiceKey } from '../entities/service-key.entity';
import { Service } from '../entities/service.entity';
import { Session } from '../entities/session.entity';
import { User } from '../services/users/user.entity';

export class TestDatabaseManager {
  private static isSetup = false;
  private static pgContainer: StartedTestContainer | null = null;
  private static redisContainer: StartedTestContainer | null = null;

  static async setupDatabase() {
    // Prevent multiple setups in the same test run
    if (TestDatabaseManager.isSetup) {
      return;
    }

    // Spin up containers for Postgres and Redis unless explicitly disabled
    const useTestcontainers = process.env.USE_TESTCONTAINERS !== 'false';
    if (process.env.NODE_ENV !== 'test') {
      process.env.NODE_ENV = 'test';
    }

    if (useTestcontainers) {
      // Start Postgres
      if (!TestDatabaseManager.pgContainer) {
        const pg = await new GenericContainer('postgres:17.5-alpine')
          .withEnvironment({
            POSTGRES_PASSWORD: 'password',
            POSTGRES_USER: 'postgres',
            POSTGRES_DB: 'gateway'
          })
          .withExposedPorts(5432)
          .withWaitStrategy(Wait.forListeningPorts())
          .start();
        TestDatabaseManager.pgContainer = pg;
        const host = pg.getHost();
        const port = pg.getMappedPort(5432);
        process.env.DATABASE_URL = `postgres://postgres:password@${host}:${port}/gateway`;
        // Ensure TypeORM uses the updated URL
        try {
          (dataSource as any).options.url = process.env.DATABASE_URL;
        } catch {}
      }

      // Start Redis
      if (!TestDatabaseManager.redisContainer) {
        const redis = await new GenericContainer('redis:7.4.1-alpine')
          .withExposedPorts(6379)
          .withWaitStrategy(Wait.forListeningPorts())
          .start();
        TestDatabaseManager.redisContainer = redis;
        const host = redis.getHost();
        const port = redis.getMappedPort(6379);
        process.env.REDIS_URL = `redis://${host}:${port}/1`;
        // Ensure Redis client uses updated URL
        try {
          (redisClient as any).options = { ...(redisClient as any).options, url: process.env.REDIS_URL };
        } catch {}
      }
    }

    // Your existing data source will read from environment variables
    // In test mode, it will use the test database configured in .env.test
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    // Ensure clean database setup for tests
    if (process.env.NODE_ENV === 'test') {
      // Drop all existing tables and types to ensure clean state
      await dataSource.dropDatabase();
      await dataSource.synchronize(false); // Create fresh schema
    }

    // Setup Redis using the global client from session config
    if (!redisClient.isOpen) {
      await initializeRedis();
    }

    // Setup dependency injection for tests using existing data source
    Container.set('UserRepository', dataSource.getRepository(User));
    Container.set('SessionRepository', dataSource.getRepository(Session));
    Container.set('ServiceRepository', dataSource.getRepository(Service));
    Container.set('ServiceKeyRepository', dataSource.getRepository(ServiceKey));
    Container.set('ApplicationRepository', dataSource.getRepository(Application));
    Container.set('ApiKeyRepository', dataSource.getRepository(ApiKey));

    TestDatabaseManager.isSetup = true;
  }

  static async teardownDatabase() {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    if (redisClient.isOpen) {
      await redisClient.disconnect();
    }
    // Stop containers if they were started
    try {
      if (TestDatabaseManager.pgContainer) {
        await TestDatabaseManager.pgContainer.stop();
      }
    } catch {}
    try {
      if (TestDatabaseManager.redisContainer) {
        await TestDatabaseManager.redisContainer.stop();
      }
    } catch {}
    TestDatabaseManager.pgContainer = null;
    TestDatabaseManager.redisContainer = null;
    Container.reset();
    TestDatabaseManager.isSetup = false;
  }

  static async clearDatabase() {
    // Disable foreign key checks temporarily for cleanup
    await dataSource.query('SET session_replication_role = replica;');

    try {
      // TRUNCATE all tables in the public schema (includes join tables) and reset identities
      const rows: Array<{ tablename: string }> = await dataSource.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
      );
      for (const { tablename } of rows) {
        // Skip TypeORM internal metadata table if present
        if (tablename === 'typeorm_metadata') continue;
        await dataSource.query(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE;`);
      }
    } finally {
      // Re-enable foreign key checks
      await dataSource.query('SET session_replication_role = DEFAULT;');
    }

    // Clear Redis using the global client
    if (redisClient.isOpen) {
      await redisClient.flushDb();
    }
  }

  static getRepository<T>(entityClass: new () => T) {
    return dataSource.getRepository(entityClass);
  }
}

// Test wrapper function similar to your existing pattern
export function describeWithDatabase(name: string, testFn: () => void) {
  describe(name, () => {
    before(async () => {
      await TestDatabaseManager.setupDatabase();
    });

    after(async () => {
      await TestDatabaseManager.teardownDatabase();
    });

    beforeEach(async () => {
      await TestDatabaseManager.clearDatabase();
    });

    testFn();
  });
}
