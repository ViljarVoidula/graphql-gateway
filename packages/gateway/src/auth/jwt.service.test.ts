import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JWTService } from './jwt.service';

describe('JWTService', () => {
  let jwtService: JWTService;

  beforeEach(() => {
    jwtService = new JWTService();
  });

  describe('generateTokens', () => {
    it('should generate valid access and refresh tokens', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user'],
        sessionId: 'session-123'
      };

      const tokens = jwtService.generateTokens(payload);

      assert.ok(tokens.accessToken);
      assert.ok(tokens.refreshToken);
      assert.strictEqual(tokens.tokenType, 'Bearer');
      assert.ok(tokens.expiresIn > 0);
    });

    it('should calculate correct expiry time', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user'],
        sessionId: 'session-123'
      };

      const tokens = jwtService.generateTokens(payload);
      
      // Should be approximately 15 minutes (900 seconds) based on default expiry
      assert.ok(tokens.expiresIn > 800);
      assert.ok(tokens.expiresIn < 1000);
    });

    it('should generate tokens even with empty values', () => {
      const payloadWithEmptyValues = {
        userId: '',
        email: '',
        permissions: [],
        sessionId: ''
      };

      const tokens = jwtService.generateTokens(payloadWithEmptyValues);

      assert.ok(tokens.accessToken);
      assert.ok(tokens.refreshToken);
      assert.strictEqual(tokens.tokenType, 'Bearer');
      assert.ok(tokens.expiresIn > 0);
      
      // Verify the tokens can be decoded and contain the empty values
      const verified = jwtService.verifyAccessToken(tokens.accessToken);
      assert.ok(verified);
      assert.strictEqual(verified.userId, '');
      assert.strictEqual(verified.email, '');
      assert.deepStrictEqual(verified.permissions, []);
    });

    it('should throw error when JWT signing fails', () => {
      // Create a service with invalid secret to force JWT signing to fail
      const invalidJwtService = new (class extends JWTService {
        constructor() {
          super();
          // Override the secret with an invalid value that causes JWT to fail
          (this as any).accessTokenSecret = null;
        }
      })();

      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user'],
        sessionId: 'session-123'
      };

      assert.throws(
        () => invalidJwtService.generateTokens(payload),
        /Failed to generate tokens/
      );
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user'],
        sessionId: 'session-123'
      };

      const tokens = jwtService.generateTokens(payload);
      const verified = jwtService.verifyAccessToken(tokens.accessToken);

      assert.ok(verified);
      assert.strictEqual(verified.userId, payload.userId);
      assert.strictEqual(verified.email, payload.email);
      assert.deepStrictEqual(verified.permissions, payload.permissions);
      assert.strictEqual(verified.sessionId, payload.sessionId);
    });

    it('should return null for invalid token', () => {
      const verified = jwtService.verifyAccessToken('invalid-token');
      assert.strictEqual(verified, null);
    });

    it('should return null for token with wrong secret', () => {
      const malformedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0In0.wrong-signature';
      const verified = jwtService.verifyAccessToken(malformedToken);
      assert.strictEqual(verified, null);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user'],
        sessionId: 'session-123'
      };

      const tokens = jwtService.generateTokens(payload);
      const verified = jwtService.verifyRefreshToken(tokens.refreshToken);

      assert.ok(verified);
      assert.strictEqual(verified.userId, payload.userId);
      assert.strictEqual(verified.sessionId, payload.sessionId);
      // Refresh token should not contain email or permissions
      assert.strictEqual((verified as any).email, undefined);
    });

    it('should return null for invalid refresh token', () => {
      const verified = jwtService.verifyRefreshToken('invalid-token');
      assert.strictEqual(verified, null);
    });

    it('should return null for access token used as refresh token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user'],
        sessionId: 'session-123'
      };

      const tokens = jwtService.generateTokens(payload);
      // Try to verify access token with refresh token method
      const verified = jwtService.verifyRefreshToken(tokens.accessToken);
      assert.strictEqual(verified, null);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'valid-jwt-token';
      const header = `Bearer ${token}`;
      
      const extracted = jwtService.extractTokenFromHeader(header);
      assert.strictEqual(extracted, token);
    });

    it('should return null for invalid header formats', () => {
      const invalidHeaders = [
        'invalid-header',
        'Basic token',
        'Bearer',
        'Bearer token extra parts',
        'bearer token', // lowercase
        'Token token',
        '',
        undefined
      ];

      invalidHeaders.forEach(header => {
        const extracted = jwtService.extractTokenFromHeader(header);
        assert.strictEqual(extracted, null, `Should return null for: ${header}`);
      });
    });
  });

  describe('generateSessionToken', () => {
    it('should generate session token with correct format', () => {
      const sessionId = 'session-123';
      const token = jwtService.generateSessionToken(sessionId);
      
      assert.ok(token);
      assert.ok(typeof token === 'string');
      assert.ok(token.includes('.'));
      
      // Should be able to verify it
      const verified = jwtService.verifySessionToken(token);
      assert.ok(verified);
      assert.strictEqual(verified.sessionId, sessionId);
    });

    it('should generate different tokens for different sessions', () => {
      const token1 = jwtService.generateSessionToken('session-1');
      const token2 = jwtService.generateSessionToken('session-2');
      
      assert.notStrictEqual(token1, token2);
    });
  });

  describe('verifySessionToken', () => {
    it('should verify valid session token', () => {
      const sessionId = 'session-123';
      const token = jwtService.generateSessionToken(sessionId);
      const verified = jwtService.verifySessionToken(token);

      assert.ok(verified);
      assert.strictEqual(verified.sessionId, sessionId);
    });

    it('should return null for invalid session token', () => {
      const verified = jwtService.verifySessionToken('invalid-token');
      assert.strictEqual(verified, null);
    });

    it('should return null for access token used as session token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user'],
        sessionId: 'session-123'
      };

      const tokens = jwtService.generateTokens(payload);
      const verified = jwtService.verifySessionToken(tokens.accessToken);
      
      assert.strictEqual(verified, null);
    });

    it('should return null for refresh token used as session token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user'],
        sessionId: 'session-123'
      };

      const tokens = jwtService.generateTokens(payload);
      const verified = jwtService.verifySessionToken(tokens.refreshToken);
      
      assert.strictEqual(verified, null);
    });
  });

  describe('token integration', () => {
    it('should handle complete token lifecycle', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['user', 'admin'],
        sessionId: 'session-123'
      };

      // Generate tokens
      const tokens = jwtService.generateTokens(payload);
      
      // Verify access token
      const accessPayload = jwtService.verifyAccessToken(tokens.accessToken);
      assert.ok(accessPayload);
      assert.strictEqual(accessPayload.userId, payload.userId);
      assert.strictEqual(accessPayload.email, payload.email);
      assert.deepStrictEqual(accessPayload.permissions, payload.permissions);
      
      // Verify refresh token
      const refreshPayload = jwtService.verifyRefreshToken(tokens.refreshToken);
      assert.ok(refreshPayload);
      assert.strictEqual(refreshPayload.userId, payload.userId);
      assert.strictEqual(refreshPayload.sessionId, payload.sessionId);
      
      // Generate and verify session token
      const sessionToken = jwtService.generateSessionToken(payload.sessionId);
      const sessionPayload = jwtService.verifySessionToken(sessionToken);
      assert.ok(sessionPayload);
      assert.strictEqual(sessionPayload.sessionId, payload.sessionId);
    });
  });
});
