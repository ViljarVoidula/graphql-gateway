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

// Legacy endpoint types for backward compatibility
const legacyTypeDefs = `
  type Endpoint {
    url: String!
    sdl: String
    hmacKey: ServiceKeyInfo
  }

  type ServiceKeyInfo {
    url: String!
    keyId: String!
    createdAt: String!
    expiresAt: String
    status: String!
  }

  type HMACKeyResult {
    keyId: String!
    secretKey: String!
    instructions: String!
  }

  type Query {
    endpoints: [Endpoint!]!
    serviceKeys(url: String): [ServiceKeyInfo!]!
    keyStats: KeyStats!
  }

  type KeyStats {
    totalKeys: Int!
    activeKeys: Int!
    revokedKeys: Int!
    services: Int!
  }

  type registerEndpointResult {
    endpoint: Endpoint
    hmacKey: HMACKeyResult
    success: Boolean!
  }

  type RemoveEndpointResult {
    success: Boolean!
  }

  type ReloadAllEndpointsResult {
    success: Boolean!
  }

  type RotateKeyResult {
    oldKeyId: String
    newKey: HMACKeyResult!
    success: Boolean!
  }

  type RevokeKeyResult {
    keyId: String!
    success: Boolean!
  }

  type Mutation {
    registerEndpoint(url: String!): registerEndpointResult!
    removeEndpoint(url: String!): RemoveEndpointResult!
    reloadAllEndpoints: ReloadAllEndpointsResult!
    rotateServiceKey(url: String!): RotateKeyResult!
    revokeServiceKey(keyId: String!): RevokeKeyResult!
    generateServiceKey(url: String!): HMACKeyResult!
  }
`;

// Legacy resolvers for backward compatibility
const legacyResolvers = {
  Endpoint: {
    hmacKey: (endpoint) => {
      const activeKey = keyManager.getActiveKey(endpoint.url);
      if (!activeKey) return null;
      
      return {
        url: endpoint.url,
        keyId: activeKey.keyId,
        createdAt: activeKey.createdAt.toISOString(),
        expiresAt: activeKey.expiresAt?.toISOString() || null,
        status: activeKey.status,
      };
    },
  },
  Query: {
    endpoints: () => [],  // Will be populated by schema loader
    serviceKeys: (_root, { url }) => {
      if (url) {
        return keyManager.getServiceKeys(url);
      }
      // Get all services and their keys
      const allServices = keyManager.getServices();
      return allServices.flatMap(serviceUrl => 
        keyManager.getServiceKeys(serviceUrl)
      );
    },
    keyStats: () => keyManager.getStats(),
  },
  Mutation: {
    registerEndpoint: (_root, { url }) => {
      // This is now deprecated, should use the new service registry
      console.warn('registerEndpoint is deprecated, use registerService instead');
      return { success: false };
    },
    removeEndpoint: (_root, { url }) => {
      // This is now deprecated, should use the new service registry
      console.warn('removeEndpoint is deprecated, use removeService instead');
      return { success: false };
    },
    reloadAllEndpoints: () => {
      // This is now deprecated, should use the new service registry
      console.warn('reloadAllEndpoints is deprecated');
      return { success: false };
    },
    rotateServiceKey: (_root, { url }) => {
      // This is now deprecated, should use the new service registry
      console.warn('rotateServiceKey is deprecated, use the new service registry');
      return { success: false };
    },
    revokeServiceKey: (_root, { keyId }) => {
      // This is now deprecated, should use the new service registry
      console.warn('revokeServiceKey is deprecated, use the new service registry');
      return { success: false };
    },
    generateServiceKey: (_root, { url }) => {
      // This is now deprecated, should use the new service registry
      console.warn('generateServiceKey is deprecated, use the new service registry');
      return { success: false };
    },
  },
};

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
      typeDefs: mergeTypeDefs([coreTypefs, legacyTypeDefs, authZDirectiveTypeDefs]),
      resolvers: mergeResolvers([
        coreResolvers,
        legacyResolvers
      ])
    })),
  };

  // Cache the schema for this loader
  schemaCache.set(loader, schema);
  return schema;
}
