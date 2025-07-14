import { AuthProvider } from '@refinedev/core';

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            mutation Login($email: String!, $password: String!) {
              login(data: { email: $email, password: $password }) {
                user {
                  id
                  email
                  permissions
                }
                tokens {
                  accessToken
                  refreshToken
                }
                sessionId
              }
            }
          `,
          variables: { email, password },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        return {
          success: false,
          error: {
            message: result.errors[0]?.message || 'Login failed',
            name: 'Login Error',
          },
        };
      }

      const { login: loginData } = result.data;

      if (loginData.user && loginData.tokens) {
        // Store tokens in localStorage
        localStorage.setItem('accessToken', loginData.tokens.accessToken);
        localStorage.setItem('refreshToken', loginData.tokens.refreshToken);
        localStorage.setItem('user', JSON.stringify(loginData.user));
        
        return {
          success: true,
          redirectTo: '/',
        };
      }

      return {
        success: false,
        error: {
          message: 'Login failed',
          name: 'Login Error',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Login failed',
          name: 'Login Error',
        },
      };
    }
  },

  logout: async () => {
    try {
      await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            mutation Logout {
              logout
            }
          `,
        }),
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    return {
      success: true,
      redirectTo: '/login',
    };
  },

  check: async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      return {
        authenticated: false,
        redirectTo: '/login',
      };
    }

    try {
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            query Me {
              me {
                id
                email
                permissions
              }
            }
          `,
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return {
        authenticated: true,
      };
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');

      return {
        authenticated: false,
        redirectTo: '/login',
      };
    }
  },

  getPermissions: async () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;

    const user = JSON.parse(userStr);
    return user.permissions;
  },

  getIdentity: async () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;

    return JSON.parse(userStr);
  },

  onError: async (error) => {
    if (error.statusCode === 401) {
      return {
        logout: true,
        redirectTo: '/login',
      };
    }

    return { error };
  },
};
