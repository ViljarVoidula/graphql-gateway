# Session Security Implementation

## Overview
This implementation adds comprehensive session-based security to your GraphQL Gateway using:
- Redis ### 2. Security Features
- Secure password hashing with bcrypt (12 rounds)
- Account lockout after 5 failed login attempts (30 minutes)
- Session-based authentication with secure cookies
- JWT token authentication via Authorization header
- CSRF protection ready (cookies with SameSite=Strict)
- IP address and user agent tracking

### 3. Authentication Methods
- **Cookie-based Sessions**: Traditional session cookies for web applications
- **JWT Authentication**: Bearer tokens for API clients and mobile apps
- **Dual Support**: Both methods supported simultaneously

### 4. Authorization Systemion s### 5. Logout
```graphql
mutation Logout {
  logout
}
```

### 6. Logout All Sessions
```graphql
mutation LogoutAll {
  logoutAll
}
```

## Authentication Methods

### 1. Cookie-Based Authentication
Traditional web application authentication using secure HTTP-only cookies:
- Cookie name: `gateway_session`
- HttpOnly, Secure, SameSite=Strict
- Automatic session management
- Perfect for web applications

### 2. JWT Bearer Token Authentication
API-focused authentication using Authorization header:
- Header format: `Authorization: Bearer <access_token>`
- Stateless authentication
- Perfect for mobile apps and SPAs
- Supports token refresh flow

### 3. Hybrid Authentication
Both methods work simultaneously:
- JWT tokens take precedence over cookies
- Fallback to cookie-based session if JWT is invalid
- Same session can be accessed via both methods

## Usage Examples by Authentication Method

### Using Cookie Authentication (Web Apps)
```javascript
// Login creates session cookie automatically
const loginResponse = await fetch('/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      mutation Login {
        login(data: { email: "user@example.com", password: "password" }) {
          user { id email }
          tokens { accessToken refreshToken }
          sessionId
        }
      }
    `
  }),
  credentials: 'include' // Important: include cookies
});

// Subsequent requests use cookie automatically
const meResponse = await fetch('/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query Me { me { id email } }`
  }),
  credentials: 'include'
});
```

### Using JWT Authentication (APIs/Mobile)
```javascript
// Login and store tokens
const loginResponse = await fetch('/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      mutation Login {
        login(data: { email: "user@example.com", password: "password" }) {
          user { id email }
          tokens { accessToken refreshToken }
          sessionId
        }
      }
    `
  })
});

const { tokens } = loginResponse.data.login;
localStorage.setItem('accessToken', tokens.accessToken);
localStorage.setItem('refreshToken', tokens.refreshToken);

// Use access token for requests
const meResponse = await fetch('/graphql', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tokens.accessToken}`
  },
  body: JSON.stringify({
    query: `query Me { me { id email } }`
  })
});

// Refresh token when needed
const refreshResponse = await fetch('/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      mutation RefreshToken {
        refreshToken(data: { refreshToken: "${tokens.refreshToken}" }) {
          tokens { accessToken refreshToken }
          user { id email }
        }
      }
    `
  })
});
```greSQL for session persistence 
- @graphql-authz for authorization
- GraphQL Yoga for the server
- JWT tokens for API authentication

## Key Features

### 1. Dual Authentication System
- **Cookie-based sessions**: Traditional web application authentication
- **JWT tokens**: Stateless API authentication via Authorization header
- **Hybrid support**: Both authentication methods work simultaneously
- **Session persistence**: All sessions stored in Redis and PostgreSQL

### 2. Session Management
- Redis-backed sessions with automatic expiration
- Session persistence in PostgreSQL database
- Session activity tracking
- Multi-device session support with logout-all functionality

### 3. JWT Token Support
- Access tokens (15 minutes expiry) for API requests
- Refresh tokens (7 days expiry) for token renewal
- Bearer token authentication via Authorization header
- Secure token generation with configurable secrets

### 4. Security Features
- Secure password hashing with bcrypt (12 rounds)
- Account lockout after 5 failed login attempts (30 minutes)
- Session-based authentication with secure cookies
- CSRF protection ready (cookies with SameSite=Strict)
- IP address and user agent tracking

### 5. Authorization System
- Role-based permissions (user, admin, moderator)
- Fine-grained access control with @graphql-authz directives
- Field-level authorization
- Context-aware permissions

### 6. API Enhancements
- `login` mutation returning JWT tokens and session info
- `refreshToken` mutation for token renewal
- `logout` mutation for single session termination
- `logoutAll` mutation for terminating all user sessions
- `me` query for current user information
- Enhanced user creation with default permissions

## Environment Setup

1. **Install Redis** (if not already installed):
   ```bash
   # Ubuntu/Debian
   sudo apt install redis-server
   
   # macOS
   brew install redis
   
   # Start Redis
   redis-server
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env` and update the values:
   ```env
   DATABASE_URL=postgres://postgres:password@localhost:5432/gateway
   REDIS_URL=redis://localhost:6379
   SESSION_SECRET=your-very-secure-secret-key-change-in-production
   JWT_ACCESS_SECRET=your-jwt-access-secret-change-in-production
   JWT_REFRESH_SECRET=your-jwt-refresh-secret-change-in-production
   JWT_ACCESS_EXPIRY=15m
   JWT_REFRESH_EXPIRY=7d
   NODE_ENV=development
   PORT=4000
   CORS_ORIGIN=http://localhost:3000
   ```

## Usage Examples

### 1. Create a User
```graphql
mutation CreateUser {
  createUser(data: { 
    email: "user@example.com", 
    password: "securePassword123" 
  }) {
    id
    email
    permissions
    createdAt
  }
}
```

### 2. Login (Returns JWT Tokens and Session Info)
```graphql
mutation Login {
  login(data: { 
    email: "user@example.com", 
    password: "securePassword123" 
  }) {
    user {
      id
      email
      permissions
      lastLoginAt
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
```

### 3. Refresh JWT Tokens
```graphql
mutation RefreshToken {
  refreshToken(data: {
    refreshToken: "your-refresh-token-here"
  }) {
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
```

### 4. Get Current User (Works with both cookie and JWT auth)
```graphql
query Me {
  me {
    id
    email
    permissions
    lastLoginAt
    sessions {
      id
      ipAddress
      userAgent
      lastActivity
      isActive
    }
  }
}
```

### 4. Logout
```graphql
mutation Logout {
  logout
}
```

### 5. Logout All Sessions
```graphql
mutation LogoutAll {
  logoutAll
}
```

## Authorization Rules

The system includes several authorization rules:

- `isAuthenticated`: User must be logged in
- `isAdmin`: User must have admin permission
- `isModerator`: User must have moderator or admin permission
- `canAccessUserData`: User can access their own data or has admin permission

### Using Authorization in Resolvers

```typescript
@Query(() => [User])
@Directive('@authz(rules: ["isAdmin"])')
async users() {
  return this.userRepository.find();
}

@Query(() => User)
@Directive('@authz(rules: ["canAccessUserData"])')
async user(@Arg("id") id: string) {
  return this.userRepository.findOneBy({ id });
}
```

## Security Best Practices Implemented

1. **Password Security**:
   - Bcrypt with 12 rounds for hashing
   - Password never exposed in GraphQL responses
   - Minimum password length validation

2. **Session Security**:
   - HttpOnly cookies prevent XSS attacks
   - Secure flag for HTTPS-only transmission
   - SameSite=Strict prevents CSRF attacks
   - Session expiration and cleanup

3. **Account Protection**:
   - Account lockout after failed attempts
   - Login attempt tracking
   - IP address and user agent logging

4. **Authorization**:
   - Field-level access control
   - Role-based permissions
   - Context-aware authorization rules

## Database Schema

### Users Table
- `id`: UUID primary key
- `email`: Unique email address
- `password`: Hashed password
- `permissions`: Array of permission strings
- `isEmailVerified`: Boolean flag
- `lastLoginAt`: Timestamp
- `failedLoginAttempts`: Counter
- `lockedUntil`: Lockout expiration
- `createdAt`, `updatedAt`: Timestamps

### Sessions Table
- `id`: UUID primary key
- `userId`: Foreign key to users
- `sessionId`: Redis session identifier
- `ipAddress`: Client IP address
- `userAgent`: Client user agent
- `isActive`: Boolean flag
- `expiresAt`: Session expiration
- `createdAt`, `lastActivity`: Timestamps

## Redis Session Storage

Sessions are stored in Redis with:
- Key format: `session:{sessionId}`
- TTL: 24 hours (configurable)
- Automatic cleanup on expiration
- JSON serialized session data

## Monitoring and Cleanup

The system includes automatic cleanup processes:
- Expired key cleanup every minute
- Session cleanup in database
- Redis TTL-based expiration

## High Availability & Caching

### Service Discovery Caching
The gateway implements a robust caching system to ensure high availability:

- **Database Service Cache**: Services are cached in memory for 5 minutes
- **Schema Cache**: Individual service schemas are cached for 10 minutes  
- **Fallback Strategy**: If database is unavailable, cached services remain available
- **Automatic Cleanup**: Expired cache entries are cleaned up periodically

### Cache Behavior
- **Primary**: Load services from database
- **Secondary**: Use cached services if database fails
- **Tertiary**: Use expired cache if no fresh data available
- **Cleanup**: Automatic cleanup every 60 seconds

This ensures that:
1. Services remain available even during database outages
2. Schema introspection works with cached schemas
3. Gateway continues operating with last known good state
4. Performance is optimized with intelligent caching

## Next Steps

1. **Add Email Verification**: Implement email verification for new accounts
2. **Rate Limiting**: Add rate limiting for login attempts
3. **Session Analytics**: Track session usage and patterns
4. **Two-Factor Authentication**: Add 2FA support
5. **OAuth Integration**: Add social login support
6. **Audit Logging**: Log all security-related events

## Testing

You can test the implementation by:
1. Starting Redis server: `redis-server`
2. Starting PostgreSQL
3. Running the gateway: `npm run start-gateway`
4. Using GraphQL Playground at `http://localhost:4000/graphql`

**Note**: The system will automatically recreate the database schema on startup due to `dropSchema: true` in the DataSource configuration. This ensures the session table uses the correct column types.

## Troubleshooting

### Database Issues
- **IP Address Errors**: The session table uses `varchar` instead of `inet` to handle cases where IP addresses can't be determined
- **Schema Changes**: The system recreates the database schema on startup, so existing data will be lost during development

### Common Issues
- **Redis Connection**: Ensure Redis is running before starting the gateway
- **PostgreSQL Connection**: Verify the DATABASE_URL in your .env file
- **Session Cookies**: Ensure your client supports cookies for session management

### JWT Token Issues
- **Token Expiry**: Access tokens expire in 15 minutes by default - use refresh tokens to get new ones
- **Invalid Authorization Header**: Ensure header format is `Authorization: Bearer <token>`
- **Token Verification Errors**: Check JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in your .env file
- **Refresh Token Failed**: Refresh tokens expire in 7 days - users need to login again after expiry

### Cache Issues
- **Stale Service Data**: Services are cached for 5 minutes - wait for automatic refresh or restart gateway
- **Schema Outdated**: Individual schemas cached for 10 minutes - check service availability
- **Memory Usage**: Cache cleanup runs every 60 seconds to prevent memory leaks

### Authentication Priority
The system uses the following authentication priority:
1. **JWT Bearer Token** (Authorization header) - checked first
2. **Session Cookie** - fallback if JWT is missing or invalid
3. **Unauthenticated** - if both methods fail

The system is now ready for production use with proper environment variables and security configurations.
