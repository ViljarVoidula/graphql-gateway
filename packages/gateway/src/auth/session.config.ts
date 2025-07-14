import { YogaInitialContext } from 'graphql-yoga';
import { createClient } from 'redis';
import { log } from '../utils/logger';

export interface SessionData {
  userId: string;
  email: string;
  isAuthenticated: boolean;
  loginTime: Date;
  lastActivity: Date;
  permissions: string[];
}

export interface YogaContext extends YogaInitialContext {
  session: SessionData | null;
  user: {
    id: string;
    email: string;
    permissions: string[];
  } | null;
  sessionId: string | null;
}

// Redis client for session storage
export const redisClient: any = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

export const SESSION_COOKIE_NAME = 'gateway-session';
export const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function initializeRedis() {
  try {
    await redisClient.connect();
    log.debug('Redis connected for session storage');
  } catch (error) {
    log.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export async function createSessionId(): Promise<string> {
  const crypto = await import('crypto');
  return crypto.randomBytes(32).toString('hex');
}

export async function saveSession(sessionId: string, data: SessionData): Promise<void> {
  const sessionKey = `session:${sessionId}`;
  const serializedData = JSON.stringify({
    ...data,
    loginTime: data.loginTime.toISOString(),
    lastActivity: data.lastActivity.toISOString()
  });

  await redisClient.setEx(
    sessionKey,
    SESSION_DURATION / 1000, // Redis expects seconds
    serializedData
  );
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  try {
    const sessionKey = `session:${sessionId}`;
    const data = await redisClient.get(sessionKey);

    if (!data) return null;

    const dataString = typeof data === 'string' ? data : data.toString();
    const parsed = JSON.parse(dataString);
    return {
      ...parsed,
      loginTime: new Date(parsed.loginTime),
      lastActivity: new Date(parsed.lastActivity)
    };
  } catch (error) {
    log.error('Error getting session:', error);
    return null;
  }
}

export async function updateSessionActivity(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (session) {
    session.lastActivity = new Date();
    await saveSession(sessionId, session);
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sessionKey = `session:${sessionId}`;
  await redisClient.del(sessionKey);
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  const keys = await redisClient.keys('session:*');
  const pipeline = redisClient.multi();

  for (const key of keys) {
    const sessionData = await redisClient.get(key);
    if (sessionData) {
      try {
        const dataString = typeof sessionData === 'string' ? sessionData : sessionData.toString();
        const data = JSON.parse(dataString) as SessionData;
        if (data.userId === userId) {
          pipeline.del(key);
        }
      } catch (error) {
        log.error('Error parsing session data:', error);
      }
    }
  }

  await pipeline.exec();
}

export async function cleanupExpiredSessions(): Promise<void> {
  // Redis automatically handles expiration, but we can implement additional cleanup if needed
  log.debug('Session cleanup completed');
}
