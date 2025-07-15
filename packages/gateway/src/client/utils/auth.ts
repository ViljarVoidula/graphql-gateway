// Shared authentication utilities for token management and refresh

interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string;
}

// Token refresh utility
export const refreshAuthToken = async (): Promise<TokenRefreshResult | null> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    return null;
  }

  // Dispatch refreshing event
  window.dispatchEvent(
    new CustomEvent('tokenRefresh', {
      detail: { status: 'refreshing' }
    })
  );

  try {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        query: `
          mutation RefreshToken($refreshToken: String!) {
            refreshToken(data: { refreshToken: $refreshToken }) {
              tokens {
                accessToken
                refreshToken
                expiresIn
                tokenType
              }
              user {
                id
                email
                permissions
              }
            }
          }
        `,
        variables: { refreshToken }
      })
    });

    const result = await response.json();

    if (result.errors) {
      console.error('Token refresh failed:', result.errors[0]?.message);

      // Dispatch error event
      window.dispatchEvent(
        new CustomEvent('tokenRefresh', {
          detail: { status: 'error' }
        })
      );

      return null;
    }

    const { refreshToken: refreshData } = result.data;
    if (refreshData?.tokens) {
      // Update stored tokens
      localStorage.setItem('accessToken', refreshData.tokens.accessToken);
      localStorage.setItem('refreshToken', refreshData.tokens.refreshToken);
      localStorage.setItem('user', JSON.stringify(refreshData.user));

      // Calculate and store token expiry time
      const expiryTime = Date.now() + refreshData.tokens.expiresIn * 1000;
      localStorage.setItem('tokenExpiry', expiryTime.toString());

      // Dispatch success event
      window.dispatchEvent(
        new CustomEvent('tokenRefresh', {
          detail: { status: 'success' }
        })
      );

      return {
        accessToken: refreshData.tokens.accessToken,
        refreshToken: refreshData.tokens.refreshToken
      };
    }

    // Dispatch error event
    window.dispatchEvent(
      new CustomEvent('tokenRefresh', {
        detail: { status: 'error' }
      })
    );

    return null;
  } catch (error) {
    console.error('Token refresh error:', error);

    // Dispatch error event
    window.dispatchEvent(
      new CustomEvent('tokenRefresh', {
        detail: { status: 'error' }
      })
    );

    return null;
  }
};

// Check if token needs refresh (refresh 2 minutes before expiry)
export const shouldRefreshToken = (): boolean => {
  const tokenExpiry = localStorage.getItem('tokenExpiry');
  if (!tokenExpiry) {
    return true; // If no expiry stored, assume we should refresh
  }

  const expiryTime = parseInt(tokenExpiry);
  const now = Date.now();
  const bufferTime = 2 * 60 * 1000; // 2 minutes buffer

  return expiryTime - now <= bufferTime;
};

// Clear all authentication data
export const clearAuthData = (): void => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('tokenExpiry');
};

// Enhanced fetch function with automatic token refresh
export const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  let token = localStorage.getItem('accessToken');

  // Check if token needs refresh before making the request
  if (shouldRefreshToken()) {
    const refreshResult = await refreshAuthToken();
    if (refreshResult) {
      token = refreshResult.accessToken;
    } else {
      // Refresh failed, remove invalid tokens
      clearAuthData();
      throw new Error('Authentication required');
    }
  }

  // Add authorization header if token exists
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  // If we get a 401, try to refresh the token once more
  if (response.status === 401) {
    const refreshResult = await refreshAuthToken();
    if (refreshResult) {
      const retryHeaders = {
        ...options.headers,
        Authorization: `Bearer ${refreshResult.accessToken}`
      };

      return fetch(url, {
        ...options,
        headers: retryHeaders
      });
    } else {
      // Refresh failed, clear tokens
      clearAuthData();
    }
  }

  return response;
};

//  Setup automatic token refresh timer
export const setupTokenRefreshTimer = (): (() => void) => {
  const checkTokenAndRefresh = async () => {
    // Only auto-refresh if user has opted in (default is true)
    const autoRefreshEnabled = localStorage.getItem('autoRefreshEnabled');
    const shouldAutoRefresh = autoRefreshEnabled === null || autoRefreshEnabled === 'true';

    if (shouldAutoRefresh && shouldRefreshToken()) {
      await refreshAuthToken();
    }
  };

  // Check every minute
  const intervalId = setInterval(checkTokenAndRefresh, 60 * 1000);

  // Return cleanup function
  return () => clearInterval(intervalId);
};

// Enable/disable auto-refresh (default is enabled)
export const setAutoRefreshEnabled = (enabled: boolean): void => {
  localStorage.setItem('autoRefreshEnabled', enabled.toString());
};

// Check if auto-refresh is enabled (default is true for new users)
export const isAutoRefreshEnabled = (): boolean => {
  const autoRefreshEnabled = localStorage.getItem('autoRefreshEnabled');
  // If no preference is set, default to true (opt-in by default)
  return autoRefreshEnabled === null || autoRefreshEnabled === 'true';
};

// Initialize auto-refresh for new users
export const initializeAutoRefresh = (): void => {
  const autoRefreshEnabled = localStorage.getItem('autoRefreshEnabled');
  if (autoRefreshEnabled === null) {
    // First time user - enable auto-refresh by default
    setAutoRefreshEnabled(true);
  }
};

// Get time until token expires (in minutes)
export const getTokenTimeToExpiry = (): number | null => {
  const tokenExpiry = localStorage.getItem('tokenExpiry');
  if (!tokenExpiry) {
    return null;
  }

  const expiryTime = parseInt(tokenExpiry);
  const now = Date.now();
  const timeLeft = expiryTime - now;

  return Math.floor(timeLeft / (60 * 1000)); // Return minutes
};
