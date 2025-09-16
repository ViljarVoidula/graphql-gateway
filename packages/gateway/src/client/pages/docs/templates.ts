import { IconBook, IconBulb, IconCode, IconQuestionMark, IconRocket, IconSettings } from '@tabler/icons-react';
import React from 'react';

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'guide' | 'reference' | 'tutorial' | 'other';
  content: (title: string, slug: string) => string;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'getting-started',
    name: 'Getting Started Guide',
    description: 'Introduction guide for new users with setup instructions and basic usage',
    icon: React.createElement(IconRocket, { size: 20 }),
    category: 'guide',
    content: (title: string, slug: string) => `---
title: "${title}"
description: "Get started with our platform quickly and easily"
type: "guide"
category: "getting-started"
difficulty: "beginner"
estimatedTime: "15 minutes"
tags: ["setup", "introduction", "basics"]
---

# ${title}

Welcome! This guide will help you get started with our platform in just a few minutes.

## Prerequisites

Before you begin, make sure you have:

- [ ] A valid account with appropriate permissions
- [ ] Required tools installed on your system
- [ ] Basic familiarity with the concepts

## Quick Start

### Step 1: Initial Setup

\`\`\`bash
# Add your setup commands here
npm install your-package
\`\`\`

### Step 2: Configuration

Create a configuration file:

\`\`\`yaml
# config.yaml
apiUrl: "https://api.example.com"
timeout: 30
\`\`\`

### Step 3: First Request

\`\`\`javascript
// Example usage
const client = new Client();
const result = await client.getData();
console.log(result);
\`\`\`

## Next Steps

Now that you have the basics working, you might want to:

- [Explore advanced features](../advanced-usage)
- [Check out example projects](../examples)
- [Join our community](../community)

## Troubleshooting

### Common Issues

**Problem**: Setup fails with permission error  
**Solution**: Make sure you have the correct permissions and try running with elevated privileges.

**Problem**: Connection timeout  
**Solution**: Check your network settings and firewall configuration.

## Need Help?

- 📖 [Documentation](../reference)
- 💬 [Community Forum](https://community.example.com)
- 🐛 [Report Issues](https://github.com/example/issues)
`
  },
  {
    id: 'api-reference',
    name: 'API Reference',
    description: 'Technical reference documentation for APIs, endpoints, and parameters',
    icon: React.createElement(IconCode, { size: 20 }),
    category: 'reference',
    content: (title: string, slug: string) => `---
title: "${title}"
description: "Complete API reference with endpoints, parameters, and examples"
type: "reference"
category: "api"
version: "v1.0"
tags: ["api", "reference", "endpoints"]
---

# ${title}

Complete reference for all available API endpoints and methods.

## Base URL

\`\`\`
https://api.example.com/v1
\`\`\`

## Authentication

All API requests require authentication using an API key:

\`\`\`http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
\`\`\`

## Endpoints

### GET /resource

Retrieve a list of resources.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`limit\` | integer | No | Maximum number of items to return (default: 10) |
| \`offset\` | integer | No | Number of items to skip (default: 0) |
| \`filter\` | string | No | Filter resources by criteria |

**Request:**

\`\`\`http
GET /resource?limit=20&offset=0
Authorization: Bearer YOUR_API_KEY
\`\`\`

**Response:**

\`\`\`json
{
  "data": [
    {
      "id": "123",
      "name": "Example Resource",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0
  }
}
\`\`\`

### POST /resource

Create a new resource.

**Request Body:**

\`\`\`json
{
  "name": "string (required)",
  "description": "string (optional)",
  "metadata": "object (optional)"
}
\`\`\`

**Response:**

\`\`\`json
{
  "id": "456",
  "name": "New Resource",
  "description": "Resource description",
  "created_at": "2024-01-01T00:00:00Z"
}
\`\`\`

## Error Handling

The API uses standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid API key |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

**Error Response Format:**

\`\`\`json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "The 'name' parameter is required",
    "details": {}
  }
}
\`\`\`

## Rate Limiting

API requests are limited to 1000 requests per hour per API key. Rate limit information is included in response headers:

\`\`\`
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1609459200
\`\`\`
`
  },
  {
    id: 'tutorial',
    name: 'Step-by-Step Tutorial',
    description: 'Hands-on tutorial with exercises and practical examples',
    icon: React.createElement(IconBook, { size: 20 }),
    category: 'tutorial',
    content: (title: string, slug: string) => `---
title: "${title}"
description: "Learn through hands-on exercises and practical examples"
type: "tutorial"
category: "learning"
difficulty: "intermediate"
estimatedTime: "45 minutes"
tags: ["tutorial", "hands-on", "examples"]
prerequisites: ["basic-concepts", "getting-started"]
---

# ${title}

In this tutorial, you'll learn how to build a complete solution step by step.

## What You'll Build

By the end of this tutorial, you'll have:

- ✅ A working implementation
- ✅ Understanding of key concepts
- ✅ Practical experience with best practices
- ✅ A foundation for advanced topics

## What You'll Learn

- Core concepts and terminology
- Step-by-step implementation process
- Common patterns and best practices
- Troubleshooting and debugging techniques

## Tutorial Structure

This tutorial is divided into several sections:

1. **[Setup](#setup)** - Prepare your environment
2. **[Part 1](#part-1)** - Basic implementation
3. **[Part 2](#part-2)** - Adding features
4. **[Part 3](#part-3)** - Optimization and best practices
5. **[Conclusion](#conclusion)** - Summary and next steps

---

## Setup

Before we begin, let's set up our development environment.

### Requirements

- Node.js 18+ installed
- Basic knowledge of JavaScript/TypeScript
- A text editor or IDE

### Project Setup

1. Create a new project directory:

\`\`\`bash
mkdir tutorial-project
cd tutorial-project
\`\`\`

2. Initialize the project:

\`\`\`bash
npm init -y
npm install required-packages
\`\`\`

3. Create the basic file structure:

\`\`\`
tutorial-project/
├── src/
│   ├── index.js
│   └── utils/
├── tests/
└── package.json
\`\`\`

---

## Part 1: Basic Implementation

Let's start with a simple implementation.

### Step 1: Create the Core Module

Create \`src/index.js\`:

\`\`\`javascript
// Core implementation
class ExampleClass {
  constructor(options = {}) {
    this.options = options;
  }

  async process(data) {
    // Implementation details
    return data;
  }
}

module.exports = ExampleClass;
\`\`\`

### 🎯 Exercise 1

Try implementing the \`performOperation\` method to:
- Validate the input data
- Transform it according to your needs
- Return the processed result

---

## Conclusion

Congratulations! You've successfully built a complete implementation from scratch.

### Next Steps

- [Advanced Topics](../advanced)
- [Performance Optimization](../performance)
- [Deployment Guide](../deployment)
`
  },
  {
    id: 'faq',
    name: 'FAQ / Troubleshooting',
    description: 'Frequently asked questions and common troubleshooting scenarios',
    icon: React.createElement(IconQuestionMark, { size: 20 }),
    category: 'other',
    content: (title: string, slug: string) => `---
title: "${title}"
description: "Frequently asked questions and solutions to common problems"
type: "faq"
category: "support"
tags: ["faq", "troubleshooting", "support", "common-issues"]
---

# ${title}

Find answers to frequently asked questions and solutions to common problems.

## General Questions

### What is this platform?

This platform provides [brief description of your platform/service]. It's designed to [main purpose/benefit].

### Who should use this?

This platform is ideal for:
- Developers building [specific type of applications]
- Teams looking to [specific benefit]
- Organizations that need [specific capability]

### How much does it cost?

We offer several pricing tiers:
- **Free tier**: [limitations and features]
- **Pro tier**: [pricing and features]
- **Enterprise**: [contact information]

For detailed pricing, visit our [pricing page](../pricing).

---

## Technical Issues

### My API requests are failing. What should I check?

Common causes and solutions:

**Authentication Issues:**
- ✅ Verify your API key is correct
- ✅ Check that your key hasn't expired
- ✅ Ensure you're using the correct authentication header

**Rate Limiting:**
- ✅ Check if you've exceeded rate limits
- ✅ Implement exponential backoff
- ✅ Consider upgrading your plan

**Request Format:**
- ✅ Verify Content-Type header is set correctly
- ✅ Check that your JSON is valid
- ✅ Ensure required parameters are included

### I'm getting timeout errors. How can I fix this?

**Network Issues:**
- Check your internet connection
- Verify firewall settings
- Try from a different network

**Configuration:**
- Increase timeout values in your client
- Implement retry logic
- Use connection pooling

Example debugging request:

\`\`\`bash
curl -X POST https://api.example.com/v1/endpoint \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"your": "data"}' \\
  -v
\`\`\`

---

## Still Need Help?

If you can't find an answer here:

- 📖 **Documentation**: [Full documentation](../docs)
- 💬 **Community**: [Community forum](https://community.example.com)
- 📧 **Support**: [Contact support](mailto:support@example.com)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/example/issues)
`
  },
  {
    id: 'configuration',
    name: 'Configuration Guide',
    description: 'Detailed configuration options and environment setup',
    icon: React.createElement(IconSettings, { size: 20 }),
    category: 'guide',
    content: (title: string, slug: string) => `---
title: "${title}"
description: "Complete guide to configuration options and environment setup"
type: "guide"
category: "configuration"
difficulty: "intermediate"
tags: ["configuration", "setup", "environment", "options"]
---

# ${title}

This guide covers all configuration options and how to set up your environment properly.

## Environment Setup

### Development Environment

For development, you'll need:

\`\`\`bash
# Install required tools
npm install -g package-manager
git clone https://github.com/example/project.git
cd project
npm install
\`\`\`

### Production Environment

Production requirements:
- Node.js 18+ LTS
- PostgreSQL 14+
- Redis 6+
- SSL certificate
- Load balancer (optional)

## Configuration Files

### Main Configuration

Create \`config/production.yml\`:

\`\`\`yaml
# Application settings
app:
  name: "Your App"
  version: "1.0.0"
  port: 3000
  host: "0.0.0.0"
  
# Database configuration
database:
  host: "localhost"
  port: 5432
  name: "myapp"
  username: "user"
  password: "password"
  
# Redis configuration
redis:
  host: "localhost"
  port: 6379
  password: ""
  db: 0
\`\`\`

### Environment Variables

Create \`.env\` file:

\`\`\`bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp_production
DB_USER=myapp_user
DB_PASSWORD=secure_password_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
JWT_SECRET=your_very_secure_jwt_secret_here

# Application
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
\`\`\`

## Configuration Options

### Application Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| \`app.name\` | string | "App" | Application name |
| \`app.version\` | string | "1.0.0" | Application version |
| \`app.port\` | number | 3000 | Server port |
| \`app.host\` | string | "localhost" | Server host |

### Database Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| \`database.host\` | string | "localhost" | Database host |
| \`database.port\` | number | 5432 | Database port |
| \`database.name\` | string | "myapp" | Database name |

### Security Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| \`auth.jwtSecret\` | string | Required | JWT signing secret |
| \`auth.jwtExpiration\` | string | "1h" | JWT token expiration |

## Best Practices

### Security

- Never commit secrets to version control
- Use environment variables for sensitive data
- Implement configuration validation
- Use encrypted storage for secrets
- Rotate secrets regularly

### Performance

- Use connection pooling
- Implement caching strategies
- Configure appropriate timeouts
- Monitor resource usage
- Use compression for responses

For more details, see our [security guide](../security) and [performance guide](../performance).
`
  },
  {
    id: 'best-practices',
    name: 'Best Practices',
    description: 'Guidelines, conventions, and recommended approaches',
    icon: React.createElement(IconBulb, { size: 20 }),
    category: 'guide',
    content: (title: string, slug: string) => `---
title: "${title}"
description: "Essential best practices, guidelines, and recommended approaches"
type: "guide"
category: "best-practices"
tags: ["best-practices", "guidelines", "conventions", "recommendations"]
---

# ${title}

Follow these best practices to ensure optimal performance, security, and maintainability.

## Code Quality

### General Principles

**SOLID Principles:**
- **Single Responsibility**: Each class/function should have one reason to change
- **Open/Closed**: Open for extension, closed for modification
- **Liskov Substitution**: Objects should be replaceable with instances of their subtypes
- **Interface Segregation**: Many client-specific interfaces are better than one general-purpose interface
- **Dependency Inversion**: Depend upon abstractions, not concretions

**DRY (Don't Repeat Yourself):**
- Extract common functionality into reusable functions
- Use configuration files for repeated values
- Create shared utilities and helpers

**YAGNI (You Aren't Gonna Need It):**
- Don't build features until they're actually needed
- Avoid over-engineering solutions
- Keep implementations simple and focused

### Code Structure

\`\`\`
src/
├── controllers/        # Request handlers
├── services/          # Business logic
├── models/            # Data models
├── utils/             # Utility functions
├── middleware/        # Express middleware
├── config/            # Configuration
├── tests/             # Test files
└── types/             # TypeScript definitions
\`\`\`

### Naming Conventions

**Variables and Functions:**
\`\`\`javascript
// Use camelCase for variables and functions
const userName = 'john_doe';
const fetchUserData = async (userId) => { /* ... */ };

// Use descriptive names
const isUserAuthenticated = checkAuthStatus(user);
const calculateMonthlyRevenue = (orders, month) => { /* ... */ };

// Avoid abbreviations
const userConfiguration = getConfig(); // ✅ Good
const userCfg = getConfig(); // ❌ Avoid
\`\`\`

**Constants:**
\`\`\`javascript
// Use SCREAMING_SNAKE_CASE for constants
const MAX_RETRY_ATTEMPTS = 3;
const API_BASE_URL = 'https://api.example.com';
const DEFAULT_TIMEOUT = 5000;
\`\`\`

## Error Handling

### Structured Error Handling

\`\`\`javascript
// Define custom error classes
class ValidationError extends Error {
  constructor(message, field, value) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.statusCode = 400;
  }
}

// Use consistent error handling patterns
async function getUserById(id) {
  try {
    if (!id) {
      throw new ValidationError('User ID is required', 'id', id);
    }
    
    const user = await database.users.findById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }
    
    return user;
  } catch (error) {
    // Log error with context
    logger.error('Error fetching user', {
      userId: id,
      error: error.message,
      stack: error.stack
    });
    
    // Re-throw to let caller handle
    throw error;
  }
}
\`\`\`

## Security

### Input Validation

\`\`\`javascript
const Joi = require('joi');

// Define validation schemas
const userSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().max(100).required(),
  age: Joi.number().integer().min(18).max(120)
});

// Validate input
function validateUser(userData) {
  const { error, value } = userSchema.validate(userData);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }
  return value;
}
\`\`\`

### Authentication & Authorization

\`\`\`javascript
// JWT middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}
\`\`\`

## Performance

### Database Optimization

\`\`\`javascript
// Use connection pooling
const pool = new Pool({
  host: 'localhost',
  database: 'myapp',
  user: 'username',
  password: 'password',
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Use indexed queries
const getUserByEmail = async (email) => {
  // Ensure email column has an index
  const query = 'SELECT * FROM users WHERE email = $1';
  const result = await pool.query(query, [email]);
  return result.rows[0];
};
\`\`\`

### Caching Strategies

\`\`\`javascript
const Redis = require('redis');
const client = Redis.createClient();

// Cache with TTL
async function cacheSet(key, value, ttlSeconds = 3600) {
  await client.setEx(key, ttlSeconds, JSON.stringify(value));
}

async function cacheGet(key) {
  const cached = await client.get(key);
  return cached ? JSON.parse(cached) : null;
}
\`\`\`

## Testing

### Unit Testing

\`\`\`javascript
const { expect } = require('chai');
const sinon = require('sinon');

describe('UserService', () => {
  let userService;
  let mockDatabase;
  
  beforeEach(() => {
    // Create mocks
    mockDatabase = {
      users: {
        findById: sinon.stub(),
        create: sinon.stub(),
        update: sinon.stub()
      }
    };
    
    userService = new UserService(mockDatabase);
  });
  
  describe('findById', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = '123';
      const expectedUser = { id: userId, name: 'John Doe' };
      mockDatabase.users.findById.resolves(expectedUser);
      
      // Act
      const result = await userService.findById(userId);
      
      // Assert
      expect(result).to.deep.equal(expectedUser);
      expect(mockDatabase.users.findById).to.have.been.calledWith(userId);
    });
  });
});
\`\`\`

## Documentation

### Code Documentation

\`\`\`javascript
/**
 * Calculates the total price including tax
 * @param {number} basePrice - The base price before tax
 * @param {number} taxRate - The tax rate as a decimal (e.g., 0.08 for 8%)
 * @param {Object} options - Additional options
 * @param {boolean} options.roundToNearestCent - Whether to round to nearest cent
 * @returns {number} The total price including tax
 * @throws {ValidationError} When basePrice or taxRate is invalid
 * @example
 * // Calculate price with 8% tax
 * const total = calculateTotalPrice(100, 0.08);
 * console.log(total); // 108
 */
function calculateTotalPrice(basePrice, taxRate, options = {}) {
  if (typeof basePrice !== 'number' || basePrice < 0) {
    throw new ValidationError('Base price must be a non-negative number');
  }
  
  const total = basePrice * (1 + taxRate);
  
  return options.roundToNearestCent 
    ? Math.round(total * 100) / 100 
    : total;
}
\`\`\`

Remember: These practices should be adapted to your specific use case and team requirements. Regular code reviews and continuous improvement are key to maintaining quality standards.
`
  }
];
