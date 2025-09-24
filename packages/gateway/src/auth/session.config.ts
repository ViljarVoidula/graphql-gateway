import { YogaInitialContext } from 'graphql-yoga';
import Redis from 'ioredis';
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

// Redis client for session storage (ioredis)
// Lazily initialize so env vars (like REDIS_URL) can be set by test setup before first use
let __redis: Redis | null = null;
function getOrCreateRedis(): Redis {
  if (!__redis) {
    __redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return __redis;
}

export const redisClient: any = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getOrCreateRedis() as any;
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
    set(_target, prop, value) {
      const client = getOrCreateRedis() as any;
      client[prop] = value;
      return true;
    },
    has(_target, prop) {
      const client = getOrCreateRedis() as any;
      return prop in client;
    }
  }
);

export const SESSION_COOKIE_NAME = 'gateway-session';
export const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function initializeRedis() {
  try {
    // ioredis connects lazily; issue a ping to verify connectivity
    await redisClient.ping();
    log.debug('Redis reachable for session storage');
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

  // setex(key, seconds, value)
  await redisClient.setex(sessionKey, SESSION_DURATION / 1000, serializedData);
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
