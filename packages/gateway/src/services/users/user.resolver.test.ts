import assert from 'node:assert';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Container } from 'typedi';
import { JWTService } from '../../auth/jwt.service';
import { Service as ServiceEntity, ServiceStatus } from '../../entities/service.entity';
import { TestDatabaseManager } from '../../test/test-utils';
import { ConfigurationService } from '../config/configuration.service';
import { SessionService } from '../sessions/session.service';
import { User } from './user.entity';
import { InitialSetupStage, UserResolver } from './user.resolver';

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

describe('UserResolver', () => {
  let userResolver: UserResolver;
  let userRepository: any;
  let sessionService: SessionService;
  let jwtService: JWTService;
  let serviceRepository: any;
  let configurationService: ConfigurationService;

  before(async () => {
    await TestDatabaseManager.setupDatabase();
  });

  after(async () => {
    await TestDatabaseManager.teardownDatabase();
  });

  beforeEach(async () => {
    await TestDatabaseManager.clearDatabase();
    userRepository = await TestDatabaseManager.getRepository(User);
    serviceRepository = await TestDatabaseManager.getRepository(ServiceEntity);
    sessionService = Container.get(SessionService);
    jwtService = Container.get(JWTService);
    configurationService = new ConfigurationService();
    userResolver = new UserResolver(userRepository, sessionService, jwtService, serviceRepository, configurationService);
  });

  describe('initialSetupStatus', () => {
    it('guides through services stage before completion', async () => {
      const initial = await userResolver.initialSetupStatus();
      assert.strictEqual(initial.needsInitialAdmin, true);
      assert.strictEqual(initial.nextStage, InitialSetupStage.ADMIN);

      const context: MockYogaContext = {
        request: {
          headers: new Map([
            ['user-agent', 'jest'],
            ['x-forwarded-for', '127.0.0.1']
          ]),
          ip: '127.0.0.1'
        },
        response: {
          headers: new Map()
        }
      };

      await userResolver.initializeAdminAccount(
        {
          email: 'founder@example.com',
          password: 'Sup3rSecurePass1'
        },
        context as any
      );

      const afterAdmin = await userResolver.initialSetupStatus();
      assert.strictEqual(afterAdmin.needsInitialAdmin, false);
      assert.strictEqual(afterAdmin.nextStage, InitialSetupStage.SETTINGS);

      await configurationService.markInitialSetupStage('settings');
      const afterSettings = await userResolver.initialSetupStatus();
      assert.strictEqual(afterSettings.nextStage, InitialSetupStage.SERVICES);

      const owner = await userRepository.findOneByOrFail({ email: 'founder@example.com' });
      const service = serviceRepository.create({
        name: 'Inventory',
        url: 'https://inventory.local/graphql',
        owner,
        ownerId: owner.id,
        status: ServiceStatus.ACTIVE,
        enableHMAC: true,
        enableBatching: true,
        timeout: 5000,
        useMsgPack: false,
        externally_accessible: true
      });
      await serviceRepository.save(service);

      const afterService = await userResolver.initialSetupStatus();
      assert.strictEqual(afterService.setupComplete, true);
      assert.strictEqual(afterService.nextStage, InitialSetupStage.DONE);
      assert.strictEqual(afterService.lastCompletedStage, InitialSetupStage.DONE);
    });
  });

  describe('initializeAdminAccount', () => {
    it('creates the bootstrap admin only once', async () => {
      const context: MockYogaContext = {
        request: {
          headers: new Map([
            ['user-agent', 'test-agent'],
            ['x-forwarded-for', '192.168.0.1']
          ]),
          ip: '192.168.0.1'
        },
        response: {
          headers: new Map()
        }
      };

      const result = await userResolver.initializeAdminAccount(
        {
          email: 'Founder@Example.com',
          password: 'Sup3rSecurePass1'
        },
        context as any
      );

      assert.ok(result.user);
      assert.strictEqual(result.user.email, 'founder@example.com');
      assert.deepStrictEqual(result.user.permissions.sort(), ['admin', 'user']);
      assert.ok(result.tokens);
      assert.ok(result.tokens.accessToken);
      assert.ok(result.sessionId);

      const usersInDb = await userRepository.find();
      assert.strictEqual(usersInDb.length, 1);
      assert.strictEqual(usersInDb[0].email, 'founder@example.com');

      const setupState = await configurationService.getInitialSetupState();
      assert.strictEqual(setupState.lastStep, 'admin');
      assert.strictEqual(setupState.completed, false);

      await assert.rejects(
        () =>
          userResolver.initializeAdminAccount(
            {
              email: 'second@example.com',
              password: 'An0therSecurePass!'
            },
            context as any
          ),
        /Initial admin already exists/
      );

      const finalCount = await userRepository.count();
      assert.strictEqual(finalCount, 1);
    });
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
      const dbUser = await userRepository.findOne({
        where: { email: userData.email }
      });
      assert.ok(dbUser);
      assert.strictEqual(dbUser.email, userData.email);
    });

    it('should respect provided permissions and verification flag', async () => {
      const userData = {
        email: 'AdminUser@Example.com ',
        password: 'password123',
        permissions: ['ADMIN', 'user', ''],
        isEmailVerified: true
      } as any;

      const user = await userResolver.createUser(userData);

      assert.ok(user.id);
      assert.strictEqual(user.email, 'adminuser@example.com');
      assert.deepStrictEqual(user.permissions.sort(), ['admin', 'user']);
      assert.strictEqual(user.isEmailVerified, true);

      const dbUser = await userRepository.findOne({
        where: { email: 'adminuser@example.com' }
      });
      assert.ok(dbUser);
      assert.strictEqual(dbUser.isEmailVerified, true);
      assert.deepStrictEqual(dbUser.permissions.sort(), ['admin', 'user']);
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
      const updatedUser = await userRepository.findOne({
        where: { email: loginData.email }
      });
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
      const user = await userRepository.findOne({
        where: { email: loginData.email }
      });
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

      const lockedUser = await userRepository.findOne({
        where: { email: loginData.email }
      });
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
      const updatedUser = await userRepository.findOne({
        where: { email: loginData.email }
      });
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
      const testUser = await userRepository.findOne({
        where: { email: 'user1@example.com' }
      });

      const mockContext: MockYogaContext = {
        user: { id: 'some-id', permissions: ['user'] }
      };

      const user = await userResolver.user(testUser.id, mockContext as any);

      assert.ok(user);
      assert.strictEqual(user.email, 'user1@example.com');
    });

    it('should return current user with me query', async () => {
      const testUser = await userRepository.findOne({
        where: { email: 'user1@example.com' }
      });

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
