import * as bcrypt from 'bcrypt';
import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { Session } from '../../entities/session.entity';
import { describeWithDatabase, TestDatabaseManager } from '../../test/test-utils';
import { SessionService } from '../sessions/session.service';
import { User } from '../users/user.entity';

describeWithDatabase('SessionService', () => {
  let sessionService: SessionService;
  let sessionRepository: any;
  let userRepository: any;
  let testUser: User;

  beforeEach(async () => {
    sessionRepository = TestDatabaseManager.getRepository(Session);
    userRepository = TestDatabaseManager.getRepository(User);
    sessionService = new SessionService(sessionRepository, userRepository);

    // Create a test user for session tests
    const hashedPassword = await bcrypt.hash('password123', 12);
    testUser = await userRepository.save(
      userRepository.create({
        email: 'session-test@example.com',
        password: hashedPassword,
        permissions: ['user']
      })
    );
  });

  describe('createSession', () => {
    it('should create a new session with valid data', async () => {
      const sessionId = 'test-session-123';
      const ipAddress = '192.168.1.1';
      const userAgent = 'Mozilla/5.0 Test Browser';

      const session = await sessionService.createSession(testUser.id, sessionId, ipAddress, userAgent);

      assert.ok(session.id);
      assert.strictEqual(session.userId, testUser.id);
      assert.strictEqual(session.sessionId, sessionId);
      assert.strictEqual(session.ipAddress, ipAddress);
      assert.strictEqual(session.userAgent, userAgent);
      assert.strictEqual(session.isActive, true);
      assert.ok(session.expiresAt);
      assert.ok(session.createdAt);

      // Verify session exists in database
      const dbSession = await sessionRepository.findOne({ where: { sessionId } });
      assert.ok(dbSession);
      assert.strictEqual(dbSession.userId, testUser.id);
    });

    it('should create session without optional fields', async () => {
      const sessionId = 'test-session-456';

      const session = await sessionService.createSession(testUser.id, sessionId);

      assert.ok(session.id);
      assert.strictEqual(session.userId, testUser.id);
      assert.strictEqual(session.sessionId, sessionId);
      assert.strictEqual(session.ipAddress, null);
      assert.strictEqual(session.userAgent, undefined);
      assert.strictEqual(session.isActive, true);
    });

    it('should sanitize IP addresses correctly', async () => {
      const testCases = [
        { input: '192.168.1.1', expected: '192.168.1.1' },
        { input: '10.0.0.1, 192.168.1.1', expected: '10.0.0.1' },
        { input: 'unknown', expected: null },
        { input: 'invalid-ip', expected: null },
        { input: '', expected: null },
        { input: undefined, expected: null }
      ];

      for (const testCase of testCases) {
        const sessionId = `test-session-${Math.random()}`;
        const session = await sessionService.createSession(testUser.id, sessionId, testCase.input);

        assert.strictEqual(session.ipAddress, testCase.expected, `Failed for input: ${testCase.input}`);
      }
    });

    it('should set expiration time to 24 hours from now', async () => {
      const sessionId = 'test-session-expiry';
      const beforeCreate = new Date();

      const session = await sessionService.createSession(testUser.id, sessionId);

      const afterCreate = new Date();
      const expectedExpiry = new Date(beforeCreate.getTime() + 24 * 60 * 60 * 1000);
      const maxExpectedExpiry = new Date(afterCreate.getTime() + 24 * 60 * 60 * 1000);

      assert.ok(session.expiresAt >= expectedExpiry);
      assert.ok(session.expiresAt <= maxExpectedExpiry);
    });
  });

  describe('findActiveSession', () => {
    let activeSession: Session;
    let inactiveSession: Session;

    beforeEach(async () => {
      // Create active session
      activeSession = await sessionService.createSession(testUser.id, 'active-session-123', '192.168.1.1', 'Test Browser');

      // Create inactive session
      inactiveSession = await sessionRepository.save(
        sessionRepository.create({
          userId: testUser.id,
          sessionId: 'inactive-session-456',
          ipAddress: '192.168.1.2',
          userAgent: 'Test Browser',
          isActive: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        })
      );
    });

    it('should find active session by sessionId', async () => {
      const session = await sessionService.findActiveSession('active-session-123');

      assert.ok(session);
      assert.strictEqual(session.sessionId, 'active-session-123');
      assert.strictEqual(session.isActive, true);
      assert.strictEqual(session.userId, testUser.id);
    });

    it('should not find inactive session', async () => {
      const session = await sessionService.findActiveSession('inactive-session-456');

      assert.strictEqual(session, null);
    });

    it('should return null for non-existent session', async () => {
      const session = await sessionService.findActiveSession('non-existent-session');

      assert.strictEqual(session, null);
    });

    it('should include user relation when found', async () => {
      const session = await sessionService.findActiveSession('active-session-123');

      assert.ok(session);
      assert.ok(session.user);
      assert.strictEqual(session.user.id, testUser.id);
      assert.strictEqual(session.user.email, testUser.email);
    });
  });

  describe('invalidateSession', () => {
    let testSession: Session;

    beforeEach(async () => {
      testSession = await sessionService.createSession(testUser.id, 'test-session-invalidate', '192.168.1.1', 'Test Browser');
    });

    it('should invalidate session by sessionId', async () => {
      await sessionService.invalidateSession('test-session-invalidate');

      // Verify session is no longer active
      const session = await sessionService.findActiveSession('test-session-invalidate');
      assert.strictEqual(session, null);

      // Verify session still exists but is inactive
      const inactiveSession = await sessionRepository.findOne({
        where: { sessionId: 'test-session-invalidate' }
      });
      assert.ok(inactiveSession);
      assert.strictEqual(inactiveSession.isActive, false);
    });

    it('should handle invalidating non-existent session gracefully', async () => {
      // Should not throw an error
      await sessionService.invalidateSession('non-existent-session');

      // Original session should still be active
      const session = await sessionService.findActiveSession('test-session-invalidate');
      assert.ok(session);
      assert.strictEqual(session.isActive, true);
    });
  });

  describe('invalidateAllUserSessions', () => {
    beforeEach(async () => {
      // Create multiple sessions for the test user
      await sessionService.createSession(testUser.id, 'session-1', '192.168.1.1', 'Browser 1');
      await sessionService.createSession(testUser.id, 'session-2', '192.168.1.2', 'Browser 2');

      // Create session for different user
      const otherUser = await userRepository.save(
        userRepository.create({
          email: 'other-user@example.com',
          password: await bcrypt.hash('password123', 12),
          permissions: ['user']
        })
      );
      await sessionService.createSession(otherUser.id, 'other-user-session', '192.168.1.3', 'Browser 3');
    });

    it('should invalidate all sessions for a specific user', async () => {
      await sessionService.invalidateAllUserSessions(testUser.id);

      // Verify test user sessions are inactive
      const session1 = await sessionService.findActiveSession('session-1');
      const session2 = await sessionService.findActiveSession('session-2');
      assert.strictEqual(session1, null);
      assert.strictEqual(session2, null);

      // Verify other user session is still active
      const otherSession = await sessionService.findActiveSession('other-user-session');
      assert.ok(otherSession);
      assert.strictEqual(otherSession.isActive, true);
    });
  });

  describe('getUserActiveSessions', () => {
    beforeEach(async () => {
      // Create multiple sessions for the test user
      await sessionService.createSession(testUser.id, 'session-1', '192.168.1.1', 'Browser 1');
      await sessionService.createSession(testUser.id, 'session-2', '192.168.1.2', 'Browser 2');

      // Create inactive session
      await sessionRepository.save(
        sessionRepository.create({
          userId: testUser.id,
          sessionId: 'inactive-session',
          ipAddress: '192.168.1.3',
          userAgent: 'Browser 3',
          isActive: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        })
      );

      // Create session for different user
      const otherUser = await userRepository.save(
        userRepository.create({
          email: 'other-user@example.com',
          password: await bcrypt.hash('password123', 12),
          permissions: ['user']
        })
      );
      await sessionService.createSession(otherUser.id, 'other-user-session', '192.168.1.4', 'Browser 4');
    });

    it('should return only active sessions for the user', async () => {
      const sessions = await sessionService.getUserActiveSessions(testUser.id);

      assert.strictEqual(sessions.length, 2);
      assert.ok(sessions.find((s) => s.sessionId === 'session-1'));
      assert.ok(sessions.find((s) => s.sessionId === 'session-2'));
      assert.ok(!sessions.find((s) => s.sessionId === 'inactive-session'));
      assert.ok(!sessions.find((s) => s.sessionId === 'other-user-session'));

      // All returned sessions should be active
      sessions.forEach((session) => {
        assert.strictEqual(session.isActive, true);
        assert.strictEqual(session.userId, testUser.id);
      });
    });

    it('should return empty array for user with no sessions', async () => {
      const newUser = await userRepository.save(
        userRepository.create({
          email: 'no-sessions@example.com',
          password: await bcrypt.hash('password123', 12),
          permissions: ['user']
        })
      );

      const sessions = await sessionService.getUserActiveSessions(newUser.id);

      assert.strictEqual(sessions.length, 0);
    });
  });

  describe('updateSessionActivity', () => {
    let testSession: Session;

    beforeEach(async () => {
      testSession = await sessionService.createSession(testUser.id, 'test-session-activity', '192.168.1.1', 'Test Browser');
    });

    it('should update session last activity', async () => {
      const originalActivity = testSession.lastActivity;

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await sessionService.updateSessionActivity('test-session-activity');

      // Fetch updated session
      const updatedSession = await sessionRepository.findOne({
        where: { sessionId: 'test-session-activity' }
      });

      assert.ok(updatedSession);
      assert.ok(updatedSession.lastActivity > originalActivity);
    });

    it('should handle updating non-existent session gracefully', async () => {
      // Should not throw an error
      await sessionService.updateSessionActivity('non-existent-session');
    });
  });

  describe('cleanupExpiredSessions', () => {
    beforeEach(async () => {
      const now = new Date();

      // Create expired session
      await sessionRepository.save(
        sessionRepository.create({
          userId: testUser.id,
          sessionId: 'expired-session',
          ipAddress: '192.168.1.1',
          userAgent: 'Browser',
          isActive: true,
          expiresAt: new Date(now.getTime() - 1000) // 1 second ago
        })
      );

      // Create valid session
      await sessionService.createSession(testUser.id, 'valid-session', '192.168.1.2', 'Browser');
    });

    it('should remove expired sessions', async () => {
      await sessionService.cleanupExpiredSessions();

      // Verify expired session is removed
      const expiredSession = await sessionRepository.findOne({
        where: { sessionId: 'expired-session' }
      });
      assert.strictEqual(expiredSession, null);

      // Verify valid session still exists
      const validSession = await sessionService.findActiveSession('valid-session');
      assert.ok(validSession);
      assert.strictEqual(validSession.isActive, true);
    });
  });
});
