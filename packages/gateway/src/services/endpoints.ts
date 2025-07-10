import { createSchema } from 'graphql-yoga';
import { SchemaLoader } from '../SchemaLoader';
import { authZRules } from '../rules/setupAuthZPlugin';
import { authZDirective, authZGraphQLDirective } from '@graphql-authz/directive';
import { directiveTypeDefs } from '@graphql-authz/core';
import { keyManager } from '../security/keyManager';
import { generateServiceKey } from '../utils/hmacExecutor';
import { mergeTypeDefs } from '@graphql-tools/merge';
const directive = authZGraphQLDirective(authZRules);
const authZDirectiveTypeDefs = directiveTypeDefs(directive);
const { authZDirectiveTransformer } = authZDirective();

const typeDefs = /* GraphQL */ `
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



export function makeEndpointsSchema(loader: SchemaLoader) {
  return {
    schema: authZDirectiveTransformer(createSchema({
      typeDefs: mergeTypeDefs([typeDefs, authZDirectiveTypeDefs]),
      resolvers: {
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
      
    })),
  }
}
