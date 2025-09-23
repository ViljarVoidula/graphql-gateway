// Ensure metadata is available for decorators before importing resolvers/entities
import { directiveTypeDefs } from '@graphql-authz/core';
import { authZDirective, authZGraphQLDirective } from '@graphql-authz/directive';
import { mergeResolvers, mergeTypeDefs } from '@graphql-tools/merge';
import { GraphQLSchema } from 'graphql';
import { createSchema } from 'graphql-yoga';
import 'reflect-metadata';
import { buildTypeDefsAndResolversSync } from 'type-graphql';
import { Container } from 'typedi';
import { SchemaLoader } from '../SchemaLoader';
import { authZRules } from '../auth/authz-rules';
import { dataSource } from '../db/datasource';
import { ApiKeyUsage } from '../entities/api-key-usage.entity';
import { ApiKey } from '../entities/api-key.entity';
import { ApplicationUsage } from '../entities/application-usage.entity';
import { Application } from '../entities/application.entity';
import { AuditLog } from '../entities/audit-log.entity';
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
import { DocsSearchResolver } from './search/search.resolver';
import { ThemeResolver } from './theme/theme.resolver';

const directive = authZGraphQLDirective(authZRules);
const authZDirectiveTypeDefs = directiveTypeDefs(directive);
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
  Container.set('SchemaChangeRepository', dataSource.getRepository(SchemaChange));
  Container.set('ApplicationUsageRepository', dataSource.getRepository(ApplicationUsage));
  Container.set('ApiKeyUsageRepository', dataSource.getRepository(ApiKeyUsage));

  const { resolvers: coreResolvers, typeDefs: coreTypefs } = buildTypeDefsAndResolversSync({
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
      AssetResolver
    ],
    container: Container,
    orphanedTypes: [Application, ApiKey, Session, AuditLog, ApplicationUsage, ApiKeyUsage]
  });

  let schema = authZDirectiveTransformer(
    createSchema({
      typeDefs: mergeTypeDefs([coreTypefs, authZDirectiveTypeDefs]),
      resolvers: mergeResolvers([coreResolvers])
    })
  );

  // Debug: log root fields to verify availability in stitched schema
  try {
    const queryFields = Object.keys(schema.getQueryType()?.getFields?.() || {});
    const mutationFields = Object.keys(schema.getMutationType()?.getFields?.() || {});
    log.debug('Core schema fields', {
      operation: 'makeEndpointsSchema',
      metadata: {
        query: queryFields,
        mutation: mutationFields
      }
    });
  } catch {}

  // Self-heal: if expected new fields (e.g., auditLogSummary) missing and cache disabled, rebuild once
  try {
    const qf = Object.keys(schema.getQueryType()?.getFields?.() || {});
    if (!qf.includes('auditLogSummary') && !disableCache) {
      log.warn('Expected auditLogSummary not found; forcing schema rebuild');
      schema = authZDirectiveTransformer(
        createSchema({
          typeDefs: mergeTypeDefs([coreTypefs, authZDirectiveTypeDefs]),
          resolvers: mergeResolvers([coreResolvers])
        })
      );
    }
  } catch {}

  if (!disableCache) schemaCache.set(loader, schema);
  return schema;
}
