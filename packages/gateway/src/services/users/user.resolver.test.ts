import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { Container } from 'typedi';
import { JWTService } from '../../auth/jwt.service';
import { describeWithDatabase, TestDatabaseManager } from '../../test/test-utils';
import { SessionService } from '../sessions/session.service';
import { User } from './user.entity';
import { UserResolver } from './user.resolver';

interface MockYogaContext {
  user?: any;
  request?: {
    headers?: Map<string, string>;
    ip?: string;
    socket?: { remoteAddress?: string };
  };
  response?: {
    headers?: Map<string, string>;
  };
}

describeWithDatabase('UserResolver', () => {
  let userResolver: UserResolver;
  let userRepository: any;
  let sessionService: SessionService;
  let jwtService: JWTService;

  beforeEach(() => {
    userRepository = TestDatabaseManager.getRepository(User);
    sessionService = Container.get(SessionService);
    jwtService = Container.get(JWTService);
    userResolver = new UserResolver(userRepository, sessionService, jwtService);
  });

  describe('createUser', () => {
    it('should create a new user with hashed password', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const user = await userResolver.createUser(userData);

      assert.ok(user.id);
      assert.strictEqual(user.email, userData.email);
      assert.notStrictEqual(user.password, userData.password); // Should be hashed
      assert.deepStrictEqual(user.permissions, ['user']); // Default permission
      assert.ok(user.createdAt);

      // Verify user exists in database
      const dbUser = await userRepository.findOne({ where: { email: userData.email } });
      assert.ok(dbUser);
      assert.strictEqual(dbUser.email, userData.email);
    });

    it('should throw error for duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };

      await userResolver.createUser(userData);

      await assert.rejects(() => userResolver.createUser(userData), /User with this email already exists/);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create a test user for login tests - let the entity handle password hashing
      await userRepository.save(
        userRepository.create({
          email: 'test@example.com',
          password: 'password123', // Plain text - will be hashed by @BeforeInsert
          permissions: ['user'],
          failedLoginAttempts: 0
        })
      );
    });

    it('should login user with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockContext: MockYogaContext = {
        request: {
          headers: new Map([['user-agent', 'test-agent']]),
          ip: '127.0.0.1'
        },
        response: {
          headers: new Map()
        }
      };

      const result = await userResolver.login(loginData, mockContext as any);

      assert.ok(result.user);
      assert.strictEqual(result.user.email, loginData.email);
      assert.ok(result.tokens);
      assert.ok(result.tokens.accessToken);
      assert.ok(result.tokens.refreshToken);
      assert.strictEqual(result.tokens.tokenType, 'Bearer');
      assert.ok(result.sessionId);

      // Verify JWT token is valid
      const payload = jwtService.verifyAccessToken(result.tokens.accessToken);
      assert.ok(payload);
      assert.strictEqual(payload.userId, result.user.id);
      assert.strictEqual(payload.email, result.user.email);

      // Verify user login stats were updated
      const updatedUser = await userRepository.findOne({ where: { email: loginData.email } });
      assert.strictEqual(updatedUser.failedLoginAttempts, 0);
      assert.ok(updatedUser.lastLoginAt);
    });

    it('should reject invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const mockContext: MockYogaContext = {
        request: {
          headers: new Map(),
          ip: '127.0.0.1'
        }
      };

      await assert.rejects(() => userResolver.login(loginData, mockContext as any), /Invalid email or password/);

      // Verify failed attempt was recorded
      const user = await userRepository.findOne({ where: { email: loginData.email } });
      assert.strictEqual(user.failedLoginAttempts, 1);
    });

    it('should reject login for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const mockContext: MockYogaContext = {
        request: {
          headers: new Map(),
          ip: '127.0.0.1'
        }
      };

      await assert.rejects(() => userResolver.login(loginData, mockContext as any), /Invalid email or password/);
    });

    it('should lock user after 5 failed attempts', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const mockContext: MockYogaContext = {
        request: {
          headers: new Map(),
          ip: '127.0.0.1'
        }
      };

      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        try {
          await userResolver.login(loginData, mockContext as any);
        } catch (error) {
          // Expected to fail
        }
      }

      const lockedUser = await userRepository.findOne({ where: { email: loginData.email } });
      assert.strictEqual(lockedUser.failedLoginAttempts, 5);
      assert.ok(lockedUser.lockedUntil);
      assert.ok(lockedUser.lockedUntil > new Date());
      assert.strictEqual(lockedUser.isLocked, true);

      // Try to login with correct password - should still be rejected
      const correctLoginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      await assert.rejects(() => userResolver.login(correctLoginData, mockContext as any), /Account is temporarily locked/);
    });

    it('should reset failed attempts on successful login', async () => {
      // Set up user with failed attempts using update to avoid password re-hashing
      await userRepository.update({ email: 'test@example.com' }, { failedLoginAttempts: 3 });

      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockContext: MockYogaContext = {
        request: {
          headers: new Map([['user-agent', 'test-agent']]),
          ip: '127.0.0.1'
        },
        response: {
          headers: new Map()
        }
      };

      const result = await userResolver.login(loginData, mockContext as any);

      assert.ok(result.user);

      // Verify failed attempts were reset
      const updatedUser = await userRepository.findOne({ where: { email: loginData.email } });
      assert.strictEqual(updatedUser.failedLoginAttempts, 0);
      assert.strictEqual(updatedUser.lockedUntil, null);
    });
  });

  describe('user queries', () => {
    beforeEach(async () => {
      // Create test users - let the entity handle password hashing
      await userRepository.save([
        userRepository.create({
          email: 'user1@example.com',
          password: 'password123', // Plain text - will be hashed by @BeforeInsert
          permissions: ['user']
        }),
        userRepository.create({
          email: 'admin@example.com',
          password: 'password123', // Plain text - will be hashed by @BeforeInsert
          permissions: ['user', 'admin']
        })
      ]);
    });

    it('should return all users', async () => {
      const mockContext: MockYogaContext = {
        user: { id: 'admin-id', permissions: ['admin'] }
      };

      const users = await userResolver.users(mockContext as any);

      assert.strictEqual(users.length, 2);
      assert.ok(users.find((u) => u.email === 'user1@example.com'));
      assert.ok(users.find((u) => u.email === 'admin@example.com'));
    });

    it('should return specific user by id', async () => {
      const testUser = await userRepository.findOne({ where: { email: 'user1@example.com' } });

      const mockContext: MockYogaContext = {
        user: { id: 'some-id', permissions: ['user'] }
      };

      const user = await userResolver.user(testUser.id, mockContext as any);

      assert.ok(user);
      assert.strictEqual(user.email, 'user1@example.com');
    });

    it('should return current user with me query', async () => {
      const testUser = await userRepository.findOne({ where: { email: 'user1@example.com' } });

      const mockContext: MockYogaContext = {
        user: { id: testUser.id, permissions: ['user'] }
      };

      const user = await userResolver.me(mockContext as any);

      assert.ok(user);
      assert.strictEqual(user.email, 'user1@example.com');
      assert.strictEqual(user.id, testUser.id);
    });

    it('should return null for me query when not authenticated', async () => {
      const mockContext: MockYogaContext = {};

      const user = await userResolver.me(mockContext as any);

      assert.strictEqual(user, null);
    });
  });

  describe('password comparison', () => {
    it('should correctly compare passwords using entity method', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const user = await userResolver.createUser(userData);

      // Test correct password
      const isCorrect = await user.comparePassword('password123');
      assert.strictEqual(isCorrect, true);

      // Test incorrect password
      const isIncorrect = await user.comparePassword('wrongpassword');
      assert.strictEqual(isIncorrect, false);
    });
  });
});
