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
import { ApiKey } from '../entities/api-key.entity';
import { Application } from '../entities/application.entity';
import { ServiceKey } from '../entities/service-key.entity';
import { Service } from '../entities/service.entity';
import { Session } from '../entities/session.entity';
import { log } from '../utils/logger';
import { ApiKeyResolver } from './api-keys/api-key.resolver';
import { ApplicationResolver } from './applications/application.resolver';
import { ServiceRegistryResolver } from './service-registry/service-registry.resolver';
import { User } from './users/user.entity';
import { UserResolver } from './users/user.resolver';

const directive = authZGraphQLDirective(authZRules);
const authZDirectiveTypeDefs = directiveTypeDefs(directive);
const { authZDirectiveTransformer } = authZDirective();

// Memoization cache for schema creation
const schemaCache: WeakMap<object, GraphQLSchema> = new WeakMap();

export function makeEndpointsSchema(loader: SchemaLoader): GraphQLSchema {
  // Clear cache to ensure fresh schema generation (temporary for debugging)
  schemaCache.delete(loader);

  // Check if we already have a cached schema for this loader
  if (schemaCache.has(loader)) {
    return schemaCache.get(loader);
  }

  // Set up dependency injection
  Container.set('UserRepository', dataSource.getRepository(User));
  Container.set('SessionRepository', dataSource.getRepository(Session));
  Container.set('ApplicationRepository', dataSource.getRepository(Application));
  Container.set('ServiceRepository', dataSource.getRepository(Service));
  Container.set('ServiceKeyRepository', dataSource.getRepository(ServiceKey));

  const { resolvers: coreResolvers, typeDefs: coreTypefs } = buildTypeDefsAndResolversSync({
    resolvers: [UserResolver, ApplicationResolver, ServiceRegistryResolver, ApiKeyResolver],
    container: Container,
    orphanedTypes: [Application, ApiKey, Session]
  });

  const schema = authZDirectiveTransformer(
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

  // Cache the schema for this loader
  schemaCache.set(loader, schema);
  return schema;
}
