import { db } from '../config/database';
import { logger } from '../utils/logger';
import { emailService } from './email.service';
import pricingService from './pricing.service';
import crypto from 'crypto';
import dns from 'dns';
import { promisify } from 'util';

// Promisify DNS lookup for async usage
const resolveTxt = promisify(dns.resolveTxt);

interface DomainVerificationRequest {
  id: string;
  organization_id: string;
  domain: string;
  verification_method: 'email' | 'dns';
  verification_token: string;
  verification_code?: string;
  verification_email?: string;
  created_at: Date;
  expires_at: Date;
  verified_at?: Date;
  status: 'pending' | 'verified' | 'expired';
}

interface EmailVerificationPayload {
  domain: string;
  verificationCode: string;
}

export interface DomainClaimingStatus {
  tier: string;
  isMultiMemberTier: boolean;
  domain: string | null;
  suggestedDomain: string | null;
  domainVerified: boolean;
  canClaimDomain: boolean;
  canInstantClaim: boolean; // true if user's email matches suggested domain
  claimBlockedReason?: string;
}

class DomainVerificationService {
  // Configuration constants
  private readonly VERIFICATION_EXPIRY_HOURS = 24;

  /**
   * Request domain verification via email method
   * Sends verification code to admin@domain.com
   */
  async requestEmailVerification(
    organizationId: string,
    domain: string,
    adminEmail?: string
  ): Promise<{
    verificationId: string;
    message: string;
    expiresAt: Date;
  }> {
    try {
      logger.info(`📧 Requesting email domain verification for domain: ${domain}`);

      // Validate domain format
      if (!this.isValidDomain(domain)) {
        throw new Error(`Invalid domain format: ${domain}`);
      }

      // Check if domain is already verified for another organization
      const existingOrg = await db('organizations')
        .where('domain', domain)
        .andWhere('domain_verified', true)
        .first();

      if (existingOrg) {
        throw new Error(
          `Domain ${domain} is already verified for another organization`
        );
      }

      // Check if domain verification is already in progress
      const existingRequest = await db('domain_verification_requests')
        .where('domain', domain)
        .andWhere('organization_id', organizationId)
        .andWhere('status', 'pending')
        .andWhere('expires_at', '>', new Date())
        .first();

      if (existingRequest) {
        logger.info(`Domain verification request already pending for ${domain}`);
        return {
          verificationId: existingRequest.id,
          message: `Verification request already sent to ${existingRequest.verification_email}`,
          expiresAt: existingRequest.expires_at
        };
      }

      // Generate verification code (6-digit number for email)
      const verificationCode = this.generateVerificationCode();
      const verificationToken = this.generateVerificationToken();
      const expiresAt = new Date(Date.now() + this.VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

      // Determine verification email (admin@domain or provided)
      const verificationEmail = adminEmail || `admin@${domain}`;

      // Create verification request record
      const [insertResult] = await db('domain_verification_requests').insert({
        organization_id: organizationId,
        domain: domain,
        verification_method: 'email',
        verification_token: verificationToken,
        verification_code: verificationCode,
        verification_email: verificationEmail,
        status: 'pending',
        created_at: new Date(),
        expires_at: expiresAt
      }).returning('id');

      const newVerificationId = typeof insertResult === 'object' ? insertResult.id : insertResult;
      logger.info(`Created email verification request: ${newVerificationId}`);

      // Send verification email
      const emailSubject = `Verify your domain for CogVeri: ${domain}`;
      const emailHtml = this.generateEmailVerificationTemplate({
        domain,
        verificationCode,
      });

      try {
        await emailService.sendEmail({
          to: verificationEmail,
          subject: emailSubject,
          html: emailHtml,
          text: `Your domain verification code for CogVeri is: ${verificationCode}`
        });
        logger.info(`📧 Verification email sent to ${verificationEmail}`);
      } catch (emailError) {
        logger.warn(`Failed to send verification email to ${verificationEmail}:`, emailError);
        // Don't throw - allow user to see the code in UI
      }

      return {
        verificationId: String(newVerificationId),
        message: `Verification code sent to ${verificationEmail}. Check your email for the code.`,
        expiresAt
      };
    } catch (error) {
      logger.error('Domain email verification request failed:', error);
      throw error;
    }
  }

  /**
   * Verify domain via email code
   */
  async verifyEmailCode(
    verificationId: string,
    verificationCode: string
  ): Promise<{
    success: boolean;
    domain: string;
    organizationId: string;
  }> {
    try {
      logger.info(`🔍 Verifying email code for verification request: ${verificationId}`);

      // Find verification request
      const verificationRequest = await db('domain_verification_requests')
        .where('id', verificationId)
        .first();

      if (!verificationRequest) {
        throw new Error('Verification request not found');
      }

      if (verificationRequest.status === 'verified') {
        throw new Error('Domain already verified');
      }

      if (verificationRequest.status === 'expired') {
        throw new Error('Verification request expired');
      }

      if (new Date() > verificationRequest.expires_at) {
        await db('domain_verification_requests')
          .where('id', verificationId)
          .update({ status: 'expired' });
        throw new Error('Verification request expired');
      }

      // Verify code
      if (verificationRequest.verification_code !== verificationCode) {
        logger.warn(
          `❌ Invalid verification code for ${verificationRequest.domain}`
        );
        throw new Error('Invalid verification code');
      }

      // Update verification request as verified
      const now = new Date();
      await db('domain_verification_requests')
        .where('id', verificationId)
        .update({
          status: 'verified',
          verified_at: now
        });

      // Update organization with verified domain
      await db('organizations')
        .where('id', verificationRequest.organization_id)
        .update({
          domain: verificationRequest.domain,
          domain_verified: true,
          domain_verified_at: now,
          domain_verification_method: 'email'
        });

      logger.info(
        `✅ Domain verified via email: ${verificationRequest.domain}`
      );

      return {
        success: true,
        domain: verificationRequest.domain,
        organizationId: verificationRequest.organization_id
      };
    } catch (error) {
      logger.error('Email verification failed:', error);
      throw error;
    }
  }

  /**
   * Request domain verification via DNS method
   * Returns DNS record to add to domain's TXT records
   */
  async requestDNSVerification(
    organizationId: string,
    domain: string
  ): Promise<{
    verificationId: string;
    dnsRecord: string;
    dnsValue: string;
    instructions: string;
    expiresAt: Date;
  }> {
    try {
      logger.info(`🔍 Requesting DNS domain verification for: ${domain}`);

      // Validate domain format
      if (!this.isValidDomain(domain)) {
        throw new Error(`Invalid domain format: ${domain}`);
      }

      // Check if domain is already verified for another organization
      const existingOrg = await db('organizations')
        .where('domain', domain)
        .andWhere('domain_verified', true)
        .first();

      if (existingOrg) {
        throw new Error(
          `Domain ${domain} is already verified for another organization`
        );
      }

      // Check if verification is already in progress
      const existingRequest = await db('domain_verification_requests')
        .where('domain', domain)
        .andWhere('organization_id', organizationId)
        .andWhere('status', 'pending')
        .andWhere('expires_at', '>', new Date())
        .first();

      if (existingRequest) {
        logger.info(`DNS verification request already pending for ${domain}`);
        return {
          verificationId: existingRequest.id,
          dnsRecord: `_cogveri-verify.${domain}`,
          dnsValue: existingRequest.verification_code || '',
          instructions: 'Add the TXT record above to your domain\'s DNS settings',
          expiresAt: existingRequest.expires_at
        };
      }

      // Generate verification token
      const verificationToken = this.generateVerificationToken();
      const verificationCode = `cogveri-domain-verify-${organizationId.substring(0, 8)}-${crypto
        .randomBytes(4)
        .toString('hex')}`;
      const expiresAt = new Date(
        Date.now() + this.VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000
      );

      // Create verification request record
      const [insertResult] = await db('domain_verification_requests').insert({
        organization_id: organizationId,
        domain: domain,
        verification_method: 'dns',
        verification_token: verificationToken,
        verification_code: verificationCode,
        status: 'pending',
        created_at: new Date(),
        expires_at: expiresAt
      }).returning('id');

      const newVerificationId = typeof insertResult === 'object' ? insertResult.id : insertResult;
      logger.info(`Created DNS verification request: ${newVerificationId}`);

      return {
        verificationId: String(newVerificationId),
        dnsRecord: `_cogveri-verify.${domain}`,
        dnsValue: verificationCode,
        instructions: `Add a TXT record to your domain's DNS settings with the values above. This usually takes 15-30 minutes to propagate.`,
        expiresAt
      };
    } catch (error) {
      logger.error('DNS verification request failed:', error);
      throw error;
    }
  }

  /**
   * Verify domain via DNS TXT record
   */
  async verifyDNSRecord(
    verificationId: string
  ): Promise<{
    success: boolean;
    domain: string;
    organizationId: string;
  }> {
    try {
      logger.info(`🔍 Verifying DNS record for verification: ${verificationId}`);

      // Find verification request
      const verificationRequest = await db('domain_verification_requests')
        .where('id', verificationId)
        .first();

      if (!verificationRequest) {
        throw new Error('Verification request not found');
      }

      if (verificationRequest.status === 'verified') {
        throw new Error('Domain already verified');
      }

      if (verificationRequest.status === 'expired') {
        throw new Error('Verification request expired');
      }

      if (new Date() > verificationRequest.expires_at) {
        await db('domain_verification_requests')
          .where('id', verificationId)
          .update({ status: 'expired' });
        throw new Error('Verification request expired');
      }

      // Check DNS record
      const dnsRecordName = `_cogveri-verify.${verificationRequest.domain}`;
      const expectedValue = verificationRequest.verification_code;

      const verified = await this.checkDNSRecord(
        dnsRecordName,
        expectedValue
      );

      if (!verified) {
        throw new Error(
          `DNS verification failed. Could not find TXT record with the expected value.`
        );
      }

      // Update verification request as verified
      const now = new Date();
      await db('domain_verification_requests')
        .where('id', verificationId)
        .update({
          status: 'verified',
          verified_at: now
        });

      // Update organization with verified domain
      await db('organizations')
        .where('id', verificationRequest.organization_id)
        .update({
          domain: verificationRequest.domain,
          domain_verified: true,
          domain_verified_at: now,
          domain_verification_method: 'dns'
        });

      logger.info(
        `✅ Domain verified via DNS: ${verificationRequest.domain}`
      );

      return {
        success: true,
        domain: verificationRequest.domain,
        organizationId: verificationRequest.organization_id
      };
    } catch (error) {
      logger.error('DNS verification failed:', error);
      throw error;
    }
  }

  /**
   * Check if a DNS TXT record exists and contains expected value
   */
  private async checkDNSRecord(
    recordName: string,
    expectedValue: string
  ): Promise<boolean> {
    try {
      logger.info(`🔍 Checking DNS record: ${recordName}`);

      const records = await resolveTxt(recordName);

      // DNS TXT records can be split across multiple strings
      for (const record of records) {
        const recordValue = Array.isArray(record) ? record.join('') : record;
        if (recordValue.includes(expectedValue)) {
          logger.info(`✅ DNS record found for ${recordName}`);
          return true;
        }
      }

      logger.warn(
        `❌ DNS record ${recordName} not found or value mismatch`
      );
      return false;
    } catch (error: any) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        logger.warn(`DNS record not found for ${recordName}:`, error.message);
        return false;
      }
      logger.error(`Error checking DNS record:`, error);
      throw error;
    }
  }

  /**
   * Check domain verification status
   */
  async checkVerificationStatus(
    verificationId: string
  ): Promise<DomainVerificationRequest> {
    try {
      const request = await db('domain_verification_requests')
        .where('id', verificationId)
        .first();

      if (!request) {
        throw new Error('Verification request not found');
      }

      // Check if expired
      if (
        request.status === 'pending' &&
        new Date() > request.expires_at
      ) {
        await db('domain_verification_requests')
          .where('id', verificationId)
          .update({ status: 'expired' });
        request.status = 'expired';
      }

      return request;
    } catch (error) {
      logger.error('Error checking verification status:', error);
      throw error;
    }
  }

  /**
   * Get all verification requests for an organization
   */
  async getOrganizationVerifications(
    organizationId: string
  ): Promise<DomainVerificationRequest[]> {
    try {
      return await db('domain_verification_requests')
        .where('organization_id', organizationId)
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error fetching verifications:', error);
      throw error;
    }
  }


  /**
   * Get domain claiming status for an organization
   * Used to determine if domain claiming should be prompted after upgrade
   */
  async getDomainClaimingStatus(organizationId: string, userEmail?: string): Promise<DomainClaimingStatus> {
    try {
      const org = await db('organizations')
        .where('id', organizationId)
        .select('subscription_tier', 'domain', 'domain_verified', 'owner_email')
        .first();

      if (!org) {
        throw new Error('Organization not found');
      }

      const tier = org.subscription_tier || 'free';
      const isMultiMember = pricingService.isMultiMemberTier(tier);
      const suggestedDomain = this.extractDomainFromEmail(org.owner_email);

      // Check if another org already claimed this domain
      let claimBlockedReason: string | undefined;
      if (suggestedDomain) {
        const existingClaim = await db('organizations')
          .where('domain', suggestedDomain)
          .andWhere('domain_verified', true)
          .andWhereNot('id', organizationId)
          .select('name')
          .first();

        if (existingClaim) {
          claimBlockedReason = `Domain already claimed by "${existingClaim.name}"`;
        }
      }

      // Check if user can instant claim (their email matches suggested domain)
      let canInstantClaim = false;
      if (userEmail && suggestedDomain && !claimBlockedReason) {
        const userEmailDomain = userEmail.toLowerCase().split('@')[1];
        canInstantClaim = userEmailDomain === suggestedDomain;
      }

      return {
        tier,
        isMultiMemberTier: isMultiMember,
        domain: org.domain || null,
        suggestedDomain,
        domainVerified: org.domain_verified === true,
        canClaimDomain: isMultiMember && !org.domain_verified && !claimBlockedReason,
        canInstantClaim: isMultiMember && !org.domain_verified && canInstantClaim,
        claimBlockedReason,
      };
    } catch (error) {
      logger.error('Error getting domain claiming status:', error);
      throw error;
    }
  }

  /**
   * Instant domain claim - if user's email matches the domain, claim it immediately
   * No email/DNS verification needed since they've already proven ownership via their email
   */
  async instantClaimDomain(
    organizationId: string,
    domain: string,
    userEmail: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`Attempting instant domain claim: ${domain} for org ${organizationId}`);

      // Extract domain from user's email
      const userEmailDomain = userEmail.toLowerCase().split('@')[1];
      const requestedDomain = domain.toLowerCase();

      // Verify email domain matches requested domain
      if (userEmailDomain !== requestedDomain) {
        return {
          success: false,
          message: `Your email domain (${userEmailDomain}) doesn't match the requested domain (${requestedDomain}). Please use email or DNS verification.`
        };
      }

      // Check if domain is already claimed by another org
      const existingClaim = await db('organizations')
        .where('domain', requestedDomain)
        .andWhere('domain_verified', true)
        .andWhereNot('id', organizationId)
        .first();

      if (existingClaim) {
        return {
          success: false,
          message: `Domain ${requestedDomain} is already claimed by another organization.`
        };
      }

      // Check if org is on a multi-member tier (required for claiming)
      const org = await db('organizations')
        .where('id', organizationId)
        .select('subscription_tier')
        .first();

      if (!org) {
        return { success: false, message: 'Organization not found' };
      }

      const isMultiMember = pricingService.isMultiMemberTier(org.subscription_tier || 'free');
      if (!isMultiMember) {
        return {
          success: false,
          message: 'Domain claiming requires a Pro, Team, or Business plan.'
        };
      }

      // Claim the domain instantly
      await db('organizations')
        .where('id', organizationId)
        .update({
          domain: requestedDomain,
          domain_verified: true,
          domain_verified_at: new Date(),
          updated_at: new Date(),
        });

      // Create audit log
      await db('organization_audit_logs').insert({
        organization_id: organizationId,
        actor_id: userId,
        action: 'domain_claimed_instant',
        resource_type: 'domain',
        resource_id: null,
        changes: { domain: requestedDomain, method: 'email_match' },
        metadata: { user_email: userEmail },
        status: 'success',
        created_at: new Date(),
      });

      logger.info(`Domain ${requestedDomain} instantly claimed by org ${organizationId}`);

      return {
        success: true,
        message: `Domain ${requestedDomain} has been claimed! New users with @${requestedDomain} emails will now be directed to join your organization.`
      };
    } catch (error) {
      logger.error('Error in instant domain claim:', error);
      throw error;
    }
  }

  /**
   * Extract domain from email, excluding public domains
   */
  private extractDomainFromEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const parts = email.toLowerCase().split('@');
    if (parts.length !== 2) return null;

    const domain = parts[1];
    if (!domain) return null;

    const publicDomains = [
      'gmail.com', 'googlemail.com',
      'yahoo.com', 'yahoo.co.uk', 'outlook.com', 'hotmail.com',
      'live.com', 'icloud.com', 'me.com', 'aol.com',
      'protonmail.com', 'proton.me',
    ];

    return publicDomains.includes(domain) ? null : domain;
  }

  /**
   * Retry verification (create new request for same domain)
   */
  async retryVerification(
    organizationId: string,
    domain: string,
    method: 'email' | 'dns'
  ): Promise<any> {
    try {
      logger.info(`🔄 Retrying ${method} verification for ${domain}`);

      // Mark old request as expired
      await db('domain_verification_requests')
        .where('organization_id', organizationId)
        .andWhere('domain', domain)
        .andWhere('status', 'pending')
        .update({ status: 'expired' });

      // Create new request based on method
      if (method === 'email') {
        return await this.requestEmailVerification(organizationId, domain);
      } else {
        return await this.requestDNSVerification(organizationId, domain);
      }
    } catch (error) {
      logger.error('Error retrying verification:', error);
      throw error;
    }
  }

  /**
   * Helper: Validate domain format
   */
  private isValidDomain(domain: string): boolean {
    // Basic domain validation regex
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    return domainRegex.test(domain);
  }

  /**
   * Helper: Generate 6-digit verification code
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Helper: Generate secure verification token
   */
  private generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Helper: Generate email verification template
   */
  private generateEmailVerificationTemplate(payload: EmailVerificationPayload): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .verification-code {
            background-color: white;
            border: 2px solid #4F46E5;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .code {
            font-size: 36px;
            font-weight: bold;
            color: #4F46E5;
            letter-spacing: 4px;
            font-family: 'Courier New', monospace;
          }
          .expiry { color: #666; font-size: 14px; margin-top: 15px; }
          .instructions { background-color: #E0E7FF; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Your Domain</h1>
            <p>${payload.domain}</p>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested to verify your organization's domain <strong>${payload.domain}</strong> for use with CogVeri.</p>

            <div class="verification-code">
              <p>Your verification code is:</p>
              <div class="code">${payload.verificationCode}</div>
              <p class="expiry">This code expires in 24 hours</p>
            </div>

            <div class="instructions">
              <p><strong>How to verify your domain:</strong></p>
              <ol>
                <li>Go to your CogVeri organization settings</li>
                <li>Navigate to the Domain Verification section</li>
                <li>Enter the verification code above</li>
                <li>Click "Verify Domain"</li>
              </ol>
            </div>

            <p>If you didn't request this verification, please ignore this email.</p>

            <div class="footer">
              <p>This is an automated email from CogVeri. Please do not reply to this message.</p>
              <p>&copy; 2024 CogVeri. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export const domainVerificationService = new DomainVerificationService();
