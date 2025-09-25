// Ensure metadata is available for decorators before importing resolvers/entities
import {
  authZDirective,
  authZGraphQLDirective,
} from '@graphql-authz/directive';
import { GraphQLSchema } from 'graphql';
import 'reflect-metadata';
import { buildSchemaSync } from 'type-graphql';
import { Container } from 'typedi';
import { SchemaLoader } from '../SchemaLoader';
import { authZRules } from '../auth/authz-rules';
import { dataSource } from '../db/datasource';
import { ApiKeyUsage } from '../entities/api-key-usage.entity';
import { ApiKey } from '../entities/api-key.entity';
import { ApplicationUsage } from '../entities/application-usage.entity';
import { Application } from '../entities/application.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { RequestLatency } from '../entities/request-latency.entity';
import { SchemaChange } from '../entities/schema-change.entity';
import { ServiceKey } from '../entities/service-key.entity';
import { Service } from '../entities/service.entity';
import { Session } from '../entities/session.entity';
import { log } from '../utils/logger';
import { ApiKeyResolver } from './api-keys/api-key.resolver';
import { ApplicationResolver } from './applications/application.resolver';
import { AuditLogResolver } from './audit/audit-log.resolver';
import { ComplianceUsageResolver } from './compliance/compliance-usage.resolver';
import { ConfigurationResolver } from './config/configuration.resolver';
import { HealthResolver } from './health/health.resolver';
import { SchemaChangeResolver } from './schema-changes/schema-change.resolver';
import { ServiceRegistryResolver } from './service-registry/service-registry.resolver';
import { ApiKeyUsageResolver } from './usage/api-key-usage.resolver';
import { ApplicationUsageResolver } from './usage/application-usage.resolver';
import { UsageDashboardResolver } from './usage/usage-dashboard.resolver';
import { User } from './users/user.entity';
import { UserResolver } from './users/user.resolver';
// Additional resolvers (docs, theme, search, chat) to expose new admin features in primary schema
import { AIResolver } from './ai/ai.resolver';
import { AssetResolver } from './assets/asset.resolver';
import { ChatResolver } from './chat/chat.resolver';
import { DocsAuthoringResolver } from './docs/docs.resolver';
import { LatencyHealthResolver } from './latency/latency-health.resolver';
import { RequestLatencyResolver } from './latency/request-latency.resolver';
import { DocsSearchResolver } from './search/search.resolver';
import { GatewayMessageChannelResolver } from './subscriptions/gateway-message-channel.resolver';
import { PublishToGatewayChannelResolver } from './subscriptions/publish-to-gateway.resolver';
import { ThemeResolver } from './theme/theme.resolver';

const directive = authZGraphQLDirective(authZRules);
const { authZDirectiveTransformer } = authZDirective();

// Memoization cache for schema creation
const schemaCache: WeakMap<object, GraphQLSchema> = new WeakMap();

export function makeEndpointsSchema(loader: SchemaLoader): GraphQLSchema {
  const disableCache = process.env.NODE_ENV !== 'production';
  if (!disableCache && schemaCache.has(loader)) {
    return schemaCache.get(loader)!;
  }

  // Set up dependency injection
  Container.set('UserRepository', dataSource.getRepository(User));
  Container.set('SessionRepository', dataSource.getRepository(Session));
  Container.set('ApplicationRepository', dataSource.getRepository(Application));
  Container.set('ServiceRepository', dataSource.getRepository(Service));
  Container.set('ServiceKeyRepository', dataSource.getRepository(ServiceKey));
  Container.set('AuditLogRepository', dataSource.getRepository(AuditLog));
  Container.set(
    'SchemaChangeRepository',
    dataSource.getRepository(SchemaChange)
  );
  Container.set(
    'ApplicationUsageRepository',
    dataSource.getRepository(ApplicationUsage)
  );
  Container.set('ApiKeyUsageRepository', dataSource.getRepository(ApiKeyUsage));
  Container.set(
    'RequestLatencyRepository',
    dataSource.getRepository(RequestLatency)
  );

  // Register PubSub if available in context - this will be set by gateway
  // Note: The actual pubSub instance will be injected from gateway context

  const schema = buildSchemaSync({
    resolvers: [
      UserResolver,
      ApplicationResolver,
      ServiceRegistryResolver,
      ApiKeyResolver,
      AuditLogResolver,
      ApplicationUsageResolver,
      ApiKeyUsageResolver,
      UsageDashboardResolver,
      SchemaChangeResolver,
      ConfigurationResolver,
      HealthResolver,
      ComplianceUsageResolver,
      DocsAuthoringResolver,
      ThemeResolver,
      DocsSearchResolver,
      AIResolver,
      ChatResolver,
      AssetResolver,
      LatencyHealthResolver,
      RequestLatencyResolver,
      GatewayMessageChannelResolver,
      PublishToGatewayChannelResolver,
    ],
    container: Container,
    orphanedTypes: [
      Application,
      ApiKey,
      Session,
      AuditLog,
      ApplicationUsage,
      ApiKeyUsage,
      RequestLatency,
    ],
    pubSub: Container.get('PubSub'),
  });

  const transformedSchema = authZDirectiveTransformer(schema);

  // Debug: log root fields to verify availability in stitched schema
  try {
    const queryFields = Object.keys(
      transformedSchema.getQueryType()?.getFields?.() || {}
    );
    const mutationFields = Object.keys(
      transformedSchema.getMutationType()?.getFields?.() || {}
    );
    const subscriptionFields = Object.keys(
      transformedSchema.getSubscriptionType()?.getFields?.() || {}
    );
    log.debug('Core schema fields', {
      operation: 'makeEndpointsSchema',
      metadata: {
        query: queryFields,
        mutation: mutationFields,
        subscription: subscriptionFields,
      },
    });
  } catch {}

  if (!disableCache) schemaCache.set(loader, transformedSchema);
  return transformedSchema;
}
