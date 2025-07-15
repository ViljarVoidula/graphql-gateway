import { AuthProvider } from '@refinedev/core';
import { authenticatedFetch, clearAuthData, setAutoRefreshEnabled } from '../utils/auth';

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const response = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
                  expiresIn
                  tokenType
                }
                sessionId
              }
            }
          `,
          variables: { email, password }
        })
      });

      const result = await response.json();

      if (result.errors) {
        return {
          success: false,
          error: {
            message: result.errors[0]?.message || 'Login failed',
            name: 'Login Error'
          }
        };
      }

      const { login: loginData } = result.data;

      if (loginData.user && loginData.tokens) {
        // Store tokens in localStorage
        localStorage.setItem('accessToken', loginData.tokens.accessToken);
        localStorage.setItem('refreshToken', loginData.tokens.refreshToken);
        localStorage.setItem('user', JSON.stringify(loginData.user));

        // Calculate and store token expiry time
        const expiryTime = Date.now() + loginData.tokens.expiresIn * 1000;
        localStorage.setItem('tokenExpiry', expiryTime.toString());

        // Enable auto-refresh by default for new sessions
        setAutoRefreshEnabled(true);

        return {
          success: true,
          redirectTo: '/'
        };
      }

      return {
        success: false,
        error: {
          message: 'Login failed',
          name: 'Login Error'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Login failed',
          name: 'Login Error'
        }
      };
    }
  },

  logout: async () => {
    try {
      await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            mutation Logout {
              logout
            }
          `
        })
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    clearAuthData();

    return {
      success: true,
      redirectTo: '/login'
    };
  },

  check: async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      return {
        authenticated: false,
        redirectTo: '/login'
      };
    }

    try {
      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
          `
        })
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      return {
        authenticated: true
      };
    } catch (error) {
      clearAuthData();

      return {
        authenticated: false,
        redirectTo: '/login'
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
        redirectTo: '/login'
      };
    }

    return { error };
  }
};
