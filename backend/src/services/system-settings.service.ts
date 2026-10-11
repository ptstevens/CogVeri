import { db } from '../config/database';
import { logger } from '../utils/logger';

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

/**
 * System Settings Service
 *
 * Manages global system configuration settings stored in the database.
 * Includes caching for performance and audit logging for changes.
 */
class SystemSettingsService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  /**
   * Get a setting value by key
   * @param key - The setting key
   * @returns The setting value or null if not found
   */
  async getSetting<T>(key: string): Promise<T | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.value as T;
    }

    try {
      const setting = await db('system_settings').where('key', key).select('value').first();

      if (!setting) {
        return null;
      }

      const value = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;

      // Update cache
      this.cache.set(key, {
        value,
        cachedAt: Date.now(),
      });

      return value as T;
    } catch (error) {
      logger.error(`Error getting system setting "${key}":`, error);
      throw error;
    }
  }

  /**
   * Set a setting value
   * @param key - The setting key
   * @param value - The value to set
   * @param userId - The user making the change (for audit)
   * @param description - Optional description for the setting
   */
  async setSetting(
    key: string,
    value: unknown,
    userId?: string,
    description?: string
  ): Promise<void> {
    try {
      const exists = await db('system_settings').where('key', key).first();

      const jsonValue = JSON.stringify(value);

      if (exists) {
        await db('system_settings')
          .where('key', key)
          .update({
            value: jsonValue,
            updated_by: userId || null,
            updated_at: new Date(),
          });
      } else {
        await db('system_settings').insert({
          key,
          value: jsonValue,
          description: description || null,
          updated_by: userId || null,
          updated_at: new Date(),
          created_at: new Date(),
        });
      }

      // Invalidate cache
      this.invalidateCache(key);

      logger.info(`System setting "${key}" updated`, {
        key,
        value,
        updatedBy: userId,
      });
    } catch (error) {
      logger.error(`Error setting system setting "${key}":`, error);
      throw error;
    }
  }

  /**
   * Get the trial duration in days
   * @returns The trial duration in days (defaults to 7)
   */
  async getTrialDurationDays(): Promise<number> {
    const value = await this.getSetting<number>('trial_duration_days');
    return value ?? 7; // Default to 7 days if not set
  }

  /**
   * Set the trial duration in days
   * @param days - The number of trial days
   * @param userId - The user making the change
   */
  async setTrialDurationDays(days: number, userId: string): Promise<void> {
    if (days < 1 || days > 90) {
      throw new Error('Trial duration must be between 1 and 90 days');
    }

    await this.setSetting(
      'trial_duration_days',
      days,
      userId,
      'Default trial duration in days for new organizations'
    );
  }

  /**
   * Get all system settings
   * @returns Array of all settings
   */
  async getAllSettings(): Promise<
    Array<{
      key: string;
      value: unknown;
      description: string | null;
      updatedAt: Date;
      updatedBy: string | null;
    }>
  > {
    try {
      const settings = await db('system_settings')
        .select('key', 'value', 'description', 'updated_at', 'updated_by')
        .orderBy('key');

      return settings.map(
        (s: {
          key: string;
          value: unknown;
          description: string | null;
          updated_at: Date;
          updated_by: string | null;
        }) => ({
          key: s.key,
          value: typeof s.value === 'string' ? JSON.parse(s.value) : s.value,
          description: s.description,
          updatedAt: s.updated_at,
          updatedBy: s.updated_by,
        })
      );
    } catch (error) {
      logger.error('Error getting all system settings:', error);
      throw error;
    }
  }

  /**
   * Invalidate cache for a specific key or all keys
   * @param key - Optional key to invalidate. If not provided, invalidates all.
   */
  invalidateCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

export const systemSettingsService = new SystemSettingsService();
export default systemSettingsService;
