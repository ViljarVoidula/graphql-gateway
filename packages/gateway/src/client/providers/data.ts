import { DataProvider } from '@refinedev/core';
import { authenticatedFetch } from '../utils/auth';

const API_URL = '/graphql';

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,

  getList: async ({ resource, pagination, filters, sorters, meta }) => {
    let query = '';

    if (resource === 'users') {
      query = `
        query GetUsers {
          users {
            id
            email
            permissions
            isEmailVerified
            createdAt
            failedLoginAttempts
            lockedUntil
            sessions {
              id
              userId
              isActive
              expiresAt
              createdAt
              ipAddress
              userAgent
              lastActivity
            }
          }
        }
      `;
    } else if (resource === 'services') {
      query = `
        query GetServices {
          myServices {
            id
            name
            status
            url
            description
            version
            enableHMAC
            timeout
            enableBatching
            useMsgPack
            externally_accessible
            createdAt
            updatedAt
            owner {
              id
              email
            }
          }
        }
      `;
    } else if (resource === 'applications') {
      query = `#graphql
        query MyApplications {
          myApplications {
            id
            name
            description
            owner { id email }
            createdAt
            updatedAt
            rateLimitPerMinute
            rateLimitPerDay
            rateLimitDisabled
            apiKeys { id keyPrefix status name scopes createdAt expiresAt }
            whitelistedServices { id name status }
          }
        }
      `;
    }

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ query }),
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    const data =
      result.data[resource] ||
      result.data.myServices ||
      result.data.myApplications ||
      result.data.sessions ||
      [];

    return {
      data,
      total: data.length,
    };
  },

  getOne: async ({ resource, id, meta }) => {
    let query = '';

    if (resource === 'users') {
      query = `
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            email
            permissions
            isEmailVerified
            createdAt
            updatedAt
            lastLoginAt
            failedLoginAttempts
            lockedUntil
            sessions {
              id
              isActive
              ipAddress
              userAgent
              createdAt
              lastActivity
              expiresAt
            }
            ownedServices {
              id
              name
              status
              url
              updatedAt
            }
          }
          applicationsByUser(userId: $id) {
            id
            name
            description
            createdAt
            updatedAt
            rateLimitPerMinute
            rateLimitPerDay
            rateLimitDisabled
          }
        }
      `;
    } else if (resource === 'services') {
      query = `
        query GetService($id: ID!) {
          service(id: $id) {
            id
            name
            status
            url
            description
            version
            enableHMAC
            timeout
            enableBatching
            useMsgPack
            externally_accessible
            createdAt
            updatedAt
            owner {
              id
              email
            }
          }
        }
      `;
    } else if (resource === 'applications') {
      // No single application query, fetch current user's applications and pick one
      query = `
        query MyApplications {
          myApplications {
            id
            name
            description
            owner { id email }
            createdAt
            updatedAt
            rateLimitPerMinute
            rateLimitPerDay
            rateLimitDisabled
            apiKeys { id keyPrefix status name scopes createdAt expiresAt }
            whitelistedServices { id name status }
          }
        }
      `;
    }

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(
        resource === 'applications'
          ? { query }
          : {
              query,
              variables: { id },
            }
      ),
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    if (resource === 'users') {
      const user = result.data.user;
      if (!user) {
        return { data: null };
      }
      const applications = result.data.applicationsByUser || [];
      return {
        data: {
          ...user,
          applications,
        },
      };
    }

    let data = result.data.service;
    if (resource === 'applications') {
      const apps = result.data.myApplications || [];
      data = apps.find((a: any) => a.id === id);
    }

    return {
      data,
    };
  },

  create: async ({ resource, variables, meta }) => {
    let mutation = '';

    if (resource === 'services') {
      mutation = `
        mutation RegisterService($input: RegisterServiceInput!) {
          registerService(input: $input) {
            service {
              id
              name
              url
              description
              status
              version
              enableHMAC
              timeout
              enableBatching
              useMsgPack
              externally_accessible
              createdAt
              updatedAt
              owner {
                id
                email
              }
            }
            hmacKey {
              keyId
              secretKey
              instructions
            }
            success
          }
        }
      `;
    } else if (resource === 'users') {
      mutation = `
        mutation CreateUser($data: UserInput!) {
          createUser(data: $data) {
            id
            email
            permissions
            isEmailVerified
            createdAt
            failedLoginAttempts
            lockedUntil
          }
        }
      `;
    } else if (resource === 'applications') {
      mutation = `
        mutation CreateApplication($name: String!, $description: String) {
          createApplication(name: $name, description: $description) {
            id
            name
            description
            createdAt
            updatedAt
          }
        }
      `;
    }

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: mutation,
        variables:
          resource === 'services'
            ? { input: variables }
            : resource === 'users'
              ? { data: variables }
              : resource === 'applications'
                ? {
                    name: (variables as any).name,
                    description: (variables as any).description,
                  }
                : {},
      }),
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    let data;
    if (resource === 'services') data = result.data.registerService.service;
    else if (resource === 'users') data = result.data.createUser;
    else if (resource === 'applications') data = result.data.createApplication;

    return {
      data,
    };
  },

  update: async ({ resource, id, variables, meta }) => {
    let mutation = '';

    if (resource === 'services') {
      mutation = `
        mutation UpdateService($id: ID!, $input: UpdateServiceInput!) {
          updateService(id: $id, input: $input)
        }
      `;
    } else if (resource === 'users') {
      mutation = `
        mutation UpdateUser($id: String!, $data: UserUpdateInput!) {
          updateUser(id: $id, data: $data) {
            id
            email
            permissions
            isEmailVerified
            createdAt
            updatedAt
            failedLoginAttempts
            lockedUntil
          }
        }
      `;
    }

    // For services, normalize enum fields expected by GraphQL
    const inputVariables =
      resource === 'services'
        ? (() => {
            const v: any = { ...(variables as any) };
            if (v.status) {
              v.status = String(v.status).toUpperCase();
            }
            return v;
          })()
        : variables;

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: mutation,
        variables:
          resource === 'services'
            ? { id, input: inputVariables }
            : { id, data: variables },
      }),
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    // For services, re-fetch the updated service; for users, return the updated user
    if (resource === 'services') {
      const getResult = await dataProvider.getOne({ resource, id });
      return {
        data: getResult.data as any,
      };
    } else {
      return {
        data: result.data.updateUser as any,
      };
    }
  },

  deleteOne: async ({ resource, id, variables, meta }) => {
    let mutation = '';

    if (resource === 'services') {
      mutation = `
        mutation RemoveService($id: ID!) {
          removeService(id: $id)
        }
      `;
    } else if (resource === 'users') {
      mutation = `
        mutation DeleteUser($id: String!) {
          deleteUser(id: $id)
        }
      `;
    }

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        query: mutation,
        variables: { id },
      }),
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return {
      data: { id } as any,
    };
  },

  getMany: async ({ resource, ids, meta }) => {
    throw new Error('GetMany operation not implemented');
  },

  createMany: async ({ resource, variables, meta }) => {
    throw new Error('CreateMany operation not implemented');
  },

  deleteMany: async ({ resource, ids, meta }) => {
    throw new Error('DeleteMany operation not implemented');
  },

  updateMany: async ({ resource, ids, variables, meta }) => {
    throw new Error('UpdateMany operation not implemented');
  },

  custom: async ({
    url,
    method,
    filters,
    sorters,
    payload,
    query,
    headers,
    meta,
  }) => {
    if (meta?.operation === 'createApplicationApiKey') {
      const mutation = `
        mutation CreateAppKey($applicationId: ID!, $name: String!, $scopes: [String!], $expiresAt: DateTimeISO)
        { createApiKey(applicationId: $applicationId, name: $name, scopes: $scopes, expiresAt: $expiresAt) }
      `;

      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: mutation,
          variables: payload,
        }),
      });

      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      // Returns plaintext API key once
      return { data: { apiKey: result.data.createApiKey } };
    }

    if (meta?.operation === 'revokeApplicationApiKey') {
      const mutation = `
        mutation RevokeKey($apiKeyId: ID!){ revokeApiKey(apiKeyId: $apiKeyId) }
      `;
      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: mutation, variables: payload }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      return { data: { success: result.data.revokeApiKey } };
    }

    if (meta?.operation === 'externallyAccessibleServices') {
      const queryString = `
        query { externallyAccessibleServices { id name status } }
      `;
      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: queryString }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      return { data: result.data.externallyAccessibleServices };
    }

    if (meta?.operation === 'addServiceToApplication') {
      const mutation = `
        mutation AddService($applicationId: ID!, $serviceId: ID!){ addServiceToApplication(applicationId: $applicationId, serviceId: $serviceId) }
      `;
      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: mutation, variables: payload }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      return { data: { success: result.data.addServiceToApplication } };
    }

    if (meta?.operation === 'removeServiceFromApplication') {
      const mutation = `
        mutation RemoveService($applicationId: ID!, $serviceId: ID!){ removeServiceFromApplication(applicationId: $applicationId, serviceId: $serviceId) }
      `;
      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: mutation, variables: payload }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      return { data: { success: result.data.removeServiceFromApplication } };
    }
    if (meta?.operation === 'rotateServiceKey') {
      const mutation = `
        mutation RotateServiceKey($serviceId: ID!) {
          rotateServiceKey(serviceId: $serviceId) {
            oldKeyId
            newKey {
              keyId
              secretKey
              instructions
            }
            success
          }
        }
      `;

      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          query: mutation,
          variables: { serviceId: (payload as any)?.serviceId },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return {
        data: result.data.rotateServiceKey,
      };
    }

    if (meta?.operation === 'getServiceKeys') {
      const queryString = `
        query GetServiceKeys($serviceId: ID!) {
          serviceKeys(serviceId: $serviceId) {
            id
            keyId
            status
            createdAt
            expiresAt
          }
        }
      `;

      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          query: queryString,
          variables: { serviceId: (payload as any)?.serviceId },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return {
        data: result.data.serviceKeys,
      };
    }

    if (meta?.operation === 'setServiceExternallyAccessible') {
      const mutation = `
        mutation SetServiceExternallyAccessible($serviceId: ID!, $externally_accessible: Boolean!) {
          setServiceExternallyAccessible(serviceId: $serviceId, externally_accessible: $externally_accessible)
        }
      `;
      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: mutation, variables: payload }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      return { data: { success: result.data.setServiceExternallyAccessible } };
    }

    if (meta?.operation === 'updateApplicationRateLimits') {
      const mutation = `
        mutation UpdateApplicationRateLimits($applicationId: ID!, $perMinute: Int, $perDay: Int, $disabled: Boolean) {
          updateApplicationRateLimits(
            applicationId: $applicationId
            perMinute: $perMinute
            perDay: $perDay
            disabled: $disabled
          ) {
            id
            name
            rateLimitPerMinute
            rateLimitPerDay
            rateLimitDisabled
          }
        }
      `;
      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: mutation, variables: payload }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      return { data: result.data.updateApplicationRateLimits };
    }

    if (meta?.operation === 'applicationAuditLogs') {
      const query = `
        query ApplicationAuditLogs($applicationId: ID!, $limit: Int) {
          applicationAuditLogs(applicationId: $applicationId, limit: $limit) {
            id
            eventType
            metadata
            createdAt
            user {
              id
              email
            }
          }
        }
      `;
      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, variables: payload }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      return { data: result.data.applicationAuditLogs };
    }

    if (meta?.operation === 'applicationUsage') {
      const query = `
        query ApplicationUsage($applicationId: ID!, $limit: Int) {
          applicationUsage(applicationId: $applicationId, limit: $limit) {
            id
            date
            requestCount
            errorCount
            rateLimitExceededCount
            service {
              id
              name
            }
          }
        }
      `;
      const response = await authenticatedFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, variables: payload }),
      });
      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0].message);
      return { data: result.data.applicationUsage };
    }

    throw new Error('Custom operation not implemented');
  },
};
