import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { dataSource } from '../../db/datasource';
import { Setting, SettingValue, coerceSettingValue } from '../../entities/setting.entity';
import { gatewayInternalLog } from '../../utils/logger';

interface CachedSetting {
  value: SettingValue | null;
  updatedAt: number;
}

@Service()
export class ConfigurationService {
  private repo: Repository<Setting>;
  private cache = new Map<string, CachedSetting>();
  private TTL_MS = 30_000; // 30s cache TTL (runtime changes near real-time)

  constructor() {
    this.repo = dataSource.getRepository(Setting);
  }

  private async load(key: string): Promise<SettingValue | null> {
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now - cached.updatedAt < this.TTL_MS) return cached.value;

    const row = await this.repo.findOne({ where: { key } });
    const value = row ? coerceSettingValue(row) : null;
    this.cache.set(key, { value, updatedAt: now });
    return value;
  }

  private async upsert(key: string, value: SettingValue): Promise<SettingValue> {
    // Determine storage columns
    let valueType: string = typeof value;
    const partial: Partial<Setting> = { key, valueType };
    if (value === null || value === undefined) {
      throw new Error('Setting value cannot be null/undefined');
    }
    if (Array.isArray(value) || valueType === 'object') {
      partial.valueType = 'json';
      partial.jsonValue = value as any;
      partial.stringValue = null;
      partial.numberValue = null;
      partial.boolValue = null;
    } else if (valueType === 'string') {
      partial.stringValue = value as string;
      partial.numberValue = null;
      partial.boolValue = null;
      partial.jsonValue = null;
    } else if (valueType === 'number') {
      partial.numberValue = String(value);
      partial.stringValue = null;
      partial.boolValue = null;
      partial.jsonValue = null;
    } else if (valueType === 'boolean') {
      partial.boolValue = value as boolean;
      partial.stringValue = null;
      partial.numberValue = null;
      partial.jsonValue = null;
    }

    let existing = await this.repo.findOne({ where: { key } });
    if (existing) {
      existing = Object.assign(existing, partial);
      await this.repo.save(existing);
    } else {
      existing = this.repo.create(partial);
      await this.repo.save(existing);
    }
    this.cache.set(key, { value, updatedAt: Date.now() });
    return value;
  }

  // ---- Specific helpers for known settings ----
  private readonly AUDIT_RETENTION_KEY = 'audit.log.retention.days';

  /**
   * Returns audit log retention in days. Falls back to env or default if not yet configured.
   * Default: 90 days. Limits: 1..1825 (5y)
   */
  async getAuditLogRetentionDays(): Promise<number> {
    const value = await this.load(this.AUDIT_RETENTION_KEY);
    if (typeof value === 'number') return value;
    // bootstrap from env once if present
    const envVal = process.env.AUDIT_LOG_RETENTION_DAYS ? parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10) : NaN;
    return !isNaN(envVal) ? this.clampRetention(envVal) : 90;
  }

  async updateAuditLogRetentionDays(days: number): Promise<number> {
    days = this.clampRetention(days);
    await this.upsert(this.AUDIT_RETENTION_KEY, days);
    gatewayInternalLog.info('Updated audit log retention days', {
      operation: 'configurationUpdate',
      metadata: { days }
    });
    return days;
  }

  private clampRetention(days: number): number {
    if (!Number.isFinite(days) || days <= 0) days = 1;
    if (days > 365 * 5) days = 365 * 5;
    return Math.round(days);
  }
}
