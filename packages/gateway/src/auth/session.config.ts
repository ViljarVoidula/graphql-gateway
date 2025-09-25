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
let __redis: Redis | null = null as any;

// Very small in-memory Redis mock for tests
class InMemoryRedis {
  private store = new Map<string, any>();
  private expiries = new Map<string, number>();
  async ping() {
    return 'PONG';
  }
  // Basic DEL supporting multiple keys
  async del(...keys: string[]) {
    let c = 0;
    for (const k of keys) {
      if (this.store.delete(k)) c++;
      this.expiries.delete(k);
    }
    return c;
  }
  async get(key: string) {
    this.cleanup();
    const val = this.store.get(key);
    return typeof val === 'string' ? val : (val ?? null);
  }
  // SET with minimal support for NX/PX options
  async set(key: string, value: string, ...args: any[]) {
    // Interpret ioredis-style options: set key value PX <ms> NX
    let pxMs: number | undefined;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase();
      if (a === 'PX' && i + 1 < args.length) {
        pxMs = Number(args[i + 1]);
        i++;
      } else if (a === 'NX') {
        nx = true;
      }
    }
    if (nx && this.store.has(key)) return null; // emulate not set
    this.store.set(key, value);
    if (pxMs && Number.isFinite(pxMs)) {
      this.expiries.set(key, Date.now() + (pxMs as number));
    }
    return 'OK';
  }
  async setex(key: string, seconds: number, value: string) {
    this.store.set(key, value);
    this.expiries.set(key, Date.now() + seconds * 1000);
  }
  async keys(pattern: string) {
    this.cleanup();
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return [...this.store.keys()].filter((k) => regex.test(k));
  }
  async incr(key: string) {
    this.cleanup();
    const current = Number(this.store.get(key)) || 0;
    const newVal = current + 1;
    this.store.set(key, newVal.toString());
    return newVal;
  }
  async hIncrBy(key: string, field: string, by: number) {
    this.cleanup();
    const curr = this.store.get(key) || {};
    const val = (Number(curr[field] || 0) + Number(by)) | 0;
    curr[field] = String(val);
    this.store.set(key, curr);
    return val;
  }
  // Support both object and field/value forms similar to ioredis
  async hSet(key: string, fieldOrObj: any, value?: any) {
    this.cleanup();
    const curr = this.store.get(key) || {};
    let added = 0;
    if (typeof fieldOrObj === 'object' && fieldOrObj !== null) {
      for (const [f, v] of Object.entries(fieldOrObj)) {
        if (!(f in curr)) added++;
        curr[f] = String(v as any);
      }
    } else if (typeof fieldOrObj === 'string') {
      const f = fieldOrObj;
      if (!(f in curr)) added++;
      curr[f] = String(value);
    }
    this.store.set(key, curr);
    return added;
  }
  async expire(key: string, seconds: number) {
    this.expiries.set(key, Date.now() + seconds * 1000);
    return 1;
  }
  async flushdb() {
    this.store.clear();
    this.expiries.clear();
    return 'OK';
  }
  // Support both ioredis eval forms:
  // 1) eval(script, { keys: [], arguments: [] })
  // 2) eval(script, numKeys, key1, ..., arg1, ...)
  async eval(script: string, ...rest: any[]) {
    // Form 1
    if (rest.length === 1 && rest[0] && typeof rest[0] === 'object') {
      const options = rest[0] as { keys?: string[]; arguments?: string[] };
      const keys = options.keys || [];
      const args = (options.arguments || []).map((s) => Number(s));
      // Rate-limit script: returns {mcount,dcount}
      if (keys.length === 2 && args.length >= 4) {
        const [mkey, dkey] = keys;
        const [_mlimit, _dlimit, mttl, dttl] = args;
        let mcount = await this.incr(mkey);
        if (mcount === 1) await this.expire(mkey, mttl);
        let dcount = await this.incr(dkey);
        if (dcount === 1) await this.expire(dkey, dttl);
        return [mcount, dcount];
      }
    }
    // Form 2: eval(script, numKeys, k1, k2, ..., arg1, arg2, ...)
    if (rest.length >= 2 && typeof rest[0] === 'number') {
      const numKeys = rest[0] as number;
      const keys = rest.slice(1, 1 + numKeys) as string[];
      const args = rest.slice(1 + numKeys) as string[];
      // hgetall + del pattern used in worker
      if (/hgetall/i.test(script)) {
        const key = keys[0];
        const obj = await this.hgetall(key);
        const flat: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
          flat.push(k, String(v));
        }
        if (flat.length) await this.del(key);
        return flat;
      }
      // Fallback: act like no-op
      return [];
    }
    // Fallback for unknown forms
    return [];
  }
  multi() {
    const ops: Array<() => void> = [];
    const self = this;
    return {
      hincrby(key: string, field: string, by: number) {
        ops.push(() => {
          const curr = self.store.get(key) || {};
          curr[field] = (Number(curr[field] || 0) + by).toString();
          self.store.set(key, curr);
        });
        return this;
      },
      hsetnx(key: string, field: string, value: string) {
        ops.push(() => {
          const curr = self.store.get(key) || {};
          if (!(field in curr)) curr[field] = value;
          self.store.set(key, curr);
        });
        return this;
      },
      del(key: string) {
        ops.push(() => {
          self.store.delete(key);
          self.expiries.delete(key);
        });
        return this;
      },
      expire(key: string, seconds: number) {
        ops.push(() => self.expiries.set(key, Date.now() + seconds * 1000));
        return this;
      },
      async exec() {
        ops.forEach((fn) => fn());
        return [] as any;
      },
    } as any;
  }
  async hgetall(key: string) {
    this.cleanup();
    const curr = this.store.get(key) || {};
    // normalize all values to strings (like Redis)
    return Object.fromEntries(
      Object.entries(curr).map(([k, v]) => [k, String(v)])
    );
  }
  async ttl(key: string) {
    this.cleanup();
    const until = this.expiries.get(key);
    if (!until) return -1;
    const sec = Math.ceil((until - Date.now()) / 1000);
    return sec > 0 ? sec : -2; // -2 if expired
  }
  async scan(_cursor: string, ...args: any[]) {
    // Accept ioredis style: scan(cursor, 'MATCH', pattern, 'COUNT', n)
    let pattern = '*';
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase();
      if (a === 'MATCH' && i + 1 < args.length) {
        pattern = String(args[i + 1]);
        i++;
      }
    }
    const keys = await this.keys(pattern);
    return ['0', keys];
  }
  disconnect() {}
  private cleanup() {
    const now = Date.now();
    for (const [k, ts] of this.expiries.entries()) {
      if (ts <= now) {
        this.expiries.delete(k);
        this.store.delete(k);
      }
    }
  }
}

function getOrCreateRedis(): any {
  if (!__redis) {
    if (process.env.USE_IN_MEMORY_REDIS === '1') {
      __redis = new InMemoryRedis() as any;
    } else {
      __redis = new Redis(
        process.env.REDIS_URL || 'redis://localhost:6379'
      ) as any;
    }
  }
  return __redis as any;
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
    },
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

export async function saveSession(
  sessionId: string,
  data: SessionData
): Promise<void> {
  const sessionKey = `session:${sessionId}`;
  const serializedData = JSON.stringify({
    ...data,
    loginTime: data.loginTime.toISOString(),
    lastActivity: data.lastActivity.toISOString(),
  });

  // setex(key, seconds, value)
  await redisClient.setex(sessionKey, SESSION_DURATION / 1000, serializedData);
}

export async function getSession(
  sessionId: string
): Promise<SessionData | null> {
  try {
    const sessionKey = `session:${sessionId}`;
    const data = await redisClient.get(sessionKey);

    if (!data) return null;

    const dataString = typeof data === 'string' ? data : data.toString();
    const parsed = JSON.parse(dataString);
    return {
      ...parsed,
      loginTime: new Date(parsed.loginTime),
      lastActivity: new Date(parsed.lastActivity),
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
        const dataString =
          typeof sessionData === 'string'
            ? sessionData
            : sessionData.toString();
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
