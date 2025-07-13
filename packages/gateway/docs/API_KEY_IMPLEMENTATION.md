# API Key System Implementation

This implementation adds a comprehensive API key management system to the GraphQL Gateway with the following features:

## Architecture Overview

### 1. Two-Step Access Control
- **Gateway Administrators**: Mark services as `externally_accessible`
- **Application Owners**: Select from externally accessible services to whitelist for their applications

### 2. Database Schema

#### Application Entity
- `id`: UUID primary key
- `name`: Application name
- `description`: Optional description
- `ownerId`: Reference to User who owns the application
- `whitelistedServices`: Many-to-many relationship with Service entities
- `apiKeys`: One-to-many relationship with ApiKey entities

#### ApiKey Entity
- `id`: UUID primary key
- `keyPrefix`: First 12 characters for identification (e.g., "app_12345678")
- `hashedKey`: SHA256 hash of the actual key
- `status`: ACTIVE, REVOKED, or EXPIRED
- `name`: Human-readable name
- `scopes`: Array of scopes defining access permissions
- `expiresAt`: Optional expiration date
- `lastUsedAt`: Last usage timestamp
- `applicationId`: Reference to Application

#### Service Entity (Updated)
- Added `externally_accessible` boolean field
- Only services marked as externally accessible can be selected by application owners

### 3. Authentication Flow

1. **API Key Authentication**: Check for `X-API-Key` header
2. **JWT Authentication**: Check for `Authorization` header with Bearer token
3. **Session Authentication**: Check for session cookie

### 4. Authorization Rules

- `isAuthenticated`: User must be logged in
- `isAdmin`: User must have admin permissions
- `canManageApplications`: Admin or application-manager permissions
- `canAccessApplication`: Admin or application owner
- `canAccessService`: Admin or service owner or whitelisted application

## GraphQL API

### Application Management

```graphql
# Query user's applications
query MyApplications {
  myApplications {
    id
    name
    description
    apiKeys {
      id
      name
      status
      createdAt
      expiresAt
    }
    whitelistedServices {
      id
      name
      url
    }
  }
}

# Create new application
mutation CreateApplication {
  createApplication(name: "My App", description: "Description") {
    id
    name
  }
}

# Generate API key
mutation CreateApiKey {
  createApiKey(
    applicationId: "app-uuid"
    name: "Production Key"
    scopes: ["read", "write"]
    expiresAt: "2025-12-31T23:59:59.000Z"
  )
}

# Add service to application whitelist
mutation AddServiceToApplication {
  addServiceToApplication(
    applicationId: "app-uuid"
    serviceId: "service-uuid"
  )
}
```

### Service Management (Admin Only)

```graphql
# Get externally accessible services
query ExternallyAccessibleServices {
  externallyAccessibleServices {
    id
    name
    url
    description
  }
}

# Mark service as externally accessible
mutation SetServiceExternallyAccessible {
  setServiceExternallyAccessible(
    serviceId: "service-uuid"
    externally_accessible: true
  )
}
```

## API Key Usage

### Making Requests

```javascript
// Using API key for authentication
const response = await fetch('/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'app_1234567890abcdef...'
  },
  body: JSON.stringify({
    query: `
      query {
        services {
          id
          name
        }
      }
    `
  })
});
```

### API Key Format

- Prefix: `app_` (4 characters)
- Random: 64 hex characters
- Total length: 68 characters
- Example: `app_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef`

## Security Features

1. **Key Hashing**: Only SHA256 hashes stored in database
2. **Key Prefixes**: First 12 characters stored for efficient lookup
3. **Expiration**: Optional expiration dates
4. **Revocation**: Keys can be revoked instantly
5. **Scopes**: Fine-grained access control (not fully implemented)
6. **Service Whitelisting**: Applications can only access pre-approved services

## Usage Tracking

- `lastUsedAt` timestamp updated on each request
- Application usage can be monitored
- Keys can be revoked based on usage patterns

## Implementation Files

- `src/entities/api-key.entity.ts` - ApiKey entity
- `src/entities/application.entity.ts` - Application entity
- `src/auth/api-key.service.ts` - API key validation and generation
- `src/auth/authorization.service.ts` - Service access control
- `src/auth/session.plugin.ts` - Updated authentication plugin
- `src/auth/authz-rules.ts` - Updated authorization rules
- `src/services/applications/application.resolver.ts` - Application GraphQL resolver
- `src/services/service-registry/service-registry.resolver.ts` - Updated service resolver
- `src/auth/service-access.middleware.ts` - Service access middleware

## Next Steps

1. Add database migrations for new entities
2. Implement service access middleware in gateway
3. Add rate limiting per API key
4. Implement scope-based access control
5. Add audit logging for API key usage
6. Create admin dashboard for monitoring
