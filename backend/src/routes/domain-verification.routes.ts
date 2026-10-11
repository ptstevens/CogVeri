import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { db } from '../config/database';
import { domainVerificationService } from '../services/domain-verification.service';
import { organizationService } from '../services/organization.service';
import { organizationMemberService } from '../services/organization-member.service';

const router = Router();

/**
 * Request email-based domain verification
 * POST /api/domain-verification/request-email
 *
 * Body: { organizationId, domain, adminEmail? }
 * Returns: { verificationId, domain, method, expiresAt }
 */
router.post(
  '/request-email',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { organizationId, domain, adminEmail } = req.body;
      const userId = req.user?.id;

      // Validate input
      if (!organizationId || !domain) {
        res.status(400).json({
          error: 'Missing required fields: organizationId, domain',
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      // Check if user is organization owner/admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can request domain verification',
        });
        return;
      }

      // Check domain availability
      const availability = await organizationService.checkDomainAvailability(domain);
      if (!availability.available) {
        res.status(400).json({
          error: availability.message,
          existingOrganization: availability.existingOrganization,
        });
        return;
      }

      // Request email verification
      const result = await domainVerificationService.requestEmailVerification(
        organizationId,
        domain,
        adminEmail
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to request domain verification';
      res.status(500).json({
        error: message,
      });
    }
  }
);

/**
 * Verify email-based domain verification with code
 * POST /api/domain-verification/verify-email
 *
 * Body: { verificationId, verificationCode }
 * Returns: { domain, verified, verifiedAt }
 */
router.post(
  '/verify-email',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { verificationId, verificationCode } = req.body;

      if (!verificationId || !verificationCode) {
        res.status(400).json({
          error: 'Missing required fields: verificationId, verificationCode',
        });
        return;
      }

      // Verify the code
      const result = await domainVerificationService.verifyEmailCode(
        verificationId,
        verificationCode
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to verify domain';
      res.status(400).json({
        error: message,
      });
    }
  }
);

/**
 * Request DNS-based domain verification
 * POST /api/domain-verification/request-dns
 *
 * Body: { organizationId, domain }
 * Returns: { verificationId, domain, method, dnsRecord: { name, value }, expiresAt }
 */
router.post(
  '/request-dns',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { organizationId, domain } = req.body;
      const userId = req.user?.id;

      if (!organizationId || !domain) {
        res.status(400).json({
          error: 'Missing required fields: organizationId, domain',
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      // Check if user is organization owner/admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can request domain verification',
        });
        return;
      }

      // Check domain availability
      const availability = await organizationService.checkDomainAvailability(domain);
      if (!availability.available) {
        res.status(400).json({
          error: availability.message,
          existingOrganization: availability.existingOrganization,
        });
        return;
      }

      // Request DNS verification
      const result = await domainVerificationService.requestDNSVerification(organizationId, domain);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to request domain verification';
      res.status(500).json({
        error: message,
      });
    }
  }
);

/**
 * Verify DNS-based domain verification
 * POST /api/domain-verification/verify-dns
 *
 * Body: { verificationId }
 * Returns: { domain, verified, verifiedAt }
 */
router.post(
  '/verify-dns',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { verificationId } = req.body;

      if (!verificationId) {
        res.status(400).json({
          error: 'Missing required field: verificationId',
        });
        return;
      }

      // Verify DNS record
      const result = await domainVerificationService.verifyDNSRecord(verificationId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to verify domain';
      res.status(400).json({
        error: message,
      });
    }
  }
);

/**
 * Check domain verification status
 * GET /api/domain-verification/:verificationId
 *
 * Returns: { verificationId, domain, status, method, expiresAt, verified... }
 */
router.get(
  '/:verificationId',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const verificationId = req.params.verificationId;

      if (!verificationId) {
        res.status(400).json({
          error: 'Missing required parameter: verificationId',
        });
        return;
      }

      const status = await domainVerificationService.checkVerificationStatus(verificationId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Verification not found';
      res.status(404).json({
        error: message,
      });
    }
  }
);

/**
 * Retry failed verification attempt
 * POST /api/domain-verification/:verificationId/retry
 *
 * Returns: { verificationId, domain, status, expiresAt }
 */
router.post(
  '/:verificationId/retry',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const verificationId = req.params.verificationId;
      const userId = req.user?.id;

      if (!verificationId) {
        res.status(400).json({
          error: 'Missing required parameter: verificationId',
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      // Get verification details to check auth
      const verification = await domainVerificationService.checkVerificationStatus(verificationId);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(
        verification.organization_id,
        userId
      );

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can retry verification',
        });
        return;
      }

      // Retry verification - use same method as original request
      const result = await domainVerificationService.retryVerification(
        verification.organization_id,
        verification.domain,
        verification.verification_method
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to retry verification';
      res.status(400).json({
        error: message,
      });
    }
  }
);

/**
 * Cancel domain verification request
 * DELETE /api/domain-verification/:verificationId
 */
router.delete(
  '/:verificationId',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const verificationId = req.params.verificationId;
      const userId = req.user?.id;

      if (!verificationId) {
        res.status(400).json({
          error: 'Missing required parameter: verificationId',
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      // Get verification details
      const verification = await domainVerificationService.checkVerificationStatus(verificationId);

      // Check if user is organization admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(
        verification.organization_id,
        userId
      );

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can cancel verification',
        });
        return;
      }

      // Cancel verification (mark as expired)
      await db('domain_verification_requests')
        .where('id', verificationId)
        .update({ status: 'expired' });

      res.json({
        success: true,
        message: 'Verification cancelled',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to cancel verification';
      res.status(400).json({
        error: message,
      });
    }
  }
);

/**
 * Check if domain is available for registration
 * GET /api/domain-verification/check/:domain
 *
 * Returns: { available, existingOrganization?, message }
 */
router.get('/check/:domain', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const domain = req.params.domain;

    if (!domain) {
      res.status(400).json({
        error: 'Missing required parameter: domain',
      });
      return;
    }

    const availability = await organizationService.checkDomainAvailability(domain);

    res.json({
      success: true,
      data: availability,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to check domain';
    res.status(500).json({
      error: message,
    });
  }
});

/**
 * Get domain claiming status for an organization
 * GET /api/domain-verification/claiming-status/:organizationId
 *
 * Used to check if domain claiming should be prompted (after upgrade to paid tier)
 * Returns: { tier, isMultiMemberTier, domain, suggestedDomain, domainVerified, canClaimDomain, claimBlockedReason? }
 */
router.get(
  '/claiming-status/:organizationId',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const organizationId = req.params.organizationId;
      const userId = req.user?.id;

      if (!organizationId) {
        res.status(400).json({
          error: 'Missing required parameter: organizationId',
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      // Check if user belongs to this organization
      const user = await db('users').where('id', userId).select('organization_id', 'email').first();

      if (!user || user.organization_id !== organizationId) {
        res.status(403).json({
          error: 'Not a member of this organization',
        });
        return;
      }

      // Pass user email to check if instant claim is available
      const status = await domainVerificationService.getDomainClaimingStatus(
        organizationId,
        user.email
      );

      res.json({
        success: true,
        data: status,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to get domain claiming status';
      res.status(500).json({
        error: message,
      });
    }
  }
);

/**
 * Instant domain claim - claim domain immediately if user's email matches
 * POST /api/domain-verification/instant-claim
 *
 * Body: { organizationId, domain }
 * Returns: { success, message }
 */
router.post(
  '/instant-claim',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { organizationId, domain } = req.body;
      const userId = req.user?.id;

      if (!organizationId || !domain) {
        res.status(400).json({
          error: 'Missing required fields: organizationId, domain',
        });
        return;
      }

      if (!userId) {
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      // Check if user is organization owner/admin
      const isAdmin = await organizationMemberService.isOrganizationAdmin(organizationId, userId);

      if (!isAdmin) {
        res.status(403).json({
          error: 'Only organization admins can claim domains',
        });
        return;
      }

      // Get user's email for verification
      const user = await db('users').where('id', userId).select('email').first();

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Attempt instant claim
      const result = await domainVerificationService.instantClaimDomain(
        organizationId,
        domain,
        user.email,
        userId
      );

      if (result.success) {
        res.json({
          success: true,
          data: { message: result.message, domain, verified: true },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to claim domain';
      res.status(500).json({
        error: message,
      });
    }
  }
);

export default router;
