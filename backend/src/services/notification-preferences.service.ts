import { db } from '../config/database';
import { logger } from '../utils/logger';
import { NotificationType } from './notification.service';

export type DigestFrequency = 'immediate' | 'daily' | 'weekly' | 'never';

export interface NotificationChannelPreference {
  email: boolean;
  push: boolean;
  in_app: boolean;
}

export interface NotificationPreferencesJson {
  task_assigned: NotificationChannelPreference;
  review_comment: NotificationChannelPreference;
  recording_ready: NotificationChannelPreference;
  task_due_soon: NotificationChannelPreference;
  task_overdue: NotificationChannelPreference;
  recording_submitted: NotificationChannelPreference;
  review_requested: NotificationChannelPreference;
  review_completed: NotificationChannelPreference;
  feedback_received: NotificationChannelPreference;
  mention: NotificationChannelPreference;
  system: NotificationChannelPreference;
  rubric_template_ready: NotificationChannelPreference;
  rubric_template_failed: NotificationChannelPreference;
  analysis_complete: NotificationChannelPreference;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  digest_frequency: DigestFrequency;
  preferences_json: NotificationPreferencesJson;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone: string;
  last_digest_sent_at?: Date;
  last_email_sent_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UpdatePreferencesDto {
  email_enabled?: boolean;
  push_enabled?: boolean;
  in_app_enabled?: boolean;
  digest_frequency?: DigestFrequency;
  preferences_json?: Partial<NotificationPreferencesJson>;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string;
}

// Default preferences for new users
const DEFAULT_PREFERENCES: NotificationPreferencesJson = {
  task_assigned: { email: true, push: true, in_app: true },
  review_comment: { email: true, push: true, in_app: true },
  recording_ready: { email: true, push: true, in_app: true },
  task_due_soon: { email: true, push: true, in_app: true },
  task_overdue: { email: true, push: true, in_app: true },
  recording_submitted: { email: true, push: true, in_app: true },
  review_requested: { email: true, push: true, in_app: true },
  review_completed: { email: true, push: true, in_app: true },
  feedback_received: { email: true, push: true, in_app: true },
  mention: { email: true, push: true, in_app: true },
  system: { email: false, push: true, in_app: true },
  rubric_template_ready: { email: false, push: true, in_app: true },
  rubric_template_failed: { email: false, push: true, in_app: true },
  analysis_complete: { email: true, push: true, in_app: true },
};

class NotificationPreferencesService {
  /**
   * Get notification preferences for a user (creates default if not exists)
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      let preferences = await db('notification_preferences').where('user_id', userId).first();

      if (!preferences) {
        // Create default preferences for this user
        preferences = await this.createDefaultPreferences(userId);
      }

      return this.formatPreferences(preferences);
    } catch (error) {
      logger.error('Error getting notification preferences:', error);
      throw error;
    }
  }

  /**
   * Create default preferences for a new user
   */
  async createDefaultPreferences(userId: string): Promise<any> {
    try {
      const [preferences] = await db('notification_preferences')
        .insert({
          user_id: userId,
          email_enabled: true,
          push_enabled: true,
          in_app_enabled: true,
          digest_frequency: 'immediate',
          preferences_json: JSON.stringify(DEFAULT_PREFERENCES),
          timezone: 'UTC',
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Created default notification preferences for user ${userId}`);

      return preferences;
    } catch (error) {
      // Handle race condition - preferences might have been created by another request
      if ((error as any).code === '23505') {
        // Unique constraint violation
        const preferences = await db('notification_preferences').where('user_id', userId).first();
        return preferences;
      }
      logger.error('Error creating default notification preferences:', error);
      throw error;
    }
  }

  /**
   * Update notification preferences for a user
   */
  async updatePreferences(
    userId: string,
    updates: UpdatePreferencesDto
  ): Promise<NotificationPreferences> {
    try {
      // ★ Race Condition Fix: Use transaction with FOR UPDATE to prevent lost updates
      // The read-modify-write pattern is vulnerable to concurrent requests overwriting each other
      const result = await db.transaction(async (trx) => {
        // Ensure preferences exist (creates default if needed)
        let current = await trx('notification_preferences')
          .where('user_id', userId)
          .forUpdate() // Lock the row to prevent concurrent reads
          .first();

        if (!current) {
          // Create default preferences within the transaction
          [current] = await trx('notification_preferences')
            .insert({
              user_id: userId,
              email_enabled: true,
              push_enabled: true,
              in_app_enabled: true,
              digest_frequency: 'immediate',
              preferences_json: JSON.stringify(DEFAULT_PREFERENCES),
              timezone: 'UTC',
              created_at: new Date(),
              updated_at: new Date(),
            })
            .onConflict('user_id')
            .merge() // Upsert pattern for safety
            .returning('*');
        }

        // Parse current preferences_json
        const currentJson =
          typeof current.preferences_json === 'string'
            ? JSON.parse(current.preferences_json)
            : current.preferences_json;

        // Merge preferences_json if provided (now safe from concurrent overwrites)
        let mergedPreferencesJson = currentJson;
        if (updates.preferences_json) {
          mergedPreferencesJson = {
            ...currentJson,
            ...updates.preferences_json,
          };
        }

        // Build update object
        const updateData: any = {
          updated_at: new Date(),
        };

        if (updates.email_enabled !== undefined) {
          updateData.email_enabled = updates.email_enabled;
        }
        if (updates.push_enabled !== undefined) {
          updateData.push_enabled = updates.push_enabled;
        }
        if (updates.in_app_enabled !== undefined) {
          updateData.in_app_enabled = updates.in_app_enabled;
        }
        if (updates.digest_frequency !== undefined) {
          updateData.digest_frequency = updates.digest_frequency;
        }
        if (updates.preferences_json !== undefined) {
          updateData.preferences_json = JSON.stringify(mergedPreferencesJson);
        }
        if (updates.quiet_hours_start !== undefined) {
          updateData.quiet_hours_start = updates.quiet_hours_start;
        }
        if (updates.quiet_hours_end !== undefined) {
          updateData.quiet_hours_end = updates.quiet_hours_end;
        }
        if (updates.timezone !== undefined) {
          updateData.timezone = updates.timezone;
        }

        const [preferences] = await trx('notification_preferences')
          .where('user_id', userId)
          .update(updateData)
          .returning('*');

        return preferences;
      });

      logger.info(`Updated notification preferences for user ${userId}`);

      return this.formatPreferences(result);
    } catch (error) {
      logger.error('Error updating notification preferences:', error);
      throw error;
    }
  }

  /**
   * Check if a notification type should be sent via a specific channel
   */
  async shouldSendNotification(
    userId: string,
    notificationType: NotificationType,
    channel: 'email' | 'push' | 'in_app'
  ): Promise<boolean> {
    try {
      const preferences = await this.getPreferences(userId);

      // Check global toggle first
      if (channel === 'email' && !preferences.email_enabled) {
        return false;
      }
      if (channel === 'push' && !preferences.push_enabled) {
        return false;
      }
      if (channel === 'in_app' && !preferences.in_app_enabled) {
        return false;
      }

      // Check quiet hours for push notifications
      if (channel === 'push' && this.isInQuietHours(preferences)) {
        return false;
      }

      // Check per-notification-type preference
      const typePrefs = preferences.preferences_json[notificationType];
      if (typePrefs) {
        return typePrefs[channel] ?? true;
      }

      // Default to true if notification type not configured
      return true;
    } catch (error) {
      logger.error('Error checking notification preferences:', error);
      // Default to true on error to avoid missing important notifications
      return true;
    }
  }

  /**
   * Check if currently in quiet hours
   * ★ Made public to allow dispatch optimization (single getPreferences call)
   * ★ Fixed: More robust timezone handling using Intl.DateTimeFormat
   */
  isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quiet_hours_start || !preferences.quiet_hours_end) {
      return false;
    }

    try {
      const timezone = preferences.timezone || 'UTC';

      // ★ Timezone Fix: Use Intl.DateTimeFormat for reliable timezone conversion
      // The previous approach (toLocaleString parsing) was fragile and could fail
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      // Get current time in user's timezone as HH:MM
      const parts = formatter.formatToParts(new Date());
      const hour = parts.find((p) => p.type === 'hour')?.value || '00';
      const minute = parts.find((p) => p.type === 'minute')?.value || '00';
      const currentTime = `${hour}:${minute}`;

      const start = preferences.quiet_hours_start;
      const end = preferences.quiet_hours_end;

      // Handle cases where quiet hours span midnight
      // E.g., start: 22:00, end: 07:00 means 10pm to 7am
      if (start <= end) {
        // Normal case: same day (e.g., 09:00 to 17:00)
        return currentTime >= start && currentTime <= end;
      } else {
        // Overnight case: spans midnight (e.g., 22:00 to 07:00)
        return currentTime >= start || currentTime <= end;
      }
    } catch (error) {
      // Invalid timezone or other error - fail open (don't block notifications)
      logger.error('Error checking quiet hours:', {
        timezone: preferences.timezone,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get users who need a digest email
   */
  async getUsersNeedingDigest(
    frequency: DigestFrequency
  ): Promise<{ userId: string; lastDigestSentAt: Date | null }[]> {
    try {
      const now = new Date();
      let cutoffTime: Date;

      if (frequency === 'daily') {
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (frequency === 'weekly') {
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        return [];
      }

      const users = await db('notification_preferences')
        .where('digest_frequency', frequency)
        .andWhere('email_enabled', true)
        .andWhere(function () {
          this.whereNull('last_digest_sent_at').orWhere('last_digest_sent_at', '<', cutoffTime);
        })
        .select('user_id', 'last_digest_sent_at');

      return users.map((u) => ({
        userId: u.user_id,
        lastDigestSentAt: u.last_digest_sent_at,
      }));
    } catch (error) {
      logger.error('Error getting users needing digest:', error);
      throw error;
    }
  }

  /**
   * Update last digest sent timestamp
   */
  async updateLastDigestSent(userId: string): Promise<void> {
    try {
      await db('notification_preferences').where('user_id', userId).update({
        last_digest_sent_at: new Date(),
        updated_at: new Date(),
      });
    } catch (error) {
      logger.error('Error updating last digest sent:', error);
      throw error;
    }
  }

  /**
   * Format preferences from database row
   */
  private formatPreferences(row: any): NotificationPreferences {
    let preferencesJson = row.preferences_json;
    if (typeof preferencesJson === 'string') {
      try {
        preferencesJson = JSON.parse(preferencesJson);
      } catch {
        preferencesJson = DEFAULT_PREFERENCES;
      }
    }

    // Merge with defaults to ensure all notification types are present
    preferencesJson = {
      ...DEFAULT_PREFERENCES,
      ...preferencesJson,
    };

    return {
      id: row.id,
      user_id: row.user_id,
      email_enabled: row.email_enabled,
      push_enabled: row.push_enabled,
      in_app_enabled: row.in_app_enabled,
      digest_frequency: row.digest_frequency,
      preferences_json: preferencesJson,
      quiet_hours_start: row.quiet_hours_start,
      quiet_hours_end: row.quiet_hours_end,
      timezone: row.timezone || 'UTC',
      last_digest_sent_at: row.last_digest_sent_at,
      last_email_sent_at: row.last_email_sent_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export default new NotificationPreferencesService();
