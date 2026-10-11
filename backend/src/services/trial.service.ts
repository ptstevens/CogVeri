import { db } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../utils/AppError';
import { emailService } from './email.service';
import { PRICING_TIERS } from './pricing.service';
import { systemSettingsService } from './system-settings.service';
import {
  generateEmailTemplate,
  createInfoCard,
  createDetailsList,
  BRAND_COLORS,
} from '../utils/email-templates';

/**
 * Trial Service
 *
 * Manages trial periods for organizations:
 * - Starting trials (default 14 days)
 * - Checking trial status
 * - Sending trial reminder emails
 * - Converting trials to paid or downgrading to free
 */

export interface Trial {
  id: string;
  organizationId: string;
  tier: string;
  status: 'trialing' | 'active' | 'expired' | 'converted' | 'canceled';
  trialStart: Date;
  trialEnd: Date;
  daysRemaining: number;
  createdAt: Date;
}

export interface TrialReminderResult {
  organizationId: string;
  daysRemaining: number;
  emailSent: boolean;
  error?: string;
}

// Public email domains that should not be tracked for trial abuse prevention
// Users with these domains can always start trials (tracked per-org, not per-domain)
const PUBLIC_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'yandex.com',
  'mail.com',
];

class TrialService {
  // Fallback trial duration if system settings not available
  private readonly DEFAULT_TRIAL_DURATION_DAYS = 7;

  /**
   * Get the current trial duration from system settings
   * Falls back to default if settings unavailable
   */
  private async getTrialDurationDays(): Promise<number> {
    try {
      return await systemSettingsService.getTrialDurationDays();
    } catch (error) {
      logger.warn('Error getting trial duration from settings, using default:', error);
      return this.DEFAULT_TRIAL_DURATION_DAYS;
    }
  }

  /**
   * Start a new trial for an organization
   */
  async startTrial(organizationId: string, tierName: string = 'enterprise'): Promise<Trial> {
    try {
      // Validate tier exists
      const tier = PRICING_TIERS[tierName.toLowerCase()];
      if (!tier) {
        throw new BadRequestError(`Invalid tier: ${tierName}`);
      }

      // Check if organization exists
      const org = await db('organizations').where('id', organizationId).first();

      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      // Check if organization has already used a trial
      if (org.has_used_trial) {
        throw new BadRequestError('This organization has already used their free trial');
      }

      // Check for existing active trial
      const existingTrial = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .whereIn('status', ['trialing', 'active'])
        .first();

      if (existingTrial) {
        throw new BadRequestError('Organization already has an active subscription or trial');
      }

      const now = new Date();
      const trialEnd = new Date(now);
      const trialDurationDays = await this.getTrialDurationDays();
      trialEnd.setDate(trialEnd.getDate() + trialDurationDays);

      // Create trial subscription
      const [subscription] = await db('organization_subscriptions')
        .insert({
          organization_id: organizationId,
          tier: tierName.toLowerCase(),
          status: 'trialing',
          billing_interval: 'monthly',
          is_trial: true,
          trial_start: now,
          trial_end: trialEnd,
          current_period_start: now,
          current_period_end: trialEnd,
        })
        .returning('*');

      // Update organization tier
      await db('organizations').where('id', organizationId).update({
        subscription_tier: tierName.toLowerCase(),
        has_used_trial: true,
        updated_at: new Date(),
      });

      // Send welcome email
      await this.sendTrialWelcomeEmail(organizationId, tierName, trialEnd, trialDurationDays);

      // Record domain for trial abuse prevention (corporate domains only)
      if (org.owner_email) {
        await this.recordDomainTrial(org.owner_email, organizationId);
      }

      // Create audit log
      await db('audit_logs').insert({
        organization_id: organizationId,
        actor_id: null,
        action: 'trial_started',
        object_type: 'organization',
        object_id: organizationId,
        changes: {
          tier: tierName,
          trial_end: trialEnd.toISOString(),
          duration_days: trialDurationDays,
        },
        created_at: now,
      });

      logger.info(
        `Trial started for organization ${organizationId}: ${tierName} tier, ends ${trialEnd.toISOString()}`
      );

      return {
        id: subscription.id,
        organizationId,
        tier: tierName.toLowerCase(),
        status: 'trialing',
        trialStart: now,
        trialEnd,
        daysRemaining: trialDurationDays,
        createdAt: subscription.created_at,
      };
    } catch (error) {
      logger.error('Error starting trial:', error);
      throw error;
    }
  }

  /**
   * Check if trial is currently active
   */
  async isTrialActive(organizationId: string): Promise<boolean> {
    try {
      const subscription = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .where('status', 'trialing')
        .where('is_trial', true)
        .first();

      if (!subscription) {
        return false;
      }

      const now = new Date();
      const trialEnd = new Date(subscription.trial_end);

      return now < trialEnd;
    } catch (error) {
      logger.error('Error checking trial status:', error);
      return false;
    }
  }

  /**
   * Get trial end date for an organization
   */
  async getTrialEndDate(organizationId: string): Promise<Date | null> {
    try {
      const subscription = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .where('is_trial', true)
        .orderBy('created_at', 'desc')
        .first();

      if (!subscription || !subscription.trial_end) {
        return null;
      }

      return new Date(subscription.trial_end);
    } catch (error) {
      logger.error('Error getting trial end date:', error);
      return null;
    }
  }

  /**
   * Get days remaining in trial
   */
  async getTrialDaysRemaining(organizationId: string): Promise<number> {
    try {
      const trialEnd = await this.getTrialEndDate(organizationId);

      if (!trialEnd) {
        return 0;
      }

      const now = new Date();
      const diffMs = trialEnd.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return Math.max(0, diffDays);
    } catch (error) {
      logger.error('Error getting trial days remaining:', error);
      return 0;
    }
  }

  /**
   * Get trial details for an organization
   */
  async getTrialDetails(organizationId: string): Promise<Trial | null> {
    try {
      const subscription = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .where('is_trial', true)
        .orderBy('created_at', 'desc')
        .first();

      if (!subscription) {
        return null;
      }

      const now = new Date();
      const trialEnd = new Date(subscription.trial_end);
      const diffMs = trialEnd.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      return {
        id: subscription.id,
        organizationId: subscription.organization_id,
        tier: subscription.tier,
        status: subscription.status,
        trialStart: new Date(subscription.trial_start),
        trialEnd,
        daysRemaining,
        createdAt: new Date(subscription.created_at),
      };
    } catch (error) {
      logger.error('Error getting trial details:', error);
      return null;
    }
  }

  /**
   * Check if an email domain is eligible for a trial
   * Returns ineligible if a corporate domain has already used a trial
   * Public domains (gmail, yahoo, etc.) are always eligible
   */
  async checkDomainTrialEligibility(email: string): Promise<{
    eligible: boolean;
    reason?: 'DOMAIN_TRIAL_USED' | 'PUBLIC_DOMAIN';
    existingOrgName?: string;
  }> {
    try {
      const domain = this.extractDomainFromEmail(email);

      // Public domains are always eligible (not tracked)
      if (!domain) {
        return { eligible: true, reason: 'PUBLIC_DOMAIN' };
      }

      // Check if this corporate domain has already used a trial
      const existing = await db('trial_email_domains').where('email_domain', domain).first();

      if (existing) {
        // Get the organization name for the error message
        const org = await db('organizations').where('id', existing.organization_id).first();

        return {
          eligible: false,
          reason: 'DOMAIN_TRIAL_USED',
          existingOrgName: org?.name || 'an organization',
        };
      }

      return { eligible: true };
    } catch (error) {
      logger.error('Error checking domain trial eligibility:', error);
      // On error, allow the trial (fail open for user experience)
      return { eligible: true };
    }
  }

  /**
   * Extract domain from email, returns null for public domains
   */
  private extractDomainFromEmail(email: string): string | null {
    const parts = email.toLowerCase().split('@');
    if (parts.length !== 2) return null;

    const domain = parts[1];
    if (!domain) return null;

    // Public domains return null (not tracked for trial abuse)
    if (PUBLIC_EMAIL_DOMAINS.includes(domain)) {
      return null;
    }

    return domain;
  }

  /**
   * Record that a domain has used a trial (for abuse prevention)
   */
  private async recordDomainTrial(email: string, organizationId: string): Promise<void> {
    try {
      const domain = this.extractDomainFromEmail(email);

      // Only track corporate domains, not public email providers
      if (!domain) return;

      await db('trial_email_domains')
        .insert({
          email_domain: domain,
          organization_id: organizationId,
          trial_started_at: new Date(),
        })
        .onConflict('email_domain')
        .ignore(); // Ignore if domain already tracked

      logger.info(`Trial domain recorded: ${domain} for org ${organizationId}`);
    } catch (error) {
      logger.error('Error recording domain trial:', error);
      // Don't throw - domain tracking failure shouldn't block trial start
    }
  }

  /**
   * End trial - either convert to paid or downgrade to free
   */
  async endTrial(
    organizationId: string,
    convertToPaid: boolean,
    stripeSubscriptionId?: string
  ): Promise<void> {
    try {
      const subscription = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .where('status', 'trialing')
        .first();

      if (!subscription) {
        throw new NotFoundError('No active trial found for this organization');
      }

      const now = new Date();

      if (convertToPaid) {
        // Convert to paid subscription
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await db('organization_subscriptions')
          .where('id', subscription.id)
          .update({
            status: 'active',
            is_trial: false,
            current_period_start: now,
            current_period_end: periodEnd,
            stripe_subscription_id: stripeSubscriptionId || subscription.stripe_subscription_id,
            updated_at: now,
          });

        await db('audit_logs').insert({
          organization_id: organizationId,
          actor_id: null,
          action: 'trial_converted',
          object_type: 'organization',
          object_id: organizationId,
          changes: {
            tier: subscription.tier,
            converted_to: 'paid',
          },
          created_at: now,
        });

        logger.info(`Trial converted to paid for organization ${organizationId}`);
      } else {
        // Suspend organization instead of downgrading to free
        // Data is kept for 30 days to allow conversion, then auto-deleted
        const deletionDate = new Date(now);
        deletionDate.setDate(deletionDate.getDate() + 30);

        await db('organization_subscriptions').where('id', subscription.id).update({
          status: 'expired',
          updated_at: now,
        });

        // Suspend the organization (don't downgrade to free)
        await db('organizations').where('id', organizationId).update({
          is_active: false,
          suspended_at: now,
          suspended_reason: 'trial_expired',
          scheduled_deletion_at: deletionDate,
          updated_at: now,
        });

        // Send trial expired notification with reactivation info
        await this.sendTrialEndedEmail(organizationId, subscription.tier);

        await db('audit_logs').insert({
          organization_id: organizationId,
          actor_id: null,
          action: 'trial_expired',
          object_type: 'organization',
          object_id: organizationId,
          changes: {
            previous_tier: subscription.tier,
            suspended: true,
            scheduled_deletion_at: deletionDate.toISOString(),
          },
          created_at: now,
        });

        logger.info(
          `Trial expired for organization ${organizationId}, suspended until ${deletionDate.toISOString()}`
        );
      }
    } catch (error) {
      logger.error('Error ending trial:', error);
      throw error;
    }
  }

  /**
   * Get organizations with trials expiring within specified days
   */
  async getExpiringTrials(daysUntilExpiry: number): Promise<any[]> {
    try {
      const now = new Date();
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntilExpiry);

      // Set to end of day
      targetDate.setHours(23, 59, 59, 999);

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const subscriptions = await db('organization_subscriptions as s')
        .join('organizations as o', 's.organization_id', 'o.id')
        .where('s.status', 'trialing')
        .where('s.is_trial', true)
        .whereBetween('s.trial_end', [startOfDay, targetDate])
        .select('s.*', 'o.name as organization_name', 'o.owner_id');

      return subscriptions;
    } catch (error) {
      logger.error('Error getting expiring trials:', error);
      return [];
    }
  }

  /**
   * Process all trial reminders - called by scheduler
   */
  async processTrialReminders(): Promise<{
    processed: number;
    reminders7d: TrialReminderResult[];
    reminders3d: TrialReminderResult[];
    reminders1d: TrialReminderResult[];
    expired: TrialReminderResult[];
  }> {
    const results = {
      processed: 0,
      reminders7d: [] as TrialReminderResult[],
      reminders3d: [] as TrialReminderResult[],
      reminders1d: [] as TrialReminderResult[],
      expired: [] as TrialReminderResult[],
    };

    try {
      // 5-day reminders (using 7d column name for backwards compatibility)
      // With 7-day trials, send first reminder at 5 days remaining
      const trials5d = await this.getTrialsNeedingReminder(5, 'trial_reminder_7d_sent');
      for (const trial of trials5d) {
        const result = await this.sendTrialReminder(trial, 5);
        results.reminders7d.push(result); // Keep property name for API compatibility
        results.processed++;
      }

      // 3-day reminders
      const trials3d = await this.getTrialsNeedingReminder(3, 'trial_reminder_3d_sent');
      for (const trial of trials3d) {
        const result = await this.sendTrialReminder(trial, 3);
        results.reminders3d.push(result);
        results.processed++;
      }

      // 1-day reminders
      const trials1d = await this.getTrialsNeedingReminder(1, 'trial_reminder_1d_sent');
      for (const trial of trials1d) {
        const result = await this.sendTrialReminder(trial, 1);
        results.reminders1d.push(result);
        results.processed++;
      }

      // Process expired trials
      const expiredTrials = await this.getExpiredTrials();
      for (const trial of expiredTrials) {
        const result = await this.processExpiredTrial(trial);
        results.expired.push(result);
        results.processed++;
      }

      logger.info(`Processed ${results.processed} trial reminders/expirations`);
      return results;
    } catch (error) {
      logger.error('Error processing trial reminders:', error);
      throw error;
    }
  }

  /**
   * Get trials needing a specific reminder
   */
  private async getTrialsNeedingReminder(
    daysUntilExpiry: number,
    sentColumn: string
  ): Promise<any[]> {
    try {
      const now = new Date();
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntilExpiry);

      // Window: target day +/- 12 hours to handle job timing
      const windowStart = new Date(targetDate);
      windowStart.setHours(targetDate.getHours() - 12);

      const windowEnd = new Date(targetDate);
      windowEnd.setHours(targetDate.getHours() + 12);

      const trials = await db('organization_subscriptions as s')
        .join('organizations as o', 's.organization_id', 'o.id')
        .leftJoin('users as u', 'o.owner_id', 'u.id')
        .where('s.status', 'trialing')
        .where('s.is_trial', true)
        .where(sentColumn, false)
        .whereBetween('s.trial_end', [windowStart, windowEnd])
        .select(
          's.*',
          'o.name as organization_name',
          'o.owner_id',
          'u.email as owner_email',
          'u.name as owner_name'
        );

      return trials;
    } catch (error) {
      logger.error('Error getting trials needing reminder:', error);
      return [];
    }
  }

  /**
   * Get expired trials that haven't been processed
   */
  private async getExpiredTrials(): Promise<any[]> {
    try {
      const now = new Date();

      const trials = await db('organization_subscriptions as s')
        .join('organizations as o', 's.organization_id', 'o.id')
        .leftJoin('users as u', 'o.owner_id', 'u.id')
        .where('s.status', 'trialing')
        .where('s.is_trial', true)
        .where('s.trial_end', '<', now)
        .where('s.trial_ended_notification_sent', false)
        .select(
          's.*',
          'o.name as organization_name',
          'o.owner_id',
          'u.email as owner_email',
          'u.name as owner_name'
        );

      return trials;
    } catch (error) {
      logger.error('Error getting expired trials:', error);
      return [];
    }
  }

  /**
   * Send trial reminder email
   */
  private async sendTrialReminder(trial: any, daysRemaining: number): Promise<TrialReminderResult> {
    const result: TrialReminderResult = {
      organizationId: trial.organization_id,
      daysRemaining,
      emailSent: false,
    };

    try {
      if (!trial.owner_email) {
        result.error = 'No owner email found';
        return result;
      }

      const tier = PRICING_TIERS[trial.tier] ?? PRICING_TIERS['enterprise'];
      if (!tier) {
        result.error = 'Invalid tier configuration';
        return result;
      }
      const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';
      const trialEndDate = new Date(trial.trial_end);

      const subject =
        daysRemaining === 1
          ? `Your ${tier.displayName} trial ends tomorrow!`
          : `Your ${tier.displayName} trial ends in ${daysRemaining} days`;

      const urgencyColor =
        daysRemaining === 1
          ? BRAND_COLORS.error
          : daysRemaining <= 3
            ? BRAND_COLORS.warning
            : BRAND_COLORS.primary;

      const html = generateEmailTemplate({
        title: 'Trial Ending Soon',
        preheader: subject,
        headerColor: urgencyColor,
        content: `
          <p>Hi ${trial.owner_name || 'there'},</p>
          <p>Your <strong>${tier.displayName}</strong> trial for <strong>${trial.organization_name}</strong> ends ${daysRemaining === 1 ? 'tomorrow' : `in ${daysRemaining} days`}.</p>

          ${createInfoCard(
            `
            <p style="margin: 0; font-size: 24px; font-weight: bold; color: ${urgencyColor};">
              ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining
            </p>
            <p style="margin: 10px 0 0 0; color: ${BRAND_COLORS.textMuted};">
              Trial ends: ${trialEndDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          `,
            urgencyColor
          )}

          <p><strong>What happens when your trial ends?</strong></p>
          <ul style="margin: 15px 0; padding-left: 20px;">
            <li>Your account will be downgraded to the Free plan</li>
            <li>Access to ${tier.displayName} features will be restricted</li>
            <li>Your data and recordings will be preserved</li>
          </ul>

          <p><strong>Don't lose access to:</strong></p>
          ${createDetailsList([
            {
              label: 'Storage',
              value:
                tier.limits.maxStorageGb === -1 ? 'Unlimited' : `${tier.limits.maxStorageGb}GB`,
            },
            {
              label: 'Team Members',
              value: tier.limits.maxMembers === -1 ? 'Unlimited' : `${tier.limits.maxMembers}`,
            },
            { label: 'HD Recording', value: tier.features.hdRecording ? 'Yes' : 'No' },
            { label: 'Advanced Analytics', value: tier.features.advancedAnalytics ? 'Yes' : 'No' },
          ])}
        `,
        ctaButton: {
          text: 'Upgrade Now',
          url: `${frontendUrl}/organizations/settings?tab=billing`,
          color: urgencyColor,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px;">
            Questions about upgrading? Reply to this email or visit our
            <a href="${frontendUrl}/pricing" style="color: ${BRAND_COLORS.primary};">pricing page</a>.
          </p>
        `,
      });

      await emailService.sendEmail({
        to: trial.owner_email,
        subject,
        html,
      });

      // Mark reminder as sent
      // Note: 5-day reminders use the 7d column for backwards compatibility
      const sentColumn =
        daysRemaining === 5 || daysRemaining === 7
          ? 'trial_reminder_7d_sent'
          : daysRemaining === 3
            ? 'trial_reminder_3d_sent'
            : 'trial_reminder_1d_sent';

      await db('organization_subscriptions')
        .where('id', trial.id)
        .update({
          [sentColumn]: true,
          updated_at: new Date(),
        });

      result.emailSent = true;
      logger.info(
        `Trial reminder (${daysRemaining}d) sent to ${trial.owner_email} for org ${trial.organization_id}`
      );
    } catch (error: any) {
      result.error = error.message;
      logger.error(`Error sending trial reminder:`, error);
    }

    return result;
  }

  /**
   * Process an expired trial
   */
  private async processExpiredTrial(trial: any): Promise<TrialReminderResult> {
    const result: TrialReminderResult = {
      organizationId: trial.organization_id,
      daysRemaining: 0,
      emailSent: false,
    };

    try {
      // End the trial (downgrade to free)
      await this.endTrial(trial.organization_id, false);

      // Mark notification as sent
      await db('organization_subscriptions').where('id', trial.id).update({
        trial_ended_notification_sent: true,
        updated_at: new Date(),
      });

      result.emailSent = true;
    } catch (error: any) {
      result.error = error.message;
      logger.error('Error processing expired trial:', error);
    }

    return result;
  }

  /**
   * Send trial welcome email
   */
  private async sendTrialWelcomeEmail(
    organizationId: string,
    tierName: string,
    trialEnd: Date,
    trialDurationDays?: number
  ): Promise<void> {
    try {
      // Get duration if not passed
      const duration = trialDurationDays ?? (await this.getTrialDurationDays());

      const org = await db('organizations').where('id', organizationId).first();

      if (!org?.owner_id) return;

      const owner = await db('users').where('id', org.owner_id).first();

      if (!owner?.email) return;

      const tier = PRICING_TIERS[tierName.toLowerCase()] ?? PRICING_TIERS['enterprise'];
      if (!tier) return;
      const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

      const html = generateEmailTemplate({
        title: `Welcome to Your ${tier.displayName} Trial!`,
        preheader: `Your ${duration}-day ${tier.displayName} trial has started`,
        headerColor: BRAND_COLORS.success,
        content: `
          <p>Hi ${owner.name || 'there'},</p>
          <p>Great news! Your <strong>${duration}-day ${tier.displayName} trial</strong> for <strong>${org.name}</strong> is now active.</p>

          ${createInfoCard(
            `
            <p style="margin: 0;">
              <strong>Trial Period:</strong> ${new Date().toLocaleDateString()} - ${trialEnd.toLocaleDateString()}
            </p>
          `,
            BRAND_COLORS.success
          )}

          <p><strong>Here's what you can do with ${tier.displayName}:</strong></p>
          ${createDetailsList([
            {
              label: 'Storage',
              value:
                tier.limits.maxStorageGb === -1 ? 'Unlimited' : `${tier.limits.maxStorageGb}GB`,
            },
            {
              label: 'Team Members',
              value:
                tier.limits.maxMembers === -1 ? 'Unlimited' : `Up to ${tier.limits.maxMembers}`,
            },
            {
              label: 'Video Length',
              value:
                tier.limits.maxVideoLengthMinutes === -1
                  ? 'Unlimited'
                  : `Up to ${tier.limits.maxVideoLengthMinutes} min`,
            },
            {
              label: 'HD Recording',
              value: tier.features.hdRecording ? 'Included' : 'Not included',
            },
          ])}

          <p>Make the most of your trial by exploring all the features available to you!</p>
        `,
        ctaButton: {
          text: 'Go to Dashboard',
          url: `${frontendUrl}/dashboard`,
          color: BRAND_COLORS.success,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px;">
            Need help getting started?
            <a href="${frontendUrl}/help" style="color: ${BRAND_COLORS.primary};">Check out our guides</a>
            or reply to this email.
          </p>
        `,
      });

      await emailService.sendEmail({
        to: owner.email,
        subject: `Welcome to Your ${tier.displayName} Trial!`,
        html,
      });

      logger.info(`Trial welcome email sent to ${owner.email}`);
    } catch (error) {
      logger.error('Error sending trial welcome email:', error);
      // Don't throw - email failure shouldn't block trial start
    }
  }

  /**
   * Send trial ended notification email
   */
  private async sendTrialEndedEmail(organizationId: string, previousTier: string): Promise<void> {
    try {
      const org = await db('organizations').where('id', organizationId).first();

      if (!org?.owner_id) return;

      const owner = await db('users').where('id', org.owner_id).first();

      if (!owner?.email) return;

      const tier = PRICING_TIERS[previousTier.toLowerCase()] ?? PRICING_TIERS['enterprise'];
      if (!tier) return;
      const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

      const html = generateEmailTemplate({
        title: 'Your Trial Has Ended',
        preheader: `Your ${tier.displayName} trial has ended - subscribe to continue`,
        headerColor: BRAND_COLORS.warning,
        content: `
          <p>Hi ${owner.name || 'there'},</p>
          <p>Your <strong>${tier.displayName}</strong> trial for <strong>${org.name}</strong> has ended.</p>

          ${createInfoCard(
            `
            <p style="margin: 0 0 10px 0;"><strong>Your account has been suspended</strong></p>
            <p style="margin: 0;">Your data is safe and will be kept for <strong>30 days</strong>. Subscribe to a paid plan to regain access to your account and all your data.</p>
          `,
            BRAND_COLORS.warning
          )}

          <p><strong>What happens next:</strong></p>
          <ul style="margin: 15px 0; padding-left: 20px;">
            <li>Your recordings and data are preserved</li>
            <li>Access is paused until you subscribe</li>
            <li>After 30 days without a subscription, your account will be deleted</li>
          </ul>

          <p>Continue with ${tier.displayName} for just <strong>$${tier.monthlyPrice}/user/month</strong> and get instant access back:</p>
          <ul style="margin: 15px 0; padding-left: 20px;">
            <li>All your recordings and data restored</li>
            <li>${tier.limits.maxStorageGb === -1 ? 'Unlimited storage' : `${tier.limits.maxStorageGb}GB storage`}</li>
            ${tier.features.hdRecording ? '<li>HD Recording</li>' : ''}
            ${tier.features.advancedAnalytics ? '<li>Advanced Analytics</li>' : ''}
          </ul>
        `,
        ctaButton: {
          text: 'Subscribe Now',
          url: `${frontendUrl}/reactivate?org=${organizationId}`,
          color: BRAND_COLORS.primary,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px;">
            Questions? Reply to this email and we'll be happy to help!
          </p>
        `,
      });

      await emailService.sendEmail({
        to: owner.email,
        subject: 'Your Trial Has Ended - Subscribe to Keep Your Data',
        html,
      });

      logger.info(`Trial ended email sent to ${owner.email}`);
    } catch (error) {
      logger.error('Error sending trial ended email:', error);
    }
  }

  /**
   * Reactivate a suspended organization when they subscribe
   * Called after successful payment/subscription creation
   */
  async reactivateSuspendedOrganization(
    organizationId: string,
    newTier: string,
    stripeSubscriptionId?: string
  ): Promise<void> {
    try {
      const org = await db('organizations').where('id', organizationId).first();

      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      if (!org.suspended_at) {
        logger.warn(`Organization ${organizationId} is not suspended, skipping reactivation`);
        return;
      }

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      // Update or create subscription
      const existingSubscription = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .orderBy('created_at', 'desc')
        .first();

      if (existingSubscription) {
        await db('organization_subscriptions').where('id', existingSubscription.id).update({
          tier: newTier.toLowerCase(),
          status: 'active',
          is_trial: false,
          current_period_start: now,
          current_period_end: periodEnd,
          stripe_subscription_id: stripeSubscriptionId,
          updated_at: now,
        });
      } else {
        await db('organization_subscriptions').insert({
          organization_id: organizationId,
          tier: newTier.toLowerCase(),
          status: 'active',
          is_trial: false,
          billing_interval: 'monthly',
          current_period_start: now,
          current_period_end: periodEnd,
          stripe_subscription_id: stripeSubscriptionId,
        });
      }

      // Reactivate the organization
      await db('organizations').where('id', organizationId).update({
        is_active: true,
        subscription_tier: newTier.toLowerCase(),
        suspended_at: null,
        suspended_reason: null,
        scheduled_deletion_at: null,
        updated_at: now,
      });

      await db('audit_logs').insert({
        organization_id: organizationId,
        actor_id: null,
        action: 'organization_reactivated',
        object_type: 'organization',
        object_id: organizationId,
        changes: {
          new_tier: newTier,
          previous_suspended_reason: org.suspended_reason,
          suspended_duration_days: Math.floor(
            (now.getTime() - new Date(org.suspended_at).getTime()) / (1000 * 60 * 60 * 24)
          ),
        },
        created_at: now,
      });

      logger.info(`Organization ${organizationId} reactivated with ${newTier} tier`);
    } catch (error) {
      logger.error('Error reactivating organization:', error);
      throw error;
    }
  }

  /**
   * Get organizations scheduled for deletion
   * Used by cleanup scheduler job
   */
  async getOrganizationsScheduledForDeletion(): Promise<any[]> {
    try {
      const now = new Date();
      return await db('organizations')
        .where('scheduled_deletion_at', '<=', now)
        .whereNotNull('suspended_at')
        .select(
          'id',
          'name',
          'owner_id',
          'suspended_at',
          'suspended_reason',
          'scheduled_deletion_at'
        );
    } catch (error) {
      logger.error('Error getting organizations scheduled for deletion:', error);
      return [];
    }
  }

  /**
   * Permanently delete a suspended organization and all its data
   * Called by cleanup scheduler after 30-day grace period
   */
  async deleteSuspendedOrganization(organizationId: string): Promise<void> {
    try {
      const org = await db('organizations')
        .where('id', organizationId)
        .whereNotNull('suspended_at')
        .first();

      if (!org) {
        logger.warn(`Organization ${organizationId} not found or not suspended, skipping deletion`);
        return;
      }

      // Verify it's past the scheduled deletion date
      if (org.scheduled_deletion_at && new Date(org.scheduled_deletion_at) > new Date()) {
        logger.warn(`Organization ${organizationId} not yet due for deletion`);
        return;
      }

      logger.info(`Starting deletion of suspended organization ${organizationId} (${org.name})`);

      // Get owner email before deletion for notification
      const owner = await db('users').where('id', org.owner_id).first();

      // Delete in order respecting foreign key constraints
      // Note: Some tables may have ON DELETE CASCADE, but being explicit is safer

      // Delete recordings and associated data
      const recordings = await db('recordings')
        .where('organization_id', organizationId)
        .select('id');

      const recordingIds = recordings.map((r) => r.id);
      if (recordingIds.length > 0) {
        await db('recording_comments').whereIn('recording_id', recordingIds).del();
        await db('recording_analyses').whereIn('recording_id', recordingIds).del();
        await db('transcripts').whereIn('recording_id', recordingIds).del();
        await db('recordings').whereIn('id', recordingIds).del();
      }

      // Delete tasks and associated data
      const tasks = await db('tasks').where('organization_id', organizationId).select('id');

      const taskIds = tasks.map((t) => t.id);
      if (taskIds.length > 0) {
        await db('task_assignments').whereIn('task_id', taskIds).del();
        await db('magic_links').whereIn('task_id', taskIds).del();
        await db('tasks').whereIn('id', taskIds).del();
      }

      // Delete organization members
      await db('organization_members').where('organization_id', organizationId).del();

      // Delete organization invitations
      await db('organization_invitations').where('organization_id', organizationId).del();

      // Delete subscriptions
      await db('organization_subscriptions').where('organization_id', organizationId).del();

      // Delete feature grants
      await db('organization_feature_grants').where('organization_id', organizationId).del();

      // Delete audit logs (optional - might want to keep for compliance)
      await db('audit_logs').where('organization_id', organizationId).del();

      // Delete notifications
      await db('notifications').where('organization_id', organizationId).del();

      // Update users to remove organization reference
      await db('users').where('organization_id', organizationId).update({
        organization_id: null,
        org_role: null,
        org_status: null,
        updated_at: new Date(),
      });

      // Finally delete the organization
      await db('organizations').where('id', organizationId).del();

      logger.info(`Successfully deleted organization ${organizationId} (${org.name})`);

      // Send deletion notification to owner
      if (owner?.email) {
        await this.sendOrganizationDeletedEmail(owner.email, owner.name, org.name);
      }
    } catch (error) {
      logger.error(`Error deleting organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Send email notifying user their organization has been deleted
   */
  private async sendOrganizationDeletedEmail(
    email: string,
    userName: string | null,
    orgName: string
  ): Promise<void> {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

      const html = generateEmailTemplate({
        title: 'Your Account Has Been Deleted',
        preheader: `Your CogVeri account for ${orgName} has been removed`,
        headerColor: BRAND_COLORS.error,
        content: `
          <p>Hi ${userName || 'there'},</p>
          <p>Your CogVeri account for <strong>${orgName}</strong> has been permanently deleted after the 30-day grace period following your trial expiration.</p>

          ${createInfoCard(
            `
            <p style="margin: 0;"><strong>All data has been removed</strong></p>
            <p style="margin: 10px 0 0 0;">This includes recordings, tasks, team members, and all associated data.</p>
          `,
            BRAND_COLORS.error
          )}

          <p>If you'd like to use CogVeri again in the future, you're welcome to create a new account anytime.</p>
        `,
        ctaButton: {
          text: 'Create New Account',
          url: `${frontendUrl}/register`,
          color: BRAND_COLORS.primary,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px;">
            Questions? Contact us at support@cogveri.com
          </p>
        `,
      });

      await emailService.sendEmail({
        to: email,
        subject: `Your CogVeri Account for ${orgName} Has Been Deleted`,
        html,
      });

      logger.info(`Organization deleted email sent to ${email}`);
    } catch (error) {
      logger.error('Error sending organization deleted email:', error);
    }
  }

  /**
   * Extend a trial (admin function)
   */
  async extendTrial(organizationId: string, additionalDays: number): Promise<Trial> {
    try {
      const subscription = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .whereIn('status', ['trialing', 'expired'])
        .where('is_trial', true)
        .orderBy('created_at', 'desc')
        .first();

      if (!subscription) {
        throw new NotFoundError('No trial found for this organization');
      }

      const currentEnd = new Date(subscription.trial_end);
      const newEnd = new Date(currentEnd);
      newEnd.setDate(newEnd.getDate() + additionalDays);

      await db('organization_subscriptions').where('id', subscription.id).update({
        trial_end: newEnd,
        current_period_end: newEnd,
        status: 'trialing', // Reactivate if expired
        updated_at: new Date(),
      });

      // Update org tier if it was downgraded
      await db('organizations').where('id', organizationId).update({
        subscription_tier: subscription.tier,
        updated_at: new Date(),
      });

      await db('audit_logs').insert({
        organization_id: organizationId,
        actor_id: null,
        action: 'trial_extended',
        object_type: 'organization',
        object_id: organizationId,
        changes: {
          previous_end: currentEnd.toISOString(),
          new_end: newEnd.toISOString(),
          additional_days: additionalDays,
        },
        created_at: new Date(),
      });

      logger.info(`Trial extended for org ${organizationId} by ${additionalDays} days`);

      return (await this.getTrialDetails(organizationId)) as Trial;
    } catch (error) {
      logger.error('Error extending trial:', error);
      throw error;
    }
  }

  /**
   * Shorten a trial (admin function)
   */
  async shortenTrial(
    organizationId: string,
    newEndDate: Date,
    adminUserId?: string
  ): Promise<Trial> {
    try {
      const subscription = await db('organization_subscriptions')
        .where('organization_id', organizationId)
        .where('status', 'trialing')
        .first();

      if (!subscription) {
        throw new NotFoundError('No active trial found for this organization');
      }

      const currentEnd = new Date(subscription.trial_end);

      if (newEndDate > currentEnd) {
        throw new BadRequestError(
          'New end date must be before current end date. Use extendTrial to extend.'
        );
      }

      // Update trial end date
      await db('organization_subscriptions').where('id', subscription.id).update({
        trial_end: newEndDate,
        current_period_end: newEndDate,
        updated_at: new Date(),
      });

      // If new end date is in the past, process as expired
      if (newEndDate <= new Date()) {
        await this.endTrial(organizationId, false);
      }

      await db('audit_logs').insert({
        organization_id: organizationId,
        actor_id: adminUserId || null,
        action: 'trial_shortened',
        object_type: 'organization',
        object_id: organizationId,
        changes: {
          previous_end: currentEnd.toISOString(),
          new_end: newEndDate.toISOString(),
        },
        created_at: new Date(),
      });

      logger.info(`Trial shortened for org ${organizationId} to ${newEndDate.toISOString()}`);

      return (await this.getTrialDetails(organizationId)) as Trial;
    } catch (error) {
      logger.error('Error shortening trial:', error);
      throw error;
    }
  }

  /**
   * Get all trials with filtering (admin function)
   */
  async getTrials(options?: {
    status?: 'trialing' | 'expired' | 'converted' | 'canceled';
    expiringWithinDays?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    trials: Array<{
      id: string;
      organizationId: string;
      organizationName: string;
      tier: string;
      status: string;
      trialStart: Date;
      trialEnd: Date;
      daysRemaining: number;
    }>;
    total: number;
  }> {
    try {
      const page = options?.page ?? 1;
      const limit = options?.limit ?? 50;
      const offset = (page - 1) * limit;

      let query = db('organization_subscriptions as os')
        .join('organizations as o', 'os.organization_id', 'o.id')
        .where('os.is_trial', true);

      let countQuery = db('organization_subscriptions').where('is_trial', true);

      if (options?.status) {
        query = query.where('os.status', options.status);
        countQuery = countQuery.where('status', options.status);
      }

      if (options?.expiringWithinDays) {
        const expirationThreshold = new Date();
        expirationThreshold.setDate(expirationThreshold.getDate() + options.expiringWithinDays);

        query = query
          .where('os.status', 'trialing')
          .where('os.trial_end', '>', new Date())
          .where('os.trial_end', '<=', expirationThreshold);

        countQuery = countQuery
          .where('status', 'trialing')
          .where('trial_end', '>', new Date())
          .where('trial_end', '<=', expirationThreshold);
      }

      const [trials, countResult] = await Promise.all([
        query
          .select(
            'os.id',
            'os.organization_id',
            'o.name as organization_name',
            'os.tier',
            'os.status',
            'os.trial_start',
            'os.trial_end'
          )
          .orderBy('os.trial_end', 'asc')
          .limit(limit)
          .offset(offset),
        countQuery.count('* as count').first(),
      ]);

      const now = new Date();
      return {
        trials: trials.map((t) => ({
          id: t.id,
          organizationId: t.organization_id,
          organizationName: t.organization_name,
          tier: t.tier,
          status: t.status,
          trialStart: t.trial_start,
          trialEnd: t.trial_end,
          daysRemaining: Math.max(
            0,
            Math.ceil((new Date(t.trial_end).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          ),
        })),
        total: Number((countResult as { count: string })?.count ?? 0),
      };
    } catch (error) {
      logger.error('Error getting trials:', error);
      throw error;
    }
  }
}

export default new TrialService();
