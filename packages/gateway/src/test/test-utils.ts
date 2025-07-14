import { describe, beforeEach, afterEach, before, after } from 'node:test';
import { Container } from 'typedi';
import { dataSource } from '../db/datasource';
import { redisClient, initializeRedis } from '../auth/session.config';
import { User } from '../services/users/user.entity';
import { Session } from '../entities/session.entity';
import { Service } from '../entities/service.entity';
import { ServiceKey } from '../entities/service-key.entity';
import { Application } from '../entities/application.entity';
import { ApiKey } from '../entities/api-key.entity';

export class TestDatabaseManager {
  private static isSetup = false;
  
  static async setupDatabase() {
    // Prevent multiple setups in the same test run
    if (TestDatabaseManager.isSetup) {
      return;
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
    Container.reset();
    TestDatabaseManager.isSetup = false;
  }

  static async clearDatabase() {
    // Disable foreign key checks temporarily for cleanup
    await dataSource.query('SET session_replication_role = replica;');
    
    try {
      // Clear all tables in reverse dependency order to avoid FK constraints
      const entities = dataSource.entityMetadatas;
      
      // First, clear tables that reference other tables (child tables)
      const childEntities = ['Session', 'ServiceKey', 'ApiKey'];
      for (const entityName of childEntities) {
        const entity = entities.find(e => e.name === entityName);
        if (entity) {
          await dataSource.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE;`);
        }
      }
      
      // Then clear parent tables
      const parentEntities = ['User', 'Service', 'Application'];
      for (const entityName of parentEntities) {
        const entity = entities.find(e => e.name === entityName);
        if (entity) {
          await dataSource.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE;`);
        }
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
