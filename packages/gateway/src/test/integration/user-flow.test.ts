import { createYoga } from 'graphql-yoga';
import assert from 'node:assert';
import { after, before, beforeEach, describe, it } from 'node:test';
import { buildSchema } from 'type-graphql';
import { Container } from 'typedi';
import { UserResolver } from '../../services/users/user.resolver';
import { TestDatabaseManager } from '../test-utils';

describe('User Integration Flow', () => {
  let yoga: any;

  before(async () => {
    await TestDatabaseManager.setupDatabase();
  });

  after(async () => {
    await TestDatabaseManager.teardownDatabase();
  });

  beforeEach(async () => {
    await TestDatabaseManager.clearDatabase();
    // Build GraphQL schema with UserResolver
    const schema = await buildSchema({
      resolvers: [UserResolver],
      container: Container,
      authChecker: () => true, // Disable auth for tests
    });

    yoga = createYoga({
      schema,
      logging: false, // Disable logging in tests
    });
  });

  it('should handle complete user registration and login flow', async () => {
    // Test user creation
    const createUserMutation = `
      mutation CreateUser($data: UserInput!) {
        createUser(data: $data) {
          id
          email
          permissions
          createdAt
        }
      }
    `;

    const createUserVariables = {
      data: {
        email: 'integration@example.com',
        password: 'password123',
      },
    };

    const createUserResponse = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: createUserMutation,
        variables: createUserVariables,
      }),
    });

    const createUserResult = await createUserResponse.json();

    assert.ok(
      !createUserResult.errors,
      `GraphQL errors: ${JSON.stringify(createUserResult.errors)}`
    );
    assert.ok(createUserResult.data.createUser);
    assert.strictEqual(
      createUserResult.data.createUser.email,
      'integration@example.com'
    );
    assert.deepStrictEqual(createUserResult.data.createUser.permissions, [
      'user',
    ]);

    // Test login with created credentials
    const loginMutation = `
      mutation Login($data: LoginInput!) {
        login(data: $data) {
          user {
            id
            email
            permissions
          }
          tokens {
            accessToken
            refreshToken
            tokenType
            expiresIn
          }
          sessionId
        }
      }
    `;

    const loginVariables = {
      data: {
        email: 'integration@example.com',
        password: 'password123',
      },
    };

    const loginResponse = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: loginMutation,
        variables: loginVariables,
      }),
    });

    const loginResult = await loginResponse.json();

    assert.ok(
      !loginResult.errors,
      `GraphQL errors: ${JSON.stringify(loginResult.errors)}`
    );
    assert.ok(loginResult.data.login.user);
    assert.strictEqual(
      loginResult.data.login.user.email,
      'integration@example.com'
    );
    assert.ok(loginResult.data.login.tokens);
    assert.ok(loginResult.data.login.tokens.accessToken);
    assert.ok(loginResult.data.login.tokens.refreshToken);
    assert.strictEqual(loginResult.data.login.tokens.tokenType, 'Bearer');
    assert.ok(loginResult.data.login.sessionId);

    // Test that we can query users (this would require admin permissions in real app)
    const usersQuery = `
      query Users {
        users {
          id
          email
          permissions
        }
      }
    `;

    const usersResponse = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: usersQuery,
      }),
    });

    const usersResult = await usersResponse.json();

    assert.ok(
      !usersResult.errors,
      `GraphQL errors: ${JSON.stringify(usersResult.errors)}`
    );
    assert.ok(usersResult.data.users);
    assert.strictEqual(usersResult.data.users.length, 1);
    assert.strictEqual(
      usersResult.data.users[0].email,
      'integration@example.com'
    );
  });

  it('should handle validation errors properly', async () => {
    // Test duplicate email registration
    const createUserMutation = `
      mutation CreateUser($data: UserInput!) {
        createUser(data: $data) {
          id
          email
        }
      }
    `;

    const userData = {
      data: {
        email: 'duplicate@example.com',
        password: 'password123',
      },
    };

    // Create first user
    await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: createUserMutation,
        variables: userData,
      }),
    });

    // Try to create duplicate user
    const duplicateResponse = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: createUserMutation,
        variables: userData,
      }),
    });

    const duplicateResult = await duplicateResponse.json();

    assert.ok(duplicateResult.errors);
    assert.ok(
      duplicateResult.errors[0].message.includes(
        'User with this email already exists'
      )
    );
  });

  it('should handle authentication errors', async () => {
    // Test login with invalid credentials
    const loginMutation = `
      mutation Login($data: LoginInput!) {
        login(data: $data) {
          user {
            id
            email
          }
          tokens {
            accessToken
          }
        }
      }
    `;

    const invalidLoginData = {
      data: {
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      },
    };

    const loginResponse = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: loginMutation,
        variables: invalidLoginData,
      }),
    });

    const loginResult = await loginResponse.json();

    assert.ok(loginResult.errors);
    assert.ok(
      loginResult.errors[0].message.includes('Invalid email or password')
    );
  });
});
