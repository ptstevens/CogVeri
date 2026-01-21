import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import metricsService from './metrics.service';
import multipartUploadService from './multipart-upload.service';
import notificationService from './notification.service';
import notificationPreferencesService, { DigestFrequency } from './notification-preferences.service';
import trialService from './trial.service';
import { emailService } from './email.service';
import { db } from '../config/database';
import { generateEmailTemplate, createInfoCard, BRAND_COLORS } from '../utils/email-templates';
import stripeSyncService from './stripe-sync.service';
import { featureGrantService } from './feature-grant.service';

/**
 * Scheduler service for recurring tasks
 * Handles periodic aggregation of metrics and cleanup operations
 */

class SchedulerService {
  private hourlyJob: ScheduledTask | null = null;
  private dailyJob: ScheduledTask | null = null;
  private monthlyJob: ScheduledTask | null = null;
  private uploadCleanupJob: ScheduledTask | null = null;
  private dailyDigestJob: ScheduledTask | null = null;
  private weeklyDigestJob: ScheduledTask | null = null;
  private notificationCleanupJob: ScheduledTask | null = null;
  private trialReminderJob: ScheduledTask | null = null;
  // Billing-related jobs
  private stripeSyncJob: ScheduledTask | null = null;
  private gracePeriodJob: ScheduledTask | null = null;
  // Feature grant expiration job
  private featureGrantExpirationJob: ScheduledTask | null = null;
  // Suspended organization cleanup job
  private suspendedOrgCleanupJob: ScheduledTask | null = null;

  /**
   * Initialize scheduler with all recurring tasks
   * Should be called once on server startup
   */
  public initializeScheduler(): void {
    logger.info('Initializing scheduler service...');

    // Hourly aggregation: Every hour at minute 0
    this.hourlyJob = cron.schedule('0 * * * *', async () => {
      await this.aggregateHourlyMetrics();
    });

    // Daily aggregation: Every day at 1:00 AM UTC
    this.dailyJob = cron.schedule('0 1 * * *', async () => {
      await this.aggregateDailyMetrics();
    });

    // Monthly aggregation: First day of month at 2:00 AM UTC
    this.monthlyJob = cron.schedule('0 2 1 * *', async () => {
      await this.aggregateMonthlyMetrics();
    });

    // Upload cleanup: Every hour at minute 30
    // Cleans up expired multipart uploads to prevent R2/S3 storage charges
    this.uploadCleanupJob = cron.schedule('30 * * * *', async () => {
      await this.cleanupExpiredUploads();
    });

    // Daily digest emails: Every day at 8:00 AM UTC
    this.dailyDigestJob = cron.schedule('0 8 * * *', async () => {
      await this.sendDigestEmails('daily');
    });

    // Weekly digest emails: Every Monday at 8:00 AM UTC
    this.weeklyDigestJob = cron.schedule('0 8 * * 1', async () => {
      await this.sendDigestEmails('weekly');
    });

    // Notification cleanup: Every day at 3:00 AM UTC
    // Deletes expired notifications
    this.notificationCleanupJob = cron.schedule('0 3 * * *', async () => {
      await this.cleanupExpiredNotifications();
    });

    // Trial reminders: Every day at 9:00 AM UTC
    // Sends reminder emails for expiring trials (7d, 3d, 1d before expiry)
    // Also processes expired trials (downgrades to free)
    this.trialReminderJob = cron.schedule('0 9 * * *', async () => {
      await this.processTrialReminders();
    });

    // Stripe sync: Every day at 3:00 AM UTC
    // Reconciles local database state with Stripe to fix any drift
    this.stripeSyncJob = cron.schedule('0 3 * * *', async () => {
      await this.syncStripeSubscriptions();
    });

    // Grace period processing: Every hour at minute 45
    // Suspends organizations that have exceeded their payment grace period
    this.gracePeriodJob = cron.schedule('45 * * * *', async () => {
      await this.processExpiredGracePeriods();
    });

    // Feature grant expiration: Every hour at minute 15
    // Marks expired feature grants and removes access
    this.featureGrantExpirationJob = cron.schedule('15 * * * *', async () => {
      await this.processExpiredFeatureGrants();
    });

    // Suspended organization cleanup: Every day at 4:00 AM UTC
    // Deletes organizations that have been suspended for 30+ days (e.g., expired trials)
    this.suspendedOrgCleanupJob = cron.schedule('0 4 * * *', async () => {
      await this.processSuspendedOrganizationCleanup();
    });

    logger.info('Scheduler service initialized successfully');
  }

  /**
   * Aggregate hourly metrics for all organizations
   * Rolls up per-request metrics into hourly summaries
   */
  private async aggregateHourlyMetrics(): Promise<void> {
    try {
      logger.info('Starting hourly metrics aggregation...');

      // Get all organizations that have recent metrics
      const orgs = await db('api_metrics')
        .select('organization_id')
        .distinct()
        .whereRaw('created_at >= NOW() - INTERVAL \'2 hours\'');

      logger.info(`Aggregating metrics for ${orgs.length} organizations`);

      // Aggregate metrics for each organization
      for (const org of orgs) {
        if (!org.organization_id) continue;
        
        try {
          await metricsService.calculateUsageSummary(org.organization_id, 'hourly');
        } catch (error) {
          logger.error(`Error aggregating hourly metrics for org ${org.organization_id}:`, error);
          // Continue with next organization
        }
      }

      logger.info('Hourly metrics aggregation completed successfully');
    } catch (error) {
      logger.error('Error during hourly metrics aggregation:', error);
    }
  }

  /**
   * Aggregate daily metrics for all organizations
   * Combines hourly summaries into daily summaries
   */
  private async aggregateDailyMetrics(): Promise<void> {
    try {
      logger.info('Starting daily metrics aggregation...');

      // Get all organizations that have metrics
      const orgs = await db('api_metrics')
        .select('organization_id')
        .distinct()
        .whereRaw('created_at >= NOW() - INTERVAL \'2 days\'');

      logger.info(`Aggregating daily metrics for ${orgs.length} organizations`);

      // Aggregate metrics for each organization
      for (const org of orgs) {
        if (!org.organization_id) continue;
        
        try {
          await metricsService.calculateUsageSummary(org.organization_id, 'daily');
        } catch (error) {
          logger.error(`Error aggregating daily metrics for org ${org.organization_id}:`, error);
          // Continue with next organization
        }
      }

      logger.info('Daily metrics aggregation completed successfully');
    } catch (error) {
      logger.error('Error during daily metrics aggregation:', error);
    }
  }

  /**
   * Aggregate monthly metrics for all organizations
   * Combines daily summaries into monthly summaries
   */
  private async aggregateMonthlyMetrics(): Promise<void> {
    try {
      logger.info('Starting monthly metrics aggregation...');

      // Get all organizations that have metrics
      const orgs = await db('api_metrics')
        .select('organization_id')
        .distinct()
        .whereRaw('created_at >= NOW() - INTERVAL \'35 days\'');

      logger.info(`Aggregating monthly metrics for ${orgs.length} organizations`);

      // Aggregate metrics for each organization
      for (const org of orgs) {
        if (!org.organization_id) continue;
        
        try {
          await metricsService.calculateUsageSummary(org.organization_id, 'monthly');
        } catch (error) {
          logger.error(`Error aggregating monthly metrics for org ${org.organization_id}:`, error);
          // Continue with next organization
        }
      }

      logger.info('Monthly metrics aggregation completed successfully');
    } catch (error) {
      logger.error('Error during monthly metrics aggregation:', error);
    }
  }

  /**
   * Cleanup expired multipart uploads
   * Aborts incomplete uploads to prevent storage charges and cleans up DB records
   */
  private async cleanupExpiredUploads(): Promise<void> {
    try {
      logger.info('Starting expired upload cleanup...');

      const cleanedCount = await multipartUploadService.cleanupExpiredSessions();

      if (cleanedCount > 0) {
        logger.info(`Expired upload cleanup completed: ${cleanedCount} sessions cleaned`);
      } else {
        logger.debug('Expired upload cleanup completed: no expired sessions found');
      }
    } catch (error) {
      logger.error('Error during expired upload cleanup:', error);
    }
  }

  /**
   * Send digest emails to users who have opted for daily/weekly digest
   */
  private async sendDigestEmails(frequency: DigestFrequency): Promise<void> {
    try {
      logger.info(`Starting ${frequency} digest email job...`);

      // Get users who need a digest
      const users = await notificationPreferencesService.getUsersNeedingDigest(frequency);

      logger.info(`Found ${users.length} users for ${frequency} digest`);

      let successCount = 0;
      let errorCount = 0;

      for (const { userId, lastDigestSentAt } of users) {
        try {
          // Get notifications since last digest (or last 24h for daily, 7d for weekly)
          const since = lastDigestSentAt || new Date(
            Date.now() - (frequency === 'daily' ? 24 : 7 * 24) * 60 * 60 * 1000
          );

          const notifications = await notificationService.getPendingDigestNotifications(userId, since);

          if (notifications.length === 0) {
            // Update last digest sent even if no notifications
            await notificationPreferencesService.updateLastDigestSent(userId);
            continue;
          }

          // Get user details
          const user = await db('users').where('id', userId).first();
          if (!user || !user.email) {
            continue;
          }

          // Generate and send digest email
          await this.sendDigestEmailToUser(user, notifications, frequency);

          // Mark notifications as email sent and update last digest sent
          for (const notification of notifications) {
            await notificationService.markEmailSent(notification.id);
          }
          await notificationPreferencesService.updateLastDigestSent(userId);

          successCount++;
        } catch (error) {
          logger.error(`Error sending ${frequency} digest to user ${userId}:`, error);
          errorCount++;
        }
      }

      logger.info(`${frequency} digest job completed: ${successCount} sent, ${errorCount} errors`);
    } catch (error) {
      logger.error(`Error during ${frequency} digest email job:`, error);
    }
  }

  /**
   * Send digest email to a specific user
   */
  private async sendDigestEmailToUser(
    user: any,
    notifications: any[],
    frequency: DigestFrequency
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    // Group notifications by type
    const grouped: Record<string, any[]> = {};
    for (const notification of notifications) {
      if (!grouped[notification.type]) {
        grouped[notification.type] = [];
      }
      grouped[notification.type]!.push(notification);
    }

    // Generate notification list HTML
    let notificationListHtml = '';
    for (const [type, items] of Object.entries(grouped)) {
      const typeLabel = this.getNotificationTypeLabel(type);
      notificationListHtml += `
        <div style="margin-bottom: 20px;">
          <h3 style="color: ${BRAND_COLORS.primary}; margin: 0 0 10px 0; font-size: 16px;">
            ${typeLabel} (${items.length})
          </h3>
          <ul style="margin: 0; padding-left: 20px; list-style-type: disc;">
            ${items.slice(0, 5).map((n) => `
              <li style="margin-bottom: 8px; color: ${BRAND_COLORS.text};">
                <strong>${n.title}</strong>
                ${n.action_url ? `<br><a href="${n.action_url}" style="color: ${BRAND_COLORS.primary}; text-decoration: none; font-size: 12px;">View details</a>` : ''}
              </li>
            `).join('')}
            ${items.length > 5 ? `<li style="color: ${BRAND_COLORS.textMuted};">...and ${items.length - 5} more</li>` : ''}
          </ul>
        </div>
      `;
    }

    const periodLabel = frequency === 'daily' ? 'today' : 'this week';
    const subject = `Your ${frequency} notification digest - ${notifications.length} updates`;

    const html = generateEmailTemplate({
      title: `Your ${frequency === 'daily' ? 'Daily' : 'Weekly'} Digest`,
      preheader: `You have ${notifications.length} notifications ${periodLabel}`,
      content: `
        <p>Hi ${user.name || user.email},</p>
        <p>Here's a summary of your notifications from ${periodLabel}:</p>

        ${createInfoCard(`
          <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${BRAND_COLORS.primary};">
            ${notifications.length}
          </p>
          <p style="margin: 5px 0 0 0; color: ${BRAND_COLORS.textMuted};">
            new notifications
          </p>
        `)}

        ${notificationListHtml}
      `,
      ctaButton: {
        text: 'View All Notifications',
        url: `${frontendUrl}/notifications`,
      },
      footer: `
        <p style="color: ${BRAND_COLORS.textMuted}; font-size: 12px;">
          You're receiving this ${frequency} digest because of your notification preferences.
          <a href="${frontendUrl}/profile" style="color: ${BRAND_COLORS.primary};">Update preferences</a>
        </p>
      `,
    });

    await emailService.sendEmail({
      to: user.email,
      subject,
      html,
    });

    logger.info(`${frequency} digest sent to ${user.email} with ${notifications.length} notifications`);
  }

  /**
   * Get human-readable label for notification type
   */
  private getNotificationTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      task_assigned: 'Tasks Assigned',
      review_comment: 'Review Comments',
      recording_ready: 'Recordings Ready',
      task_due_soon: 'Tasks Due Soon',
      task_overdue: 'Overdue Tasks',
      recording_submitted: 'Recordings Submitted',
      review_requested: 'Reviews Requested',
      review_completed: 'Reviews Completed',
      feedback_received: 'Feedback Received',
      mention: 'Mentions',
      system: 'System Notifications',
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /**
   * Cleanup expired notifications
   */
  private async cleanupExpiredNotifications(): Promise<void> {
    try {
      logger.info('Starting expired notification cleanup...');

      const deletedCount = await notificationService.deleteExpired();

      if (deletedCount > 0) {
        logger.info(`Expired notification cleanup completed: ${deletedCount} notifications deleted`);
      } else {
        logger.debug('Expired notification cleanup completed: no expired notifications found');
      }
    } catch (error) {
      logger.error('Error during expired notification cleanup:', error);
    }
  }

  /**
   * Process trial reminders and expirations
   * Sends reminder emails at 7d, 3d, 1d before trial end
   * Also processes expired trials and downgrades to free tier
   */
  private async processTrialReminders(): Promise<void> {
    try {
      logger.info('Starting trial reminder processing...');

      const results = await trialService.processTrialReminders();

      logger.info(`Trial reminder processing completed:`, {
        total_processed: results.processed,
        reminders_7d: results.reminders7d.length,
        reminders_3d: results.reminders3d.length,
        reminders_1d: results.reminders1d.length,
        expired_processed: results.expired.length,
      });

      // Log any errors
      const allResults = [
        ...results.reminders7d,
        ...results.reminders3d,
        ...results.reminders1d,
        ...results.expired,
      ];

      const errors = allResults.filter((r) => r.error);
      if (errors.length > 0) {
        logger.warn(`Trial reminder errors: ${errors.length}`, {
          errors: errors.map((e) => ({
            org: e.organizationId,
            error: e.error,
          })),
        });
      }
    } catch (error) {
      logger.error('Error during trial reminder processing:', error);
    }
  }

  /**
   * Sync all subscriptions with Stripe
   * Reconciles local database state with Stripe to fix any drift
   */
  private async syncStripeSubscriptions(): Promise<void> {
    try {
      logger.info('Starting Stripe sync job...');

      const results = await stripeSyncService.syncAllOrganizations();

      logger.info('Stripe sync job completed:', {
        total: results.total,
        synced: results.synced,
        errors: results.errors,
      });

      // Log details if there were changes
      if (results.synced > 0) {
        logger.info('Stripe sync changes:', {
          changes: results.details
            .filter((d) => d.changes.length > 0)
            .map((d) => ({
              org: d.organizationId,
              changes: d.changes,
            })),
        });
      }

      // Log errors if any
      if (results.errors > 0) {
        logger.warn('Stripe sync errors:', {
          errors: results.details
            .filter((d) => d.error)
            .map((d) => ({
              org: d.organizationId,
              error: d.error,
            })),
        });
      }
    } catch (error) {
      logger.error('Error during Stripe sync job:', error);
    }
  }

  /**
   * Process expired grace periods
   * Suspends organizations that have exceeded their payment grace period
   */
  private async processExpiredGracePeriods(): Promise<void> {
    try {
      logger.debug('Starting grace period processing...');

      const results = await stripeSyncService.processExpiredGracePeriods();

      if (results && results.processed > 0) {
        logger.info('Grace period processing completed:', {
          processed: results.processed,
          suspended: results.suspended.length,
        });

        if (results.suspended.length > 0) {
          logger.warn('Organizations suspended due to expired grace period:', {
            organizationIds: results.suspended,
          });
        }
      }
    } catch (error) {
      logger.error('Error during grace period processing:', error);
    }
  }


  /**
   * Process expired feature grants
   * Marks grants as expired when their expiration date has passed
   */
  private async processExpiredFeatureGrants(): Promise<void> {
    try {
      logger.debug('Starting feature grant expiration processing...');

      const result = await featureGrantService.processExpiredGrants();

      if (result.processed > 0) {
        logger.info('Feature grant expiration processing completed:', {
          processed: result.processed,
        });
      }

      if (result.errors.length > 0) {
        logger.warn('Some feature grant expirations failed:', {
          errors: result.errors,
        });
      }
    } catch (error) {
      logger.error('Error during feature grant expiration processing:', error);
    }
  }

  /**
   * Process suspended organization cleanup
   * Deletes organizations that have been suspended past their scheduled deletion date
   * This typically happens 30 days after trial expiration without conversion to paid
   */
  private async processSuspendedOrganizationCleanup(): Promise<void> {
    try {
      logger.info('Starting suspended organization cleanup...');

      const orgsToDelete = await trialService.getOrganizationsScheduledForDeletion();

      if (orgsToDelete.length === 0) {
        logger.debug('No suspended organizations due for deletion');
        return;
      }

      logger.info(`Found ${orgsToDelete.length} organizations scheduled for deletion`);

      let deleted = 0;
      const errors: Array<{ orgId: string; error: string }> = [];

      for (const org of orgsToDelete) {
        try {
          await trialService.deleteSuspendedOrganization(org.id);
          deleted++;
        } catch (error: any) {
          errors.push({
            orgId: org.id,
            error: error.message,
          });
        }
      }

      logger.info('Suspended organization cleanup completed:', {
        total: orgsToDelete.length,
        deleted,
        errors: errors.length,
      });

      if (errors.length > 0) {
        logger.warn('Some organization deletions failed:', { errors });
      }
    } catch (error) {
      logger.error('Error during suspended organization cleanup:', error);
    }
  }

  /**
   * Stop all scheduled jobs
   * Should be called on server shutdown
   */
  public stopScheduler(): void {
    logger.info('Stopping scheduler service...');

    if (this.hourlyJob) {
      this.hourlyJob.stop();
      this.hourlyJob = null;
    }

    if (this.dailyJob) {
      this.dailyJob.stop();
      this.dailyJob = null;
    }

    if (this.monthlyJob) {
      this.monthlyJob.stop();
      this.monthlyJob = null;
    }

    if (this.uploadCleanupJob) {
      this.uploadCleanupJob.stop();
      this.uploadCleanupJob = null;
    }

    if (this.dailyDigestJob) {
      this.dailyDigestJob.stop();
      this.dailyDigestJob = null;
    }

    if (this.weeklyDigestJob) {
      this.weeklyDigestJob.stop();
      this.weeklyDigestJob = null;
    }

    if (this.notificationCleanupJob) {
      this.notificationCleanupJob.stop();
      this.notificationCleanupJob = null;
    }

    if (this.trialReminderJob) {
      this.trialReminderJob.stop();
      this.trialReminderJob = null;
    }

    if (this.stripeSyncJob) {
      this.stripeSyncJob.stop();
      this.stripeSyncJob = null;
    }

    if (this.gracePeriodJob) {
      this.gracePeriodJob.stop();
      this.gracePeriodJob = null;
    }

    if (this.featureGrantExpirationJob) {
      this.featureGrantExpirationJob.stop();
      this.featureGrantExpirationJob = null;
    }

    if (this.suspendedOrgCleanupJob) {
      this.suspendedOrgCleanupJob.stop();
      this.suspendedOrgCleanupJob = null;
    }

    logger.info('Scheduler service stopped');
  }
}

export default new SchedulerService();
