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
            createdAt
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
            createdAt
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
    throw new Error('Create operation not implemented');
  },

  update: async ({ resource, id, variables, meta }) => {
    throw new Error('Update operation not implemented');
  },

  deleteOne: async ({ resource, id, variables, meta }) => {
    throw new Error('Delete operation not implemented');
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
    throw new Error('Custom operation not implemented');
  }
};
