# GraphQL Gateway

A robust GraphQL gateway service that provides unified access to multiple backend services with authentication, authorization, and comprehensive monitoring capabilities.

## Features

- **GraphQL Schema Stitching**: Combines multiple GraphQL services into a unified schema
- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **API Key Management**: Support for API key-based authentication with usage tracking
- **Rate Limiting**: Per-service and per-user rate limiting
- **Performance Monitoring**: Request latency tracking and performance metrics
- **Audit Logging**: Comprehensive audit trail for all operations
- **Admin Dashboard**: Web-based administration interface
- **Documentation Portal**: Built-in GraphQL playground and documentation

## Prerequisites

- **Node.js**: Version 18 or higher
- **PostgreSQL**: Version 12 or higher
- **Redis**: Version 6 or higher
- **pnpm**: Latest version

## Quick Start

### 1. Environment Setup

Create your environment configuration by copying the example:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```bash
# Database Configuration
DATABASE_URL=postgres://postgres:password@localhost:5432/gateway

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Session Configuration (generate a secure random string)
SESSION_SECRET=your-very-secure-secret-key-change-in-production

# Server Configuration
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Database Setup

The gateway uses PostgreSQL for data persistence. Ensure PostgreSQL is running, then:

```bash
# Create database and run migrations
pnpm run migration:run

# Seed initial admin user (optional)
pnpm run seed:admin
```

### 4. Start the Development Server

```bash
# Start the main gateway service
pnpm start

# Or start the admin dashboard in development mode
pnpm run dev:admin
```

The gateway will be available at:

- **GraphQL Endpoint**: `http://localhost:4000/graphql`
- **Admin Dashboard**: `http://localhost:4000/admin`
- **Documentation**: `http://localhost:4000/docs`

## Available Scripts

### Development

- `pnpm start` - Start the gateway service with hot reload
- `pnpm run dev:admin` - Start the admin dashboard in development mode
- `pnpm build` - Build the production bundle
- `pnpm run build:admin` - Build the admin dashboard

### Database Management

- `pnpm run db:create` - Create the database if it doesn't exist
- `pnpm run migration:run` - Run database migrations
- `pnpm run migration:generate` - Generate new migration from entity changes
- `pnpm run migration:revert` - Revert the last migration
- `pnpm run migration:show` - Show migration status
- `pnpm run seed:admin` - Seed initial admin user

### Testing

- `pnpm test` - Run the test suite with coverage
- `pnpm run test:watch` - Run tests in watch mode
- `pnpm run test:setup` - Set up test database

### Documentation

- `pnpm run docs:build` - Build documentation
- `pnpm run docs:manifest` - Generate documentation manifest
- `pnpm run docs:introspect` - Introspect GraphQL schema

### Performance Testing

- `pnpm run bench:smoke` - Run smoke test
- `pnpm run bench:ramp` - Run load ramp test
- `pnpm run bench:spike` - Run spike test

## Configuration

### Environment Variables

| Variable         | Description                       | Default                                               |
| ---------------- | --------------------------------- | ----------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string      | `postgres://postgres:password@localhost:5432/gateway` |
| `REDIS_URL`      | Redis connection string           | `redis://localhost:6379`                              |
| `SESSION_SECRET` | Secret key for session encryption | **Required**                                          |
| `NODE_ENV`       | Application environment           | `development`                                         |
| `PORT`           | Server port                       | `4000`                                                |
| `CORS_ORIGIN`    | CORS allowed origins              | `http://localhost:3000`                               |

### Redis Configuration

The gateway uses Redis for:

- Session storage
- Response caching
- API key usage tracking
- Rate limiting

### Database Schema

The gateway maintains its own PostgreSQL database for:

- User management and authentication
- Service registry and configuration
- Audit logs and analytics
- API key management

## Architecture

### Core Components

- **Schema Loader**: Dynamically loads and stitches GraphQL schemas from registered services
- **Authentication Layer**: JWT and API key based authentication
- **Authorization Engine**: Role-based access control with service-specific permissions
- **Rate Limiter**: Configurable rate limiting per service/user
- **Audit System**: Comprehensive logging and monitoring
- **Admin Interface**: Web-based management dashboard

### Service Integration

Services can be registered with the gateway by:

1. Adding service configuration to the database
2. Providing GraphQL introspection endpoint
3. Configuring authentication requirements
4. Setting up rate limits and permissions

## Monitoring & Observability

The gateway includes comprehensive monitoring:

- **OpenTelemetry**: Distributed tracing and metrics
- **Performance Tracking**: Request latency and throughput metrics
- **Audit Logs**: Complete audit trail of all operations
- **Health Checks**: Service health monitoring
- **Usage Analytics**: API usage statistics and trends

## Development

### Adding New Features

1. **Entities**: Add TypeORM entities in `src/entities/`
2. **Migrations**: Generate migrations with `pnpm run migration:generate`
3. **Resolvers**: Add GraphQL resolvers in `src/services/`
4. **Tests**: Write tests alongside your code
5. **Documentation**: Update relevant documentation

### Project Structure

```
src/
├── auth/           # Authentication & authorization
├── client/         # Admin dashboard frontend
├── config/         # Configuration files
├── db/             # Database setup and utilities
├── entities/       # TypeORM entities
├── middleware/     # Custom middleware
├── migrations/     # Database migrations
├── services/       # GraphQL services and resolvers
├── security/       # Security utilities
├── utils/          # Utility functions
└── workers/        # Background workers
```

## Troubleshooting

### Common Issues

**Database Connection Errors**

- Ensure PostgreSQL is running and accessible
- Verify DATABASE_URL in your `.env.local` file
- Check database permissions

**Redis Connection Errors**

- Ensure Redis is running
- Verify REDIS_URL configuration
- Check Redis authentication if configured

**Migration Failures**

- Check database permissions
- Ensure no conflicting schema changes
- Review migration logs for specific errors

**Service Integration Issues**

- Verify service endpoints are accessible
- Check service authentication configuration
- Review schema compatibility

### Getting Help

- Check the logs for detailed error messages
- Review the documentation in the `docs/` directory
- Check existing GitHub issues
- Create a new issue with detailed reproduction steps

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details
