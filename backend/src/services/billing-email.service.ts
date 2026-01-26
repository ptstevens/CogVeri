/**
 * BillingEmailService
 *
 * Handles billing-related email notifications.
 * Extracted from BillingService for better separation of concerns (Phase 4).
 *
 * Responsibilities:
 * - Send dunning emails for failed payments
 * - Send payment action required emails (3D Secure, etc.)
 * - Log billing email events to audit trail
 */

import { db } from '../config/database';
import { logger } from '../utils/logger';
import { PRICING_TIERS } from './pricing.service';
import { emailService } from './email.service';
import {
  generateEmailTemplate,
  createInfoCard,
  createDetailsList,
  BRAND_COLORS,
} from '../utils/email-templates';

/**
 * Billing recipients interface
 */
interface BillingRecipients {
  to: string;
  cc?: string;
  recipientName: string;
}

export class BillingEmailService {
  /**
   * Get billing email recipients for an organization
   * Returns primary recipient (billing contact) and optional CC (subscriber if different)
   */
  private async getBillingRecipients(
    org: any,
    owner: any
  ): Promise<BillingRecipients> {
    const billingEmail = org.billing_email || owner?.email || '';
    const billingName = org.billing_name || owner?.name || 'there';
    const ownerEmail = owner?.email || '';

    // Determine if we need to CC the subscriber (owner)
    const shouldCcSubscriber =
      billingEmail &&
      ownerEmail &&
      billingEmail.toLowerCase() !== ownerEmail.toLowerCase();

    return {
      to: billingEmail,
      cc: shouldCcSubscriber ? ownerEmail : undefined,
      recipientName: billingName,
    };
  }

  /**
   * Log a billing event to the audit trail
   */
  private async logBillingEvent(
    organizationId: string,
    eventType: string,
    eventData: Record<string, any>
  ): Promise<void> {
    try {
      await db('billing_events').insert({
        organization_id: organizationId,
        event_type: eventType,
        event_data: eventData,
        status: 'processed',
        processed_at: new Date(),
        created_at: new Date(),
      });
    } catch (error) {
      logger.error('Error logging billing event:', error);
      // Don't throw - logging failure shouldn't break the main operation
    }
  }

  /**
   * Send dunning email for failed payment
   * Escalates urgency based on failure count
   */
  async sendDunningEmail(
    organizationId: string,
    failureCount: number,
    amountDue: number,
    currency: string,
    nextAttempt?: number | null,
    hostedInvoiceUrl?: string | null
  ): Promise<boolean> {
    try {
      // Get organization and owner details
      const org = await db('organizations')
        .where('id', organizationId)
        .first();

      if (!org) {
        logger.warn(`Dunning email: organization not found: ${organizationId}`);
        return false;
      }

      const owner = await db('users')
        .where('id', org.owner_id)
        .first();

      // Get billing recipients (billing contact + optional CC to subscriber)
      const recipients = await this.getBillingRecipients(org, owner);

      if (!recipients.to) {
        logger.warn(`Dunning email: no billing email for organization: ${organizationId}`);
        return false;
      }

      const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';
      const tier = PRICING_TIERS[org.subscription_tier] ?? PRICING_TIERS.pro;

      // Format amount for display
      const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amountDue / 100);

      // Determine urgency based on failure count
      const isUrgent = failureCount >= 3;
      const isFinal = failureCount >= 4;

      // Generate appropriate subject line
      let subject: string;
      if (isFinal) {
        subject = `Action Required: Your subscription will be canceled - Payment failed`;
      } else if (isUrgent) {
        subject = `Urgent: Payment failed for your ${tier?.displayName ?? 'Pro'} subscription`;
      } else {
        subject = `Payment failed for your ${tier?.displayName ?? 'Pro'} subscription`;
      }

      // Format next attempt date if provided
      let nextAttemptText = '';
      if (nextAttempt) {
        const nextAttemptDate = new Date(nextAttempt * 1000);
        nextAttemptText = nextAttemptDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }

      // Build email content
      const urgencyColor = isFinal ? BRAND_COLORS.error : isUrgent ? BRAND_COLORS.warning : BRAND_COLORS.primary;

      const tierDisplayName = tier?.displayName ?? 'Pro';
      const html = generateEmailTemplate({
        title: isFinal ? 'Subscription at Risk' : 'Payment Failed',
        preheader: `Action needed: Update your payment method for ${org.name}`,
        headerColor: urgencyColor,
        content: `
          <p>Hi ${recipients.recipientName},</p>

          <p>We were unable to process your payment of <strong>${formattedAmount}</strong> for the <strong>${tierDisplayName}</strong> subscription for <strong>${org.name}</strong>.</p>

          ${createInfoCard(`
            <p style="margin: 0 0 10px 0; font-weight: bold; color: ${urgencyColor};">
              ${isFinal
                ? '⚠️ Final Notice: Your subscription will be canceled soon'
                : isUrgent
                  ? '⚠️ This is attempt ' + failureCount + ' of 4 - please update your payment method'
                  : 'Payment attempt ' + failureCount + ' failed'
              }
            </p>
            ${nextAttemptText ? `
              <p style="margin: 0; color: ${BRAND_COLORS.textMuted};">
                Next automatic retry: ${nextAttemptText}
              </p>
            ` : ''}
          `, urgencyColor)}

          <p><strong>What happens next?</strong></p>
          <ul style="margin: 15px 0; padding-left: 20px;">
            <li>We'll automatically retry the payment${nextAttemptText ? ' on ' + nextAttemptText : ' in a few days'}</li>
            ${failureCount >= 2 ? `<li>After ${4 - failureCount} more failed attempt${4 - failureCount === 1 ? '' : 's'}, your subscription will be canceled</li>` : ''}
            <li>If canceled, you'll be downgraded to the Free plan and may lose access to some features</li>
          </ul>

          <p><strong>To resolve this:</strong></p>
          <ol style="margin: 15px 0; padding-left: 20px;">
            <li>Check that your card hasn't expired</li>
            <li>Ensure sufficient funds are available</li>
            <li>Update your payment method in billing settings</li>
            ${hostedInvoiceUrl ? `<li>Or <a href="${hostedInvoiceUrl}" style="color: ${BRAND_COLORS.primary};">pay this invoice directly</a></li>` : ''}
          </ol>

          ${createDetailsList([
            { label: 'Amount Due', value: formattedAmount },
            { label: 'Organization', value: org.name },
            { label: 'Plan', value: tierDisplayName },
            { label: 'Status', value: 'Past Due' },
          ])}
        `,
        ctaButton: {
          text: 'Update Payment Method',
          url: `${frontendUrl}/organizations/settings?tab=billing`,
          color: urgencyColor,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px;">
            Need help? Reply to this email or contact our support team.
            ${hostedInvoiceUrl ? `<br><a href="${hostedInvoiceUrl}" style="color: ${BRAND_COLORS.primary};">Pay invoice directly →</a>` : ''}
          </p>
        `,
      });

      await emailService.sendEmail({
        to: recipients.to,
        cc: recipients.cc,
        subject,
        html,
      });

      // Log the dunning email event
      await this.logBillingEvent(organizationId, 'dunning.email_sent', {
        failure_count: failureCount,
        amount_due: amountDue,
        currency,
        recipient: recipients.to,
        cc: recipients.cc || null,
        is_urgent: isUrgent,
        is_final: isFinal,
      });

      logger.info(`Dunning email sent to ${recipients.to}${recipients.cc ? ` (CC: ${recipients.cc})` : ''} for org ${organizationId} (attempt ${failureCount})`);
      return true;
    } catch (error) {
      logger.error('Error sending dunning email:', error);
      return false;
    }
  }

  /**
   * Send payment action required email (3D Secure authentication, etc.)
   */
  async sendPaymentActionRequiredEmail(
    organizationId: string,
    hostedInvoiceUrl: string
  ): Promise<boolean> {
    try {
      const org = await db('organizations')
        .where('id', organizationId)
        .first();

      if (!org) {
        logger.warn(`Payment action email: organization not found: ${organizationId}`);
        return false;
      }

      const owner = await db('users')
        .where('id', org.owner_id)
        .first();

      // Get billing recipients (billing contact + optional CC to subscriber)
      const recipients = await this.getBillingRecipients(org, owner);

      if (!recipients.to) {
        logger.warn(`Payment action email: no billing email for organization: ${organizationId}`);
        return false;
      }

      const tier = PRICING_TIERS[org.subscription_tier] ?? PRICING_TIERS.pro;
      const tierDisplayName = tier?.displayName ?? 'Pro';

      const html = generateEmailTemplate({
        title: 'Action Required: Complete Your Payment',
        preheader: `Authentication needed for your ${tierDisplayName} subscription payment`,
        headerColor: BRAND_COLORS.warning,
        content: `
          <p>Hi ${recipients.recipientName},</p>

          <p>Your bank requires additional authentication to complete your payment for the <strong>${tierDisplayName}</strong> subscription for <strong>${org.name}</strong>.</p>

          ${createInfoCard(`
            <p style="margin: 0; font-weight: bold; color: ${BRAND_COLORS.warning};">
              🔐 Additional verification required
            </p>
            <p style="margin: 10px 0 0 0; color: ${BRAND_COLORS.textMuted};">
              This is typically a 3D Secure authentication or similar security step required by your bank.
            </p>
          `, BRAND_COLORS.warning)}

          <p>Please click the button below to complete the payment authentication. This usually takes less than a minute.</p>
        `,
        ctaButton: {
          text: 'Complete Authentication',
          url: hostedInvoiceUrl,
          color: BRAND_COLORS.warning,
        },
        footer: `
          <p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px;">
            If you didn't initiate this payment or need help, please contact our support team.
          </p>
        `,
      });

      await emailService.sendEmail({
        to: recipients.to,
        cc: recipients.cc,
        subject: `Action Required: Complete payment authentication for ${org.name}`,
        html,
      });

      await this.logBillingEvent(organizationId, 'payment_action.email_sent', {
        recipient: recipients.to,
        cc: recipients.cc || null,
        hosted_invoice_url: hostedInvoiceUrl,
      });

      logger.info(`Payment action required email sent to ${recipients.to}${recipients.cc ? ` (CC: ${recipients.cc})` : ''} for org ${organizationId}`);
      return true;
    } catch (error) {
      logger.error('Error sending payment action required email:', error);
      return false;
    }
  }
}

// Export singleton instance
export const billingEmailService = new BillingEmailService();
export default billingEmailService;
