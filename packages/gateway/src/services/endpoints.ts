import { createSchema } from 'graphql-yoga';
import { SchemaLoader } from '../SchemaLoader';
import { authZRules } from '../auth/authz-rules';
import { authZDirective, authZGraphQLDirective } from '@graphql-authz/directive';
import { directiveTypeDefs } from '@graphql-authz/core';
import { keyManager } from '../security/keyManager';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { buildTypeDefsAndResolversSync } from "type-graphql";
import { UserResolver } from './users/user.resolver';
import { ServiceRegistryResolver } from './service-registry/service-registry.resolver';
import { Container } from "typedi";
import { dataSource } from "../db/datasource";
import { User } from "./users/user.entity";
import { Session } from "../entities/session.entity";
import { Service } from "../entities/service.entity";
import { ServiceKey } from "../entities/service-key.entity";

const directive = authZGraphQLDirective(authZRules);
const authZDirectiveTypeDefs = directiveTypeDefs(directive);
const { authZDirectiveTransformer } = authZDirective();

// Memoization cache for schema creation
const schemaCache = new WeakMap();

export function makeEndpointsSchema(loader: SchemaLoader) {
  // Check if we already have a cached schema for this loader
  if (schemaCache.has(loader)) {
    return schemaCache.get(loader);
  }

  // Set up dependency injection
  Container.set("UserRepository", dataSource.getRepository(User));
  Container.set("SessionRepository", dataSource.getRepository(Session));
  Container.set("ServiceRepository", dataSource.getRepository(Service));
  Container.set("ServiceKeyRepository", dataSource.getRepository(ServiceKey));

  const {resolvers: coreResolvers, typeDefs: coreTypefs} = buildTypeDefsAndResolversSync({
    resolvers: [UserResolver, ServiceRegistryResolver],
    container: Container,
   })
  
  const schema = {
    schema: authZDirectiveTransformer(createSchema({
      typeDefs: mergeTypeDefs([coreTypefs, authZDirectiveTypeDefs]),
      resolvers: mergeResolvers([
        coreResolvers,
      ])
    })),
  };

  // Cache the schema for this loader
  schemaCache.set(loader, schema);
  return schema;
}
