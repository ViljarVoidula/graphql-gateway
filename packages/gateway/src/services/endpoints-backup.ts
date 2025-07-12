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
const legacyTypeDefs = /* GraphQL */ `
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
        return keyManager.getServiceKeys(url).map(key => ({
          url,
          keyId: key.keyId,
          createdAt: key.createdAt.toISOString(),
          expiresAt: key.expiresAt?.toISOString() || null,
          status: key.status,
        }));
      }
      return keyManager.getAllKeys().map(key => ({
        url: key.url,
        keyId: key.keyId,
        createdAt: key.createdAt.toISOString(),
        expiresAt: key.expiresAt?.toISOString() || null,
        status: key.status,
      }));
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





export function makeEndpointsSchema(loader: SchemaLoader) {
  // Check if we already have a cached schema for this loader
  if (schemaCache.has(loader)) {
    return schemaCache.get(loader);
  }

  // Set up dependency injection
  Container.set("UserRepository", dataSource.getRepository(User));
  Container.set("SessionRepository", dataSource.getRepository(Session));

  const {resolvers: coreResolvers, typeDefs: coreTypefs} = buildTypeDefsAndResolversSync({
    resolvers: [UserResolver],
    container: Container,
   })
  
  const schema = {
    schema: authZDirectiveTransformer(createSchema({
      typeDefs: mergeTypeDefs([coreTypefs, typeDefs, authZDirectiveTypeDefs]),
      resolvers: mergeResolvers([
          coreResolvers,
        {
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
          endpoints: () => loader.loadedEndpoints,
          serviceKeys: (_root, { url }) => {
            if (url) {
              return keyManager.getServiceKeys(url);
            }
            // Return all service keys
            const services = keyManager.getServices();
            return services.flatMap(serviceUrl => keyManager.getServiceKeys(serviceUrl));
          },
          keyStats: () => keyManager.getStats(),
        },
        Mutation: {
          async registerEndpoint(_root, { url }) {
            let success = false;
            let hmacKey = null;
            
            if (!loader.endpoints.includes(url)) {
              loader.endpoints.push(url);
              
              // Generate HMAC key for new service
              hmacKey = generateServiceKey(url);
              
              await loader.reload();
              success = true;
            } else {
              // Service already exists, get existing key or generate new one
              const existingKey = keyManager.getActiveKey(url);
              if (existingKey) {
                hmacKey = {
                  keyId: existingKey.keyId,
                  secretKey: existingKey.secretKey,
                  instructions: `Service already registered. Using existing key: ${existingKey.keyId}`,
                };
              } else {
                hmacKey = generateServiceKey(url);
              }
            }
            
            return {
              endpoint: loader.loadedEndpoints.find(s => s.url === url),
              hmacKey,
              success,
            };
          },
          async removeEndpoint(_root, { url }) {
            let success = false;
            const index = loader.endpoints.indexOf(url);
            if (index > -1) {
              loader.endpoints.splice(index, 1);
              
              // Remove all keys for this service
              keyManager.removeService(url);
              
              await loader.reload();
              success = true;
            }
            return { success };
          },
          async reloadAllEndpoints() {
            await loader.reload();
            return { success: true };
          },
          async rotateServiceKey(_root, { url }) {
            const oldKey = keyManager.getActiveKey(url);
            const newKey = keyManager.rotateKey(url);
            
            return {
              oldKeyId: oldKey?.keyId || null,
              newKey: {
                keyId: newKey.keyId,
                secretKey: newKey.secretKey,
                instructions: `Key rotated for service: ${url}. Old key will expire in 1 hour.`,
              },
              success: true,
            };
          },
          async revokeServiceKey(_root, { keyId }) {
            const success = keyManager.revokeKey(keyId);
            return { keyId, success };
          },
          async generateServiceKey(_root, { url }) {
            return generateServiceKey(url);
          },
        },
      },
    ])
      
    })),
  };

  // Cache the schema for this loader
  schemaCache.set(loader, schema);
  return schema;
}
