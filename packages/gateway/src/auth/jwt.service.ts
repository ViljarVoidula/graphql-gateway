import * as jwt from 'jsonwebtoken';
import { Service } from 'typedi';

export interface JWTPayload {
  userId: string;
  email: string;
  permissions: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

@Service()
export class JWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'access-secret-change-in-production';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refresh-secret-change-in-production';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m'; // 15 minutes
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d'; // 7 days
  }

  generateTokens(payload: Omit<JWTPayload, 'iat' | 'exp'>): AuthTokens {
    try {
      const accessPayload = {
        userId: payload.userId,
        email: payload.email,
        permissions: payload.permissions,
        sessionId: payload.sessionId
      };

      const accessToken = jwt.sign(accessPayload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry,
        issuer: 'gateway',
        audience: 'gateway-client'
      } as jwt.SignOptions);

      const refreshPayload = {
        userId: payload.userId, 
        sessionId: payload.sessionId
      };

      const refreshToken = jwt.sign(refreshPayload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'gateway',
        audience: 'gateway-client'
      } as jwt.SignOptions);

      // Calculate expiry time in seconds
      const decoded = jwt.decode(accessToken) as any;
      const expiresIn = decoded.exp - decoded.iat;

      return {
        accessToken,
        refreshToken,
        expiresIn,
        tokenType: 'Bearer'
      };
    } catch (error) {
      console.error('Token generation failed:', error);
      throw new Error('Failed to generate tokens');
    }
  }

  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const payload = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'gateway',
        audience: 'gateway-client'
      }) as JWTPayload;
      return payload;
    } catch (error) {
      console.error('JWT verification failed:', error);
      return null;
    }
  }

  verifyRefreshToken(token: string): { userId: string; sessionId: string } | null {
    try {
      const payload = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'gateway',
        audience: 'gateway-client'
      }) as { userId: string; sessionId: string };
      return payload;
    } catch (error) {
      console.error('Refresh token verification failed:', error);
      return null;
    }
  }

  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }

  generateSessionToken(sessionId: string): string {
    return jwt.sign(
      { sessionId, type: 'session' },
      this.accessTokenSecret,
      { expiresIn: '24h' }
    );
  }

  verifySessionToken(token: string): { sessionId: string } | null {
    try {
      const payload = jwt.verify(token, this.accessTokenSecret) as any;
      if (payload.type === 'session') {
        return { sessionId: payload.sessionId };
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}
