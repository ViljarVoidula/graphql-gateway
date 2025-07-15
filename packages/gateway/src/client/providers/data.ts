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
            createdAt
            updatedAt
            owner {
              id
              email
            }
          }
        }
      `;
    }

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ query })
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    const data = result.data[resource] || result.data.myServices || result.data.sessions || [];

    return {
      data,
      total: data.length
    };
  },

  getOne: async ({ resource, id, meta }) => {
    let query = '';

    if (resource === 'users') {
      query = `
        query GetUser($id: String!) {
          user(id: $id) {
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
            createdAt
            updatedAt
            owner {
              id
              email
            }
          }
        }
      `;
    }

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        query,
        variables: { id }
      })
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    const data = result.data.user || result.data.service;

    return {
      data
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
    }

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        query: mutation,
        variables: resource === 'services' ? { input: variables } : { data: variables }
      })
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    const data = resource === 'services' ? result.data.registerService.service : result.data.createUser;

    return {
      data
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

    const response = await authenticatedFetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        query: mutation,
        variables: resource === 'services' ? { id, input: variables } : { id, data: variables }
      })
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    // For services, re-fetch the updated service; for users, return the updated user
    if (resource === 'services') {
      const getResult = await dataProvider.getOne({ resource, id });
      return {
        data: getResult.data as any
      };
    } else {
      return {
        data: result.data.updateUser as any
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
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        query: mutation,
        variables: { id }
      })
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return {
      data: { id } as any
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

  custom: async ({ url, method, filters, sorters, payload, query, headers, meta }) => {
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
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          query: mutation,
          variables: { serviceId: (payload as any)?.serviceId }
        })
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return {
        data: result.data.rotateServiceKey
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
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          query: queryString,
          variables: { serviceId: (payload as any)?.serviceId }
        })
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return {
        data: result.data.serviceKeys
      };
    }

    throw new Error('Custom operation not implemented');
  }
};
