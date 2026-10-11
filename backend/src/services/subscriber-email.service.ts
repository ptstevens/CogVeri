import { db } from '../config/database';
import { logger } from '../utils/logger';
import { emailService } from './email.service';
import crypto from 'crypto';

class SubscriberEmailService {
  private readonly TRANSFER_EXPIRY_HOURS = 72; // 3 days to accept transfer

  /**
   * Get current subscriber email for organization
   */
  async getSubscriberEmail(organizationId: string): Promise<string | null> {
    try {
      const org = await db('organizations')
        .where('id', organizationId)
        .select('subscriber_email')
        .first();

      return org?.subscriber_email || null;
    } catch (error) {
      logger.error('Error fetching subscriber email:', error);
      throw error;
    }
  }

  /**
   * Get full subscriber email details including verification status and pending transfers
   */
  async getSubscriberEmailDetails(organizationId: string): Promise<{
    currentEmail: string | null;
    verifiedAt: Date | null;
    pendingEmail: string | null;
    pendingExpiresAt: Date | null;
  }> {
    try {
      const org = await db('organizations')
        .where('id', organizationId)
        .select(
          'subscriber_email',
          'subscriber_email_verified_at',
          'subscriber_email_transition_pending_to',
          'subscriber_email_transition_expires_at'
        )
        .first();

      return {
        currentEmail: org?.subscriber_email || null,
        verifiedAt: org?.subscriber_email_verified_at || null,
        pendingEmail: org?.subscriber_email_transition_pending_to || null,
        pendingExpiresAt: org?.subscriber_email_transition_expires_at || null,
      };
    } catch (error) {
      logger.error('Error fetching subscriber email details:', error);
      throw error;
    }
  }

  /**
   * Initiate subscriber email transfer
   * Creates a transfer request and sends verification email to new subscriber
   */
  async initiateTransfer(
    organizationId: string,
    newSubscriberEmail: string,
    _initiatedByUserId: string
  ): Promise<{
    transferId: string;
    message: string;
    expiresAt: Date;
    verificationSent: boolean;
  }> {
    try {
      logger.info(
        `🔄 Initiating subscriber email transfer for org ${organizationId} to ${newSubscriberEmail}`
      );

      // Verify organization exists
      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      // Validate new email format
      if (!this.isValidEmail(newSubscriberEmail)) {
        throw new Error(`Invalid email format: ${newSubscriberEmail}`);
      }

      // Check if new email is the same as current
      if (
        organization.subscriber_email &&
        organization.subscriber_email.toLowerCase() === newSubscriberEmail.toLowerCase()
      ) {
        throw new Error('New email is the same as current subscriber email');
      }

      // Check for pending transfers to same email
      const existingTransfer = await db('organizations')
        .where('id', organizationId)
        .andWhere('subscriber_email_transition_pending_to', newSubscriberEmail.toLowerCase())
        .first();

      if (
        existingTransfer &&
        existingTransfer.subscriber_email_transition_expires_at &&
        new Date(existingTransfer.subscriber_email_transition_expires_at) > new Date()
      ) {
        throw new Error(
          `Transfer to ${newSubscriberEmail} already pending. Please wait or cancel it first.`
        );
      }

      // Generate verification token
      const token = this.generateVerificationToken();
      const expiresAt = new Date(Date.now() + this.TRANSFER_EXPIRY_HOURS * 60 * 60 * 1000);

      // Update organization with transfer request
      await db('organizations').where('id', organizationId).update({
        subscriber_email_transition_pending_to: newSubscriberEmail.toLowerCase(),
        subscriber_email_transition_token: token,
        subscriber_email_transition_expires_at: expiresAt,
      });

      logger.info(`✅ Transfer initiated for org ${organizationId}. Token created.`);

      // Send verification email to new subscriber
      let verificationSent = false;
      try {
        const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/account/verify-subscriber-transfer?token=${token}&email=${encodeURIComponent(newSubscriberEmail)}`;

        const html = this.generateTransferVerificationTemplate({
          organizationName: organization.name,
          currentSubscriberEmail: organization.subscriber_email || 'Not set',
          newSubscriberEmail: newSubscriberEmail,
          verificationLink: verificationLink,
          expiresAt: expiresAt,
        });

        await emailService.sendEmail({
          to: newSubscriberEmail,
          subject: `Verify Subscriber Email Transfer for ${organization.name}`,
          html: html,
        });

        verificationSent = true;
        logger.info(`📧 Verification email sent to ${newSubscriberEmail}`);
      } catch (emailError) {
        logger.warn(`Failed to send verification email: ${emailError}`);
        // Don't fail the transfer if email fails
      }

      return {
        transferId: organizationId, // Using org ID as transfer ID for simplicity
        message: verificationSent
          ? `Verification email sent to ${newSubscriberEmail}. They must accept within 72 hours.`
          : `Transfer initiated. Please send verification link to ${newSubscriberEmail} manually.`,
        expiresAt: expiresAt,
        verificationSent,
      };
    } catch (error) {
      logger.error('Error initiating subscriber transfer:', error);
      throw error;
    }
  }

  /**
   * Accept subscriber email transfer via token
   * Called when new subscriber clicks link in verification email
   */
  async acceptTransfer(token: string): Promise<{
    success: boolean;
    organizationId: string;
    newSubscriberEmail: string;
    message: string;
  }> {
    try {
      logger.info(`✅ Processing subscriber email transfer acceptance`);

      // Find organization with matching token
      const organization = await db('organizations')
        .where('subscriber_email_transition_token', token)
        .first();

      if (!organization) {
        throw new Error('Invalid or expired transfer token');
      }

      if (!organization.subscriber_email_transition_pending_to) {
        throw new Error('No pending transfer for this organization');
      }

      if (!organization.subscriber_email_transition_expires_at) {
        throw new Error('Transfer token has expired');
      }

      if (new Date() > new Date(organization.subscriber_email_transition_expires_at)) {
        // Clean up expired transfer
        await db('organizations').where('id', organization.id).update({
          subscriber_email_transition_pending_to: null,
          subscriber_email_transition_token: null,
          subscriber_email_transition_expires_at: null,
        });

        throw new Error('Transfer request has expired');
      }

      const previousEmail = organization.subscriber_email;
      const newEmail = organization.subscriber_email_transition_pending_to;
      const now = new Date();

      // Update organization with new subscriber email
      await db('organizations').where('id', organization.id).update({
        subscriber_email: newEmail.toLowerCase(),
        subscriber_email_verified_at: now,
        subscriber_email_transition_pending_to: null,
        subscriber_email_transition_token: null,
        subscriber_email_transition_expires_at: null,
        updated_at: now,
      });

      logger.info(`✅ Subscriber email successfully transferred for org ${organization.id}`);

      // Log audit trail
      try {
        await db('organization_audit_logs').insert({
          organization_id: organization.id,
          action: 'subscriber_email_transferred',
          resource_type: 'organization',
          resource_id: organization.id,
          changes: {
            from: previousEmail || 'not_set',
            to: newEmail,
          },
          status: 'success',
          created_at: now,
        });
      } catch (auditError) {
        logger.warn(`Failed to create audit log for transfer: ${auditError}`);
      }

      // Send confirmation emails
      await this.sendTransferConfirmationEmails(organization, previousEmail, newEmail);

      return {
        success: true,
        organizationId: organization.id,
        newSubscriberEmail: newEmail,
        message: `Subscriber email successfully updated to ${newEmail}`,
      };
    } catch (error) {
      logger.error('Error accepting subscriber transfer:', error);
      throw error;
    }
  }

  /**
   * Cancel pending subscriber email transfer
   */
  async cancelTransfer(organizationId: string): Promise<void> {
    try {
      logger.info(`❌ Cancelling pending subscriber transfer for org ${organizationId}`);

      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      if (!organization.subscriber_email_transition_pending_to) {
        throw new Error('No pending transfer to cancel');
      }

      const pendingEmail = organization.subscriber_email_transition_pending_to;

      // Clear transfer fields
      await db('organizations').where('id', organizationId).update({
        subscriber_email_transition_pending_to: null,
        subscriber_email_transition_token: null,
        subscriber_email_transition_expires_at: null,
        updated_at: new Date(),
      });

      logger.info(`✅ Transfer to ${pendingEmail} cancelled`);

      // Send notification email
      try {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #6B7280; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Subscriber Transfer Cancelled</h1>
              </div>
              <div class="content">
                <p>The pending subscriber email transfer for <strong>${organization.name}</strong> has been cancelled.</p>
                <p>The current subscriber email remains <strong>${organization.subscriber_email || 'Not set'}</strong>.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await emailService.sendEmail({
          to: pendingEmail,
          subject: `Subscriber Transfer Cancelled for ${organization.name}`,
          html: html,
        });
      } catch (emailError) {
        logger.warn(`Failed to send cancellation email: ${emailError}`);
      }
    } catch (error) {
      logger.error('Error cancelling subscriber transfer:', error);
      throw error;
    }
  }

  /**
   * Get subscriber email transfer history for organization
   */
  async getTransferHistory(organizationId: string): Promise<any[]> {
    try {
      const logs = await db('organization_audit_logs')
        .where('organization_id', organizationId)
        .where('action', 'subscriber_email_transferred')
        .select(['created_at', 'changes', 'metadata'])
        .orderBy('created_at', 'desc');

      return logs;
    } catch (error) {
      logger.error('Error fetching transfer history:', error);
      throw error;
    }
  }

  /**
   * Manually update subscriber email (system admin only)
   * For emergency situations or account recovery
   */
  async updateSubscriberEmail(
    organizationId: string,
    newEmail: string,
    reason: string = 'manual_update'
  ): Promise<{
    success: boolean;
    previousEmail: string;
    newEmail: string;
  }> {
    try {
      logger.info(`👨‍💼 Manual subscriber email update for org ${organizationId}. Reason: ${reason}`);

      if (!this.isValidEmail(newEmail)) {
        throw new Error(`Invalid email format: ${newEmail}`);
      }

      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      const previousEmail = organization.subscriber_email;
      const now = new Date();

      // Update subscriber email
      await db('organizations').where('id', organizationId).update({
        subscriber_email: newEmail.toLowerCase(),
        subscriber_email_verified_at: now,
        subscriber_email_transition_pending_to: null,
        subscriber_email_transition_token: null,
        subscriber_email_transition_expires_at: null,
        updated_at: now,
      });

      logger.info(`✅ Subscriber email updated from ${previousEmail} to ${newEmail}`);

      // Log audit trail
      try {
        await db('organization_audit_logs').insert({
          organization_id: organizationId,
          action: 'subscriber_email_manually_updated',
          resource_type: 'organization',
          resource_id: organizationId,
          changes: {
            from: previousEmail || 'not_set',
            to: newEmail,
            reason: reason,
          },
          metadata: {
            admin_action: true,
          },
          status: 'success',
          created_at: now,
        });
      } catch (auditError) {
        logger.warn(`Failed to create audit log: ${auditError}`);
      }

      // Send notification
      try {
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
              .alert { background-color: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Subscriber Email Updated</h1>
              </div>
              <div class="content">
                <p>The subscriber email for <strong>${organization.name}</strong> has been updated by a system administrator.</p>
                <div class="alert">
                  <p><strong>New Subscriber Email:</strong> ${newEmail}</p>
                  ${previousEmail ? `<p><strong>Previous Email:</strong> ${previousEmail}</p>` : ''}
                  <p><strong>Date:</strong> ${now.toLocaleString()}</p>
                </div>
                <p>This email address is now the official contact for billing and important organization notifications.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await emailService.sendEmail({
          to: newEmail,
          subject: `You are now the Subscriber for ${organization.name}`,
          html: html,
        });

        if (previousEmail) {
          await emailService.sendEmail({
            to: previousEmail,
            subject: `Subscriber Email Changed for ${organization.name}`,
            html: `
              <p>The subscriber email for <strong>${organization.name}</strong> has been changed.</p>
              <p>New subscriber email: ${newEmail}</p>
              <p>If you have questions, please contact support.</p>
            `,
          });
        }
      } catch (emailError) {
        logger.warn(`Failed to send update emails: ${emailError}`);
      }

      return {
        success: true,
        previousEmail: previousEmail || 'not_set',
        newEmail: newEmail,
      };
    } catch (error) {
      logger.error('Error updating subscriber email:', error);
      throw error;
    }
  }

  /**
   * Helper: Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Helper: Generate secure verification token
   */
  private generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Helper: Generate transfer verification email template
   */
  private generateTransferVerificationTemplate(payload: {
    organizationName: string;
    currentSubscriberEmail: string;
    newSubscriberEmail: string;
    verificationLink: string;
    expiresAt: Date;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #8B5CF6; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .details { background-color: white; padding: 15px; border-radius: 6px; border-left: 4px solid #8B5CF6; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #8B5CF6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .warning { background-color: #FEF3C7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #F59E0B; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Subscriber Email Transfer</h1>
          </div>
          <div class="content">
            <p>Hello,</p>

            <p>You have been designated as the new subscriber (billing contact) for the organization <strong>${payload.organizationName}</strong> on CogVeri.</p>

            <div class="details">
              <p><strong>Organization:</strong> ${payload.organizationName}</p>
              <p><strong>Current Subscriber:</strong> ${payload.currentSubscriberEmail}</p>
              <p><strong>Your Email:</strong> ${payload.newSubscriberEmail}</p>
            </div>

            <p><strong>What does this mean?</strong></p>
            <ul>
              <li>You will receive billing notifications and invoices</li>
              <li>You will be contacted for important account updates</li>
              <li>You can manage subscription settings for the organization</li>
            </ul>

            <div style="text-align: center;">
              <a href="${payload.verificationLink}" class="button">
                Verify and Accept Transfer
              </a>
            </div>

            <div class="warning">
              <p><strong>⏰ Important:</strong> This verification link expires on ${payload.expiresAt.toLocaleString()}</p>
            </div>

            <p>If you did not request this transfer or have questions, please contact your organization administrator.</p>

            <p style="margin-top: 30px; color: #666; font-size: 12px;">
              This is an automated email from CogVeri. Please do not reply.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Helper: Send confirmation emails after successful transfer
   */
  private async sendTransferConfirmationEmails(
    organization: any,
    previousEmail: string | null,
    newEmail: string
  ): Promise<void> {
    try {
      const confirmationHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10B981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .details { background-color: white; padding: 15px; border-radius: 6px; border-left: 4px solid #10B981; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Subscriber Email Updated</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>The subscriber email for <strong>${organization.name}</strong> has been successfully transferred.</p>
              <div class="details">
                <p><strong>Organization:</strong> ${organization.name}</p>
                <p><strong>New Subscriber Email:</strong> ${newEmail}</p>
                <p><strong>Date Updated:</strong> ${new Date().toLocaleString()}</p>
              </div>
              <p>You will now receive billing notifications and organization updates at this email address.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send to new subscriber
      await emailService.sendEmail({
        to: newEmail,
        subject: `✅ You are now the Subscriber for ${organization.name}`,
        html: confirmationHtml,
      });

      // Send to previous subscriber if different
      if (previousEmail && previousEmail !== newEmail) {
        const previousConfirmationHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #6B7280; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
              .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Subscriber Role Transferred</h1>
              </div>
              <div class="content">
                <p>The subscriber email for <strong>${organization.name}</strong> has been transferred to ${newEmail}.</p>
                <p>You are no longer the primary billing contact for this organization.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await emailService.sendEmail({
          to: previousEmail,
          subject: `Subscriber Role Transferred for ${organization.name}`,
          html: previousConfirmationHtml,
        });
      }
    } catch (error) {
      logger.warn(`Failed to send confirmation emails: ${error}`);
      // Don't throw - emails are best-effort
    }
  }
}

export const subscriberEmailService = new SubscriberEmailService();
