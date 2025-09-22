import { metrics } from '@opentelemetry/api';
import { GraphQLError } from 'graphql';
import { Container } from 'typedi';
import { ExtendedYogaContext } from '../auth/auth.types';
import { redisClient } from '../auth/session.config';
import { dataSource } from '../db/datasource';
import { ApiKeyUsageCounterService } from '../services/usage/api-key-usage.counter';
import { ApplicationServiceRateLimit } from '../entities/application-service-rate-limit.entity';
import { AuditEventType } from '../entities/audit-log.entity';
import { AuditLogService } from '../services/audit/audit-log.service';

const meter = metrics.getMeter('gateway.rate.limit');
const allowCounter = meter.createCounter('gateway_rate_limit_allowed', {
  description: 'Requests allowed post rate-limit evaluation'
});
const blockCounter = meter.createCounter('gateway_rate_limit_blocked', {
  description: 'Requests blocked due to rate limiting'
});

// Assumes a Redis instance already initialized for sessions (reuse) via env REDIS_URL or similar.
// Simple token bucket using Redis INCR + TTL.

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remainingMinute?: number;
  remainingDay?: number;
}

export async function enforceRateLimit(context: ExtendedYogaContext): Promise<RateLimitResult> {
  if (context.authType !== 'api-key' || !context.application) return { allowed: true };

  const app = context.application;
  if (app.rateLimitDisabled) return { allowed: true };

  let minuteLimit = app.rateLimitPerMinute ?? null;
  let dayLimit = app.rateLimitPerDay ?? null;

  // Per-service override (pass target service id via header or context)
  const ctxAny: any = context as any;
  const targetServiceId = ctxAny.serviceId || ctxAny.request?.headers.get('x-target-service-id') || undefined;
  if (targetServiceId) {
    try {
      const repo = dataSource.getRepository(ApplicationServiceRateLimit);
      const override = await repo.findOne({ where: { applicationId: app.id, serviceId: targetServiceId } });
      if (override && !override.disabled) {
        if (override.perMinute !== null && override.perMinute !== undefined) minuteLimit = override.perMinute;
        if (override.perDay !== null && override.perDay !== undefined) dayLimit = override.perDay;
      }
    } catch (e) {
      // Swallow errors to avoid impacting request path
    }
  }
  if (!minuteLimit && !dayLimit) return { allowed: true };

  const now = new Date();
  const minuteKey = `rl:${app.id}:m:${now.getUTCFullYear()}${now.getUTCMonth()}${now.getUTCDate()}${now.getUTCHours()}${now.getUTCMinutes()}`;
  const dayKey = `rl:${app.id}:d:${now.toISOString().substring(0, 10)}`;

  // Atomic increment via Lua when both limits present
  let minuteCount: number | undefined;
  let dayCount: number | undefined;
  if (minuteLimit && dayLimit) {
    const script = `
      local mkey = KEYS[1]
      local dkey = KEYS[2]
      local mlimit = tonumber(ARGV[1])
      local dlimit = tonumber(ARGV[2])
      local mttl = tonumber(ARGV[3])
      local dttl = tonumber(ARGV[4])
      local mcount = redis.call('INCR', mkey)
      if mcount == 1 then redis.call('EXPIRE', mkey, mttl) end
      local dcount = redis.call('INCR', dkey)
      if dcount == 1 then redis.call('EXPIRE', dkey, dttl) end
      return {mcount, dcount}
    `;
    try {
      const res: any = await redisClient.eval(script, {
        keys: [minuteKey, dayKey],
        arguments: [String(minuteLimit), String(dayLimit), '65', String(60 * 60 * 24 + 60)]
      });
      minuteCount = Number(res[0]);
      dayCount = Number(res[1]);
    } catch {
      // fallback
    }
  }
  if (minuteLimit && minuteCount === undefined) {
    minuteCount = Number(await redisClient.incr(minuteKey));
    if (minuteCount === 1) await redisClient.expire(minuteKey, 65);
  }
  if (dayLimit && dayCount === undefined) {
    dayCount = Number(await redisClient.incr(dayKey));
    if (dayCount === 1) await redisClient.expire(dayKey, 60 * 60 * 24 + 60);
  }

  let audit: AuditLogService | null = null;
  try {
    audit = Container.get(AuditLogService);
  } catch {
    // In very isolated tests DI container/entity metadata might not be ready; skip audit.
  }

  if (minuteLimit && minuteCount! > minuteLimit) {
    blockCounter.add(1, { scope: 'minute', applicationId: app.id });
    if (audit) {
      try {
        await audit.log(AuditEventType.RATE_LIMIT_EXCEEDED, {
          applicationId: app.id,
          metadata: { scope: 'minute', limit: minuteLimit }
        });
      } catch {
        /* swallow for tests */
      }
    }
    // Record per-API-key rate limit exceed
    try {
      const ctxAny: any = context as any;
      const apiKey = ctxAny.apiKey;
      const serviceId = ctxAny.serviceId || undefined;
      if (apiKey && serviceId) {
        const counter = Container.get(ApiKeyUsageCounterService);
        void counter.incr(app.id, serviceId, apiKey.id, { rateLimited: true });
      }
    } catch {}
    return { allowed: false, reason: 'RATE_LIMIT_MINUTE_EXCEEDED', remainingMinute: 0 };
  }
  if (dayLimit && dayCount! > dayLimit) {
    blockCounter.add(1, { scope: 'day', applicationId: app.id });
    if (audit) {
      try {
        await audit.log(AuditEventType.RATE_LIMIT_EXCEEDED, {
          applicationId: app.id,
          metadata: { scope: 'day', limit: dayLimit }
        });
      } catch {
        /* swallow for tests */
      }
    }
    // Record per-API-key rate limit exceed
    try {
      const ctxAny: any = context as any;
      const apiKey = ctxAny.apiKey;
      const serviceId = ctxAny.serviceId || undefined;
      if (apiKey && serviceId) {
        const counter = Container.get(ApiKeyUsageCounterService);
        void counter.incr(app.id, serviceId, apiKey.id, { rateLimited: true });
      }
    } catch {}
    return { allowed: false, reason: 'RATE_LIMIT_DAY_EXCEEDED', remainingDay: 0 };
  }

  allowCounter.add(1, { applicationId: app.id });
  return {
    allowed: true,
    remainingMinute: minuteLimit ? Math.max(0, minuteLimit - minuteCount!) : undefined,
    remainingDay: dayLimit ? Math.max(0, dayLimit - dayCount!) : undefined
  };
}

export function createRateLimitPlugin() {
  return {
    async onExecute({ context, setExecuteFn }: any) {
      const result = await enforceRateLimit(context as ExtendedYogaContext);
      if (!result.allowed) {
        throw new GraphQLError('Rate limit exceeded', {
          extensions: { code: result.reason }
        });
      }
      // Optionally expose headers via context.response etc.
      const response = (context as any).response;
      if (response && response.headers) {
        if (result.remainingMinute !== undefined) {
          response.headers.set('X-RateLimit-Remaining-Minute', String(result.remainingMinute));
        }
        if (result.remainingDay !== undefined) {
          response.headers.set('X-RateLimit-Remaining-Day', String(result.remainingDay));
        }
      }
    }
  };
}
