import 'reflect-metadata';
import { redisClient } from '../auth/session.config';
import { dataSource } from '../db/datasource';

function parseKey(prefix: string, key: string) {
  // format: <prefix>:YYYY-MM-DD:<apiKeyId>:<serviceId or ∅>
  const p = key.split(':');
  const date = p[p.length - 3];
  const apiKeyId = p[p.length - 2];
  const servicePart = p[p.length - 1];
  return { date, apiKeyId, serviceId: servicePart === '∅' ? null : servicePart };
}

async function hgetallAndDel(key: string): Promise<Record<string, string>> {
  // Use Lua to atomically read and delete
  const script = `
    local v = redis.call('HGETALL', KEYS[1])
    if next(v) ~= nil then
      redis.call('DEL', KEYS[1])
    end
    return v
  `;
  // ioredis eval signature: eval(script, numKeys, key1, ...)
  const flat = (await (redisClient as any).eval(script, 1, key)) as string[];
  const out: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}

async function flushBatch(
  rows: Array<{
    apiKeyId: string;
    applicationId: string;
    serviceId: string | null;
    date: string;
    req: number;
    err: number;
    rl: number;
  }>
) {
  if (!rows.length) return;
  const params: any[] = [];
  const values = rows
    .map((_, i) => {
      const b = i * 7;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    })
    .join(',');
  rows.forEach((r) => params.push(r.apiKeyId, r.applicationId, r.serviceId, r.date, r.req, r.err, r.rl));
  const sql = `
    INSERT INTO api_key_usage ("apiKeyId","applicationId","serviceId","date","requestCount","errorCount","rateLimitExceededCount")
    VALUES ${values}
    ON CONFLICT ("apiKeyId","serviceId","date") DO UPDATE SET
      "requestCount" = api_key_usage."requestCount" + EXCLUDED."requestCount",
      "errorCount" = api_key_usage."errorCount" + EXCLUDED."errorCount",
      "rateLimitExceededCount" = api_key_usage."rateLimitExceededCount" + EXCLUDED."rateLimitExceededCount";
  `;
  await dataSource.query(sql, params);
}

async function runOnce() {
  const prefix = process.env.API_KEY_USAGE_REDIS_PREFIX || 'gqlgw:ak:usage:v1';
  const pattern = `${prefix}:*`;
  let cursor = '0';
  const batch: any[] = [];
  while (true) {
    // ioredis returns [cursor, keys]
    const [next, keys] = (await (redisClient as any).scan(cursor, 'MATCH', pattern, 'COUNT', 1000)) as [string, string[]];
    cursor = next as string;
    for (const key of keys) {
      const meta = parseKey(prefix, key);
      const fields = await hgetallAndDel(key);
      if (!fields || Object.keys(fields).length === 0) continue;
      batch.push({
        apiKeyId: meta.apiKeyId,
        applicationId: fields.applicationId,
        serviceId: (fields.serviceId as any) ?? meta.serviceId,
        date: meta.date,
        req: parseInt(fields.req || '0', 10),
        err: parseInt(fields.err || '0', 10),
        rl: parseInt(fields.rl || '0', 10)
      });
      if (batch.length >= 1000) {
        await flushBatch(batch.splice(0));
      }
    }
    if (cursor === '0') break;
  }
  if (batch.length) await flushBatch(batch.splice(0));
}

let timer: NodeJS.Timeout | null = null;

export async function startApiKeyUsageConsolidator() {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  const intervalMs = parseInt(process.env.API_KEY_USAGE_FLUSH_INTERVAL_MS || '5000', 10);
  const lockKey = process.env.API_KEY_USAGE_LOCK_KEY || 'gqlgw:locks:api-key-usage-consolidator';
  if (timer) return stopApiKeyUsageConsolidator; // already running
  const tick = async () => {
    try {
      // ioredis: pass flags as separate args
      const got = await (redisClient as any).set(lockKey, String(process.pid), 'PX', intervalMs * 2, 'NX');
      if (got === 'OK') {
        await runOnce();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('api-key-usage worker error', e);
    }
  };
  // run immediately once, then on interval
  tick();
  timer = setInterval(tick, intervalMs);
  return stopApiKeyUsageConsolidator;
}

export function stopApiKeyUsageConsolidator() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
