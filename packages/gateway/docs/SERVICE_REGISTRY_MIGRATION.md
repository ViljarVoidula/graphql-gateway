# Service Registry Migration

## Overview

The GraphQL Gateway has been updated to use a database-backed service registry instead of static endpoint configuration. This provides better scalability, persistence, and ownership management.

## Key Features

### 1. Database Entities
- **Service**: Stores service metadata including URL, owner, status, and configuration
- **ServiceKey**: Manages HMAC keys for service authentication with proper lifecycle management

### 2. Service Ownership
- Each service has an owner (User entity)
- **Owner defaults to the authenticated user creating the service**
- Users can only manage their own services (unless they have admin permissions)
- Admin users can manage all services and transfer ownership
- Admin users can create services for other users by specifying `ownerId`

### 3. Authentication & Authorization
- **Automatic ownership**: Services are automatically owned by the creating user
- **Permission-based access**: Users can only access their own services
- **Admin override**: Admin users can manage all services and create for others
- **Self-service**: Regular users can manage their own services without admin intervention

### 3. GraphQL API

#### Queries
- `services`: List all active services (admin/service-manager only)
- `myServices`: List services owned by the current user
- `service(id)`: Get a specific service by ID
- `serviceKeys(serviceId)`: Get HMAC keys for a service

#### Mutations
- `registerService(input)`: Register a new service
- `updateService(id, input)`: Update service configuration
- `removeService(id)`: Remove a service (soft delete)
- `rotateServiceKey(serviceId)`: Rotate HMAC key for a service
- `revokeServiceKey(keyId)`: Revoke a specific key
- `transferServiceOwnership(serviceId, newOwnerId)`: Transfer ownership (admin only)

## Migration Benefits

1. **Scalability**: Services stored in database with proper indexing
2. **Security**: Role-based access control for service management
3. **Persistence**: Service configurations survive server restarts
4. **Audit Trail**: Track service changes and key rotations
5. **Multi-tenancy**: Users can manage their own services independently
6. **Key Management**: Proper HMAC key lifecycle with rotation and expiration

## Usage Examples

### Register a new service
```graphql
mutation {
  registerService(input: {
    name: "user-service"
    url: "http://localhost:4001/graphql"
    description: "Handles user management operations"
    enableHMAC: true
  }) {
    service {
      id
      name
      url
      owner {
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
```

### Register a service for another user (admin only)
```graphql
mutation {
  registerService(input: {
    name: "admin-service"
    url: "http://localhost:4002/graphql"
    ownerId: "user-123"  # Admin can specify different owner
    description: "Service managed by specific user"
    enableHMAC: true
  }) {
    service {
      id
      name
      url
      owner {
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
```

### List your services
```graphql
query {
  myServices {
    id
    name
    url
    status
    createdAt
    owner {
      email
    }
  }
}
```

### Rotate service key
```graphql
mutation {
  rotateServiceKey(serviceId: "service-123") {
    oldKeyId
    newKey {
      keyId
      secretKey
      instructions
    }
    success
  }
}
```

## Database Schema

### Services Table
- `id`: UUID primary key
- `name`: Unique service name
- `url`: Service endpoint URL
- `owner_id`: Foreign key to users table
- `description`: Optional description
- `status`: ACTIVE | INACTIVE | MAINTENANCE
- `version`: Optional version string
- `sdl`: Optional SDL cache
- `enable_hmac`: Boolean flag
- `timeout`: Request timeout in milliseconds
- `enable_batching`: Boolean flag
- `created_at`: Timestamp
- `updated_at`: Timestamp

### Service Keys Table
- `id`: UUID primary key
- `key_id`: Unique key identifier
- `secret_key`: HMAC secret (not exposed in GraphQL)
- `service_id`: Foreign key to services table
- `status`: ACTIVE | REVOKED | EXPIRED
- `created_at`: Timestamp
- `expires_at`: Optional expiration timestamp

## Migration from Legacy Endpoints

The old endpoint registration methods are now deprecated but maintained for backward compatibility:
- `registerEndpoint` → Use `registerService`
- `removeEndpoint` → Use `removeService`
- `rotateServiceKey` → Use new service registry version

## Security Considerations

1. **Access Control**: Services can only be modified by their owners or admins
2. **Key Management**: HMAC keys are properly generated and stored securely
3. **Audit Trail**: All service changes are tracked with timestamps
4. **Soft Deletion**: Services are marked as inactive rather than hard deleted
5. **Key Rotation**: Old keys have grace periods before expiration

## Future Enhancements

1. Service health monitoring
2. Automatic service discovery
3. Service versioning and blue-green deployments
4. Performance metrics and analytics
5. Service dependency mapping
