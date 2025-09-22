import { Service } from 'typedi';
import { redisClient } from '../../auth/session.config';

@Service()
export class ApiKeyUsageCounterService {
  private readonly prefix = process.env.API_KEY_USAGE_REDIS_PREFIX || 'gqlgw:ak:usage:v1';
  private readonly ttlSeconds = parseInt(process.env.API_KEY_USAGE_REDIS_TTL_DAYS || '35', 10) * 86400;

  private today(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private key(date: string, apiKeyId: string, serviceId?: string | null) {
    return `${this.prefix}:${date}:${apiKeyId}:${serviceId || '∅'}`;
  }

  async incr(
    applicationId: string,
    serviceId: string | null | undefined,
    apiKeyId: string,
    opts: { error?: boolean; rateLimited?: boolean } = {}
  ) {
    const date = this.today();
    const k = this.key(date, apiKeyId, serviceId);
    const multi = redisClient.multi();
    multi.hIncrBy(k, 'req', 1);
    if (opts.error) multi.hIncrBy(k, 'err', 1);
    if (opts.rateLimited) multi.hIncrBy(k, 'rl', 1);
    // store metadata for consolidation
    multi.hSetNX(k, 'applicationId', applicationId);
    if (serviceId) multi.hSetNX(k, 'serviceId', serviceId);
    multi.expire(k, this.ttlSeconds);
    await multi.exec();
  }
}
