# Gateway Message Channel - Subscription System

This document describes how to use the GraphQL Gateway's real-time messaging system to push notifications and events from backend services to frontend clients.

## Overview

The Gateway Message Channel provides a generic GraphQL su### Documentation Generation Events

```typescript
// In the AI resolver (already implemented)
const publisher = Container.get(GatewayMessagePublisher);

// Process started
await publisher.publishGatewayMessage({
  topic: 'system/docs-generation',
  type: 'generation_started',
  severity: MessageSeverity.INFO,
  payload: {
    totalServices: 5,
    serviceNames: ['auth-service', 'user-service', ...],
    publishMode: true,
    timestamp: new Date().toISOString()
  }
});

// Individual service progress
await publisher.publishGatewayMessage({
  topic: 'system/docs-generation',
  type: 'service_processing',
  severity: MessageSeverity.INFO,
  payload: {
    serviceName: 'auth-service',
    serviceId: 'svc-123',
    progress: {
      current: 1,
      total: 5,
      percentage: 20
    }
  }
});

// Service completed
await publisher.publishGatewayMessage({
  topic: 'system/docs-generation',
  type: 'service_completed',
  severity: MessageSeverity.INFO,
  payload: {
    serviceName: 'auth-service',
    action: 'created', // or 'updated'
    slug: 'api-auth-service',
    published: true
  }
});
```

### User Onboarding Messages

````typescript
// In your user registration handler
await publisher.publishUserMessage(newUser.id, {
  type: 'onboarding_welcome',
  title: 'Welcome to the Platform!',
  steps: [
    { title: 'Complete your profile', url: '/profile' },
    { title: 'Create your first project', url: '/projects/new' },
    { title: 'Invite team members', url: '/team/invite' }
  ]
});
```t allows:

- Internal services to push messages to frontend clients
- Real-time notifications and updates
- Scoped message delivery based on user, application, or tenant context
- Redis-backed distribution for multi-instance deployments

## Architecture

````

Backend Service → GatewayMessagePublisher → Redis PubSub → GraphQL Subscription → Frontend Client

````

## GraphQL Schema

```graphql
enum MessageSeverity {
  INFO
  WARN
  ERROR
}

type GatewayMessage {
  id: ID!
  topic: String!
  type: String
  timestamp: String!
  tenantId: String
  userId: String
  appId: String
  severity: MessageSeverity
  payload: JSON!
}

input GatewayMessageFilter {
  topic: String!
  tenantId: String
  userId: String
  appId: String
}

type Subscription {
  gatewayMessage(topics: [String!]!): GatewayMessage!
}
````

## Usage Examples

### Frontend Subscription

```typescript
// Subscribe to system broadcasts
const SYSTEM_SUBSCRIPTION = gql`
  subscription SystemMessages {
    gatewayMessageChannel(filter: { topic: "system/broadcast" }) {
      id
      topic
      type
      timestamp
      severity
      payload
    }
  }
`;

// Subscribe to app-specific notifications
const APP_SUBSCRIPTION = gql`
  subscription AppNotifications($appId: String!) {
    gatewayMessageChannel(filter: { topic: "app", appId: $appId }) {
      id
      topic
      type
      timestamp
      severity
      payload
    }
  }
`;

// Subscribe to user messages
const USER_SUBSCRIPTION = gql`
  subscription UserMessages($userId: String!) {
    gatewayMessageChannel(filter: { topic: "user", userId: $userId }) {
      id
      topic
      type
      timestamp
      severity
      payload
    }
  }
`;
```

### Backend Publishing

```typescript
import { Container } from 'typedi';
import {
  GatewayMessagePublisher,
  MessageSeverity,
} from '../services/subscriptions';

// Get the publisher instance
const publisher = Container.get(GatewayMessagePublisher);

// Example 1: System broadcast
await publisher.publishSystemBroadcast(
  'System maintenance scheduled for 2:00 AM UTC',
  MessageSeverity.WARN
);

// Example 2: App notification
await publisher.publishAppNotification(
  'app-123',
  {
    title: 'New Feature Available',
    description: 'Check out our new dashboard widgets!',
    actionUrl: '/features/widgets',
  },
  MessageSeverity.INFO
);

// Example 3: User message
await publisher.publishUserMessage(
  'user-456',
  {
    type: 'welcome',
    message: 'Welcome to the platform!',
    actions: [
      { label: 'Get Started', url: '/onboarding' },
      { label: 'Learn More', url: '/docs' },
    ],
  },
  MessageSeverity.INFO
);

// Example 4: Custom message
await publisher.publishGatewayMessage({
  topic: 'tenant/acme-corp/billing',
  type: 'invoice_generated',
  tenantId: 'acme-corp',
  severity: MessageSeverity.INFO,
  payload: {
    invoiceId: 'inv-789',
    amount: 2500,
    dueDate: '2025-10-15',
    downloadUrl: '/invoices/inv-789.pdf',
  },
});
```

## Topic Naming Convention

Topics follow a hierarchical structure for organization and filtering:

- **System messages**: `system/{category}`
  - `system/broadcast` - General announcements
  - `system/maintenance` - Maintenance notifications
  - `system/alert` - System alerts
  - `system/docs-generation` - Documentation generation events

- **Application messages**: `app/{appId}/{category}`
  - `app/123/notification` - General app notifications
  - `app/123/event` - App-specific events
  - `app/123/status` - App status updates

- **User messages**: `user/{userId}/{category}`
  - `user/456/notification` - User notifications
  - `user/456/message` - Direct messages

- **Tenant messages**: `tenant/{tenantId}/{category}`
  - `tenant/acme/event` - Tenant events
  - `tenant/acme/notification` - Tenant notifications

## Security and Access Control

### Authentication

- All subscriptions require authentication (`@authz(rules: ["isAuthenticated"])`)
- Connection must include valid JWT token or API key

### Authorization

- **Admin users**: Can receive all messages
- **System messages**: Available to all authenticated users
- **User messages**: Only delivered to the target user
- **App messages**: Delivered to users with access to the application
- **Tenant messages**: Delivered based on tenant membership (customize as needed)

### Filtering

Messages are filtered at the subscription level based on:

1. Topic matching (prefix-based)
2. Scope matching (tenantId, userId, appId)
3. Access control checks

## Configuration

### Environment Variables

```bash
# PubSub Redis configuration
PUBSUB_REDIS_URL=redis://localhost:6379
# Or fallback to general Redis URL
REDIS_URL=redis://localhost:6379

# Subscription transport (for downstream services)
# AUTO, SSE, WS
SUBSCRIPTION_TRANSPORT=AUTO
```

## Monitoring and Observability

The subscription system includes built-in logging and metrics:

- Message publishing events (debug level)
- Delivery filtering decisions (debug/warn level)
- Access control violations (warn level)
- Subscription connection events
- Error handling and recovery

Monitor these logs to ensure proper message delivery and identify any access control issues.

## Real-time Document Generation Monitoring

The subscription system is integrated with the AI document generation process to provide real-time updates. Here's how to monitor document generation progress from a React frontend:

### React Component Example

```tsx
import { useSubscription } from '@apollo/client';
import { gql } from '@apollo/client';
import React from 'react';

const DOCUMENT_GENERATION_SUBSCRIPTION = gql`
  subscription WatchDocumentGeneration($topics: [String!]!) {
    gatewayMessage(topics: $topics) {
      id
      topic
      type
      severity
      timestamp
      payload
    }
  }
`;

interface DocumentGenerationMonitorProps {
  onProgress?: (progress: number) => void;
  onComplete?: (results: any) => void;
  onError?: (error: string) => void;
}

export function DocumentGenerationMonitor({
  onProgress,
  onComplete,
  onError,
}: DocumentGenerationMonitorProps) {
  const [generationState, setGenerationState] = React.useState<{
    inProgress: boolean;
    progress: number;
    currentService: string | null;
    completedServices: string[];
    totalServices: number;
    error: string | null;
  }>({
    inProgress: false,
    progress: 0,
    currentService: null,
    completedServices: [],
    totalServices: 0,
    error: null,
  });

  const { data, error } = useSubscription(DOCUMENT_GENERATION_SUBSCRIPTION, {
    variables: {
      topics: ['system/docs-generation'],
    },
  });

  React.useEffect(() => {
    if (data?.gatewayMessage) {
      const message = data.gatewayMessage;
      const payload = message.payload;

      switch (payload.event) {
        case 'generation_started':
          setGenerationState((prev) => ({
            ...prev,
            inProgress: true,
            progress: 0,
            currentService: null,
            completedServices: [],
            totalServices: payload.totalServices || 0,
            error: null,
          }));
          break;

        case 'service_processing':
          setGenerationState((prev) => ({
            ...prev,
            currentService: payload.serviceName,
            progress: payload.progress || 0,
          }));
          onProgress?.(payload.progress || 0);
          break;

        case 'service_completed':
          setGenerationState((prev) => ({
            ...prev,
            completedServices: [...prev.completedServices, payload.serviceName],
            progress: payload.progress || 0,
          }));
          onProgress?.(payload.progress || 0);
          break;

        case 'generation_completed':
          setGenerationState((prev) => ({
            ...prev,
            inProgress: false,
            progress: 100,
            currentService: null,
          }));
          onComplete?.(payload);
          break;

        case 'generation_failed':
          setGenerationState((prev) => ({
            ...prev,
            inProgress: false,
            error: payload.error || 'Generation failed',
          }));
          onError?.(payload.error || 'Generation failed');
          break;
      }
    }
  }, [data, onProgress, onComplete, onError]);

  if (error) {
    return <div className="error">Subscription error: {error.message}</div>;
  }

  return (
    <div className="document-generation-monitor">
      {generationState.inProgress && (
        <div className="generation-progress">
          <h3>Generating Documentation...</h3>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${generationState.progress}%` }}
            />
          </div>
          <p>{generationState.progress}% complete</p>

          {generationState.currentService && (
            <p>Processing: {generationState.currentService}</p>
          )}

          {generationState.completedServices.length > 0 && (
            <div className="completed-services">
              <p>Completed services:</p>
              <ul>
                {generationState.completedServices.map((service) => (
                  <li key={service}>{service}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {generationState.error && (
        <div className="generation-error">
          <h3>Generation Failed</h3>
          <p>{generationState.error}</p>
        </div>
      )}
    </div>
  );
}
```

### Usage Example

```tsx
import { DocumentGenerationMonitor } from './DocumentGenerationMonitor';

function DocumentationPage() {
  const handleProgress = (progress: number) => {
    console.log(`Generation progress: ${progress}%`);
  };

  const handleComplete = (results: any) => {
    console.log('Generation completed:', results);
    // Refresh documentation list or navigate to results
  };

  const handleError = (error: string) => {
    console.error('Generation failed:', error);
    // Show error notification to user
  };

  return (
    <div>
      <h1>Documentation</h1>
      <DocumentGenerationMonitor
        onProgress={handleProgress}
        onComplete={handleComplete}
        onError={handleError}
      />
      {/* Rest of your documentation UI */}
    </div>
  );
}
```

### Message Types

The document generation process publishes the following message types:

- **generation_started**: When generation begins
  - `payload.totalServices`: Number of services to process
  - `payload.requestId`: Unique identifier for the generation request

- **service_processing**: When processing a specific service
  - `payload.serviceName`: Name of the service being processed
  - `payload.progress`: Current progress percentage (0-100)

- **service_completed**: When a service is finished
  - `payload.serviceName`: Name of the completed service
  - `payload.progress`: Updated progress percentage
  - `payload.documentsGenerated`: Number of documents generated for this service

- **generation_completed**: When all services are processed
  - `payload.totalDocuments`: Total number of documents generated
  - `payload.totalServices`: Number of services processed
  - `payload.duration`: Generation time in milliseconds

- **generation_failed**: When generation encounters an error
  - `payload.error`: Error message
  - `payload.serviceName`: Service that failed (if applicable)

## Production Considerations

1. **Rate Limiting**: Implement rate limits for message publishing to prevent abuse
2. **Message TTL**: Consider implementing message expiration for ephemeral notifications
3. **Connection Limits**: Monitor and limit concurrent subscription connections per user
4. **Payload Size**: Validate and limit message payload size (current limit: validated by topic length)
5. **Redis Scaling**: Use Redis Cluster for high-availability deployments
6. **Monitoring**: Set up alerts for subscription errors and connection failures

## Integration Examples

### Service Health Notifications

```typescript
// In your service health monitor
const publisher = Container.get(GatewayMessagePublisher);

if (serviceDown) {
  await publisher.publishGatewayMessage({
    topic: 'system/alert',
    type: 'service_outage',
    severity: MessageSeverity.ERROR,
    payload: {
      service: 'payment-processor',
      status: 'down',
      impact: 'Payment processing unavailable',
      estimatedRecovery: '2025-10-15T14:30:00Z',
    },
  });
}
```

### Application Deployment Notifications

```typescript
// In your deployment pipeline
await publisher.publishGatewayMessage({
  topic: 'system/broadcast',
  type: 'deployment',
  severity: MessageSeverity.INFO,
  payload: {
    version: '2.1.0',
    features: ['New dashboard', 'Performance improvements'],
    downtime: false,
    releaseNotes: '/releases/2.1.0',
  },
});
```

### User Onboarding Messages

```typescript
// In your user registration handler
await publisher.publishUserMessage(newUser.id, {
  type: 'onboarding_welcome',
  title: 'Welcome to the Platform!',
  steps: [
    { title: 'Complete your profile', url: '/profile' },
    { title: 'Create your first project', url: '/projects/new' },
    { title: 'Invite team members', url: '/team/invite' },
  ],
});
```
