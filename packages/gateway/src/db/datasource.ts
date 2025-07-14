import * as TypeORM from "typeorm";
import { User } from "../services/users/user.entity";
import { Session } from "../entities/session.entity";
import { Service } from "../entities/service.entity";
import { ServiceKey } from "../entities/service-key.entity";
import { Application } from "../entities/application.entity";
import { ApiKey } from "../entities/api-key.entity";

// Create TypeORM dataSource
export const dataSource = new TypeORM.DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/gateway',
  synchronize: process.env.NODE_ENV === 'test' || process.env.NODE_ENV !== 'production',
  dropSchema: false, // Let test-utils handle schema management
  cache: process.env.NODE_ENV !== 'test', // Disable caching in tests for speed
  logging: process.env.NODE_ENV === 'test' ? false : (process.env.NODE_ENV === 'development' ? "all" : ["error"]),
  entities: [User, Session, Service, ServiceKey, Application, ApiKey],
  logger: "advanced-console",
  // Optimizations for tests
  ...(process.env.NODE_ENV === 'test' && {
    extra: {
      max: 5, // Smaller connection pool for tests
      min: 1,
      idleTimeoutMillis: 1000, // Close idle connections faster
      connectionTimeoutMillis: 1000, // Faster connection timeout
    }
  })
});