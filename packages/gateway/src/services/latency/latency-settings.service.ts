import { Service } from 'typedi';
import { dataSource } from '../../db/datasource';
import { Setting, coerceSettingValue } from '../../entities/setting.entity';
import { log } from '../../utils/logger';

export interface LatencyTrackingSettings {
  enabled: boolean;
  useBatching: boolean;
  useIntelligentSampling: boolean;
  fallbackSampleRate: number;
  enableTelemetry: boolean;
  maxLatencyMs: number;
  batchSize: number;
  flushIntervalMs: number;
}

const DEFAULT_SETTINGS: LatencyTrackingSettings = {
  enabled: true,
  useBatching: true,
  useIntelligentSampling: true,
  fallbackSampleRate: 0.01,
  enableTelemetry: true,
  maxLatencyMs: 300000,
  batchSize: 1000,
  flushIntervalMs: 5000
};

const SETTING_KEYS = {
  ENABLED: 'latency_tracking.enabled',
  USE_BATCHING: 'latency_tracking.use_batching',
  USE_INTELLIGENT_SAMPLING: 'latency_tracking.use_intelligent_sampling',
  FALLBACK_SAMPLE_RATE: 'latency_tracking.fallback_sample_rate',
  ENABLE_TELEMETRY: 'latency_tracking.enable_telemetry',
  MAX_LATENCY_MS: 'latency_tracking.max_latency_ms',
  BATCH_SIZE: 'latency_tracking.batch_size',
  FLUSH_INTERVAL_MS: 'latency_tracking.flush_interval_ms'
} as const;

@Service()
export class LatencySettingsService {
  private cachedSettings: LatencyTrackingSettings | null = null;
  private lastFetch = 0;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  /**
   * Get current latency tracking settings with caching
   */
  async getSettings(): Promise<LatencyTrackingSettings> {
    const now = Date.now();

    // Return cached settings if still valid
    if (this.cachedSettings && now - this.lastFetch < this.CACHE_TTL_MS) {
      return this.cachedSettings;
    }

    try {
      const repo = dataSource.getRepository(Setting);
      const settingKeys = Object.values(SETTING_KEYS);

      const settings = await repo.createQueryBuilder('s').where('s.key IN (:...keys)', { keys: settingKeys }).getMany();

      const settingsMap = new Map<string, any>();
      for (const setting of settings) {
        const value = coerceSettingValue(setting);
        if (value !== null) {
          settingsMap.set(setting.key, value);
        }
      }

      // Build settings object with defaults
      const result: LatencyTrackingSettings = {
        enabled: settingsMap.get(SETTING_KEYS.ENABLED) ?? DEFAULT_SETTINGS.enabled,
        useBatching: settingsMap.get(SETTING_KEYS.USE_BATCHING) ?? DEFAULT_SETTINGS.useBatching,
        useIntelligentSampling:
          settingsMap.get(SETTING_KEYS.USE_INTELLIGENT_SAMPLING) ?? DEFAULT_SETTINGS.useIntelligentSampling,
        fallbackSampleRate: settingsMap.get(SETTING_KEYS.FALLBACK_SAMPLE_RATE) ?? DEFAULT_SETTINGS.fallbackSampleRate,
        enableTelemetry: settingsMap.get(SETTING_KEYS.ENABLE_TELEMETRY) ?? DEFAULT_SETTINGS.enableTelemetry,
        maxLatencyMs: settingsMap.get(SETTING_KEYS.MAX_LATENCY_MS) ?? DEFAULT_SETTINGS.maxLatencyMs,
        batchSize: settingsMap.get(SETTING_KEYS.BATCH_SIZE) ?? DEFAULT_SETTINGS.batchSize,
        flushIntervalMs: settingsMap.get(SETTING_KEYS.FLUSH_INTERVAL_MS) ?? DEFAULT_SETTINGS.flushIntervalMs
      };

      this.cachedSettings = result;
      this.lastFetch = now;

      return result;
    } catch (error) {
      log.warn('Failed to load latency tracking settings, using defaults', { error });
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Check if latency tracking is enabled (fast cached check)
   */
  async isEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.enabled;
  }

  /**
   * Update a single latency tracking setting
   */
  async updateSetting<K extends keyof LatencyTrackingSettings>(key: K, value: LatencyTrackingSettings[K]): Promise<void> {
    try {
      const repo = dataSource.getRepository(Setting);
      const settingKey = this.getSettingKey(key);

      if (!settingKey) {
        throw new Error(`Unknown setting key: ${key}`);
      }

      // Determine value type and columns to set
      let stringValue: string | null = null;
      let numberValue: string | null = null;
      let boolValue: boolean | null = null;
      let valueType: string;

      if (typeof value === 'boolean') {
        boolValue = value;
        valueType = 'boolean';
      } else if (typeof value === 'number') {
        numberValue = value.toString();
        valueType = 'number';
      } else {
        stringValue = String(value);
        valueType = 'string';
      }

      await repo
        .createQueryBuilder()
        .insert()
        .into(Setting)
        .values({
          key: settingKey,
          stringValue,
          numberValue,
          boolValue,
          valueType
        })
        .orUpdate(['stringValue', 'numberValue', 'boolValue', 'valueType', 'updatedAt'], ['key'])
        .execute();

      // Invalidate cache
      this.invalidateCache();

      log.info('Updated latency tracking setting', { key, value });
    } catch (error) {
      log.error('Failed to update latency tracking setting', { key, value, error });
      throw error;
    }
  }

  /**
   * Reset all settings to defaults
   */
  async resetToDefaults(): Promise<void> {
    try {
      const repo = dataSource.getRepository(Setting);
      const settingKeys = Object.values(SETTING_KEYS);

      await repo.createQueryBuilder().delete().from(Setting).where('key IN (:...keys)', { keys: settingKeys }).execute();

      this.invalidateCache();
      log.info('Reset latency tracking settings to defaults');
    } catch (error) {
      log.error('Failed to reset latency tracking settings', { error });
      throw error;
    }
  }

  /**
   * Initialize default settings if they don't exist
   */
  async initializeDefaults(): Promise<void> {
    try {
      const repo = dataSource.getRepository(Setting);
      const existingKeys = await repo
        .createQueryBuilder('s')
        .select('s.key')
        .where('s.key IN (:...keys)', { keys: Object.values(SETTING_KEYS) })
        .getMany();

      const existingKeySet = new Set(existingKeys.map((s) => s.key));
      const defaultEntries = Object.entries(DEFAULT_SETTINGS);

      for (const [key, value] of defaultEntries) {
        const settingKey = this.getSettingKey(key as keyof LatencyTrackingSettings);

        if (!settingKey || existingKeySet.has(settingKey)) {
          continue; // Skip if already exists
        }

        let stringValue: string | null = null;
        let numberValue: string | null = null;
        let boolValue: boolean | null = null;
        let valueType: string;

        if (typeof value === 'boolean') {
          boolValue = value;
          valueType = 'boolean';
        } else if (typeof value === 'number') {
          numberValue = value.toString();
          valueType = 'number';
        } else {
          stringValue = String(value);
          valueType = 'string';
        }

        await repo.insert({
          key: settingKey,
          stringValue,
          numberValue,
          boolValue,
          valueType
        });
      }

      log.info('Initialized default latency tracking settings');
    } catch (error) {
      log.warn('Failed to initialize default latency tracking settings', { error });
    }
  }

  /**
   * Invalidate cached settings
   */
  invalidateCache(): void {
    this.cachedSettings = null;
    this.lastFetch = 0;
  }

  private getSettingKey(key: keyof LatencyTrackingSettings): string | null {
    const keyMap: Record<keyof LatencyTrackingSettings, string> = {
      enabled: SETTING_KEYS.ENABLED,
      useBatching: SETTING_KEYS.USE_BATCHING,
      useIntelligentSampling: SETTING_KEYS.USE_INTELLIGENT_SAMPLING,
      fallbackSampleRate: SETTING_KEYS.FALLBACK_SAMPLE_RATE,
      enableTelemetry: SETTING_KEYS.ENABLE_TELEMETRY,
      maxLatencyMs: SETTING_KEYS.MAX_LATENCY_MS,
      batchSize: SETTING_KEYS.BATCH_SIZE,
      flushIntervalMs: SETTING_KEYS.FLUSH_INTERVAL_MS
    };

    return keyMap[key] || null;
  }
}
