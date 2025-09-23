import * as TypeORM from 'typeorm';
import { ApiKeyUsage } from '../entities/api-key-usage.entity';
import { ApiKey } from '../entities/api-key.entity';
import { ApplicationServiceRateLimit } from '../entities/application-service-rate-limit.entity';
import { ApplicationUsage } from '../entities/application-usage.entity';
import { Application } from '../entities/application.entity';
import { Asset } from '../entities/asset.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { ChatMessage } from '../entities/chat/message.entity';
import { ChatThread } from '../entities/chat/thread.entity';
import { DocCategory } from '../entities/docs/category.entity';
import { DocDocument } from '../entities/docs/document.entity';
import { DocEmbeddingChunk } from '../entities/docs/embedding-chunk.entity';
import { DocRevision } from '../entities/docs/revision.entity';
import { SchemaChange } from '../entities/schema-change.entity';
import { ServiceKey } from '../entities/service-key.entity';
import { Service } from '../entities/service.entity';
import { Session } from '../entities/session.entity';
import { Setting } from '../entities/setting.entity';
import { User } from '../services/users/user.entity';

// Create TypeORM dataSource
export const dataSource = new TypeORM.DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/gateway',
  synchronize: process.env.NODE_ENV === 'test' || process.env.NODE_ENV !== 'production',
  dropSchema: false, // Let test-utils handle schema management
  cache: process.env.NODE_ENV !== 'test', // Disable caching in tests for speed
  logging: process.env.NODE_ENV === 'test' ? false : process.env.NODE_ENV === 'development' ? 'all' : ['error'],
  entities: [
    User,
    Session,
    Service,
    ServiceKey,
    Application,
    ApiKey,
    ApiKeyUsage,
    ApplicationUsage,
    AuditLog,
    ApplicationServiceRateLimit,
    Setting,
    SchemaChange,
    DocDocument,
    DocRevision,
    DocCategory,
    DocEmbeddingChunk,
    ChatThread,
    ChatMessage,
    Asset
  ],
  migrations: ['src/migrations/*.ts'],
  migrationsRun: process.env.NODE_ENV === 'production', // Auto-run migrations in production
  logger: 'advanced-console',
  // Optimizations for tests
  ...(process.env.NODE_ENV === 'test' && {
    extra: {
      max: 5, // Smaller connection pool for tests
      min: 1,
      idleTimeoutMillis: 1000, // Close idle connections faster
      connectionTimeoutMillis: 1000 // Faster connection timeout
    }
  })
});
