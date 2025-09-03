# GraphQL Gateway Admin UI

This is a React-based admin interface for managing the GraphQL Gateway, built with Refine.dev and Mantine UI.

## Features

- **Dashboard**: Overview of gateway health, users, services, and sessions
- **User Management**: Create, view, edit, and manage users
- **Service Registry**: Register, configure, and monitor services
- **Session Management**: View and manage active user sessions
- **Authentication**: Secure login with JWT tokens

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or pnpm
- PostgreSQL database
- Redis server

### Installation

1. Install dependencies:

```bash
npm install
```

2. Build the admin UI:

```bash
npm run build:admin
```

3. Start the gateway server:

```bash
npm start
```

4. Access the admin UI at: `http://localhost:4000/admin`

### Development

For development with hot reload:

1. Start the gateway server:

```bash
npm start
```

2. In another terminal, start the admin UI dev server:

```bash
npm run dev:admin
```

3. Access the admin UI at: `http://localhost:3001`

## Architecture

### Frontend Stack

- **React 18**: Modern React with hooks
- **Refine.dev**: Data-driven admin framework
- **Mantine UI**: Beautiful and accessible components
- **React Router**: Client-side routing
- **GraphQL Request**: GraphQL client for API calls

### Admin Features

#### Dashboard

- Gateway health monitoring
- User and service statistics
- Session activity overview
- Service status indicators

#### User Management

- List all users with pagination and search
- View user details and permissions
- Create new users
- Edit user permissions
- Account status management

#### Service Registry

- List all registered services
- View service details and configuration
- Register new services
- Update service settings
- HMAC key management
- Service health monitoring

#### Session Management

- View active and expired sessions
- Session details (IP, user agent, etc.)
- Session termination
- Security monitoring

## API Integration

The admin UI connects to the GraphQL Gateway's existing API endpoints:

### Authentication Endpoints

- `login`: User authentication
- `logout`: Session termination
- `me`: Current user information

### User Endpoints

- `users`: List all users
- `user(id)`: Get specific user
- `createUser`: Create new user
- `updateUser`: Update user details

### Service Endpoints

- `services`: List all services
- `service(id)`: Get specific service
- `registerService`: Register new service
- `updateService`: Update service configuration

### Session Endpoints

- `sessions`: List all sessions
- `session(id)`: Get specific session
- `deleteSession`: Terminate session

## Configuration

### Environment Variables

- `NODE_ENV`: Environment (development/production)
- `CORS_ORIGIN`: Allowed CORS origins for admin UI

### Build Configuration

The admin UI is built using Webpack and served as static files from the gateway server. The build configuration is in `webpack.config.js`.

## Security

- JWT token authentication
- Session-based authorization
- CORS protection
- Permission-based access control
- Secure HTTP headers

## Development Guidelines

### Adding New Features

1. Create new pages in `src/client/pages/`
2. Add routes in `App.tsx`
3. Update the data provider if needed
4. Add new GraphQL queries/mutations
5. Update the navigation menu

### Customizing UI

- Modify Mantine theme in `App.tsx`
- Update styles and components
- Add custom icons and branding
- Customize layout and navigation

### Testing

- Unit tests for components
- Integration tests for API calls
- End-to-end tests for user flows

## Deployment

### Production Build

```bash
npm run build:admin
npm run build
```

### Docker Deployment

The admin UI is included in the gateway Docker image and served as static files.

### Security Considerations

- Use HTTPS in production
- Configure proper CORS origins
- Set secure session cookies
- Enable rate limiting
- Regular security updates

## Troubleshooting

### Common Issues

1. **Admin UI not loading**: Ensure the build was successful with `npm run build:admin`
2. **Authentication errors**: Check JWT token configuration
3. **GraphQL errors**: Verify API endpoint and schema
4. **Permission errors**: Check user permissions and authorization rules

### Development Issues

1. **Hot reload not working**: Restart the dev server
2. **TypeScript errors**: Check type definitions
3. **Build errors**: Clear node_modules and reinstall

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## License

This project is licensed under the MIT License.
