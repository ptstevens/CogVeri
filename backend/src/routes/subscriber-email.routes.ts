import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { subscriberEmailService } from '../services/subscriber-email.service';
import { organizationMemberService } from '../services/organization-member.service';

const router = Router();

/**
 * Get current subscriber email for organization
 * GET /api/organizations/:organizationId/subscriber-email
 *
 * Returns: { currentEmail, verifiedAt, pendingEmail?, pendingExpiresAt? }
 */
router.get('/:organizationId/subscriber-email', enhancedAuthenticate, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      res.status(400).json({
        error: 'Missing required parameters'
      });
      return;
    }

    // Check if user is organization admin
    const isAdmin = await organizationMemberService.isOrganizationAdmin(
      organizationId,
      userId
    );

    if (!isAdmin) {
      res.status(403).json({
        error: 'Only organization admins can view subscriber email'
      });
      return;
    }

    // Get full subscriber email details including verification status
    const details = await subscriberEmailService.getSubscriberEmailDetails(organizationId);

    res.json({
      success: true,
      data: {
        currentEmail: details.currentEmail,
        verifiedAt: details.verifiedAt?.toISOString() || null,
        pendingEmail: details.pendingEmail,
        pendingExpiresAt: details.pendingExpiresAt?.toISOString() || null
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber email';
    res.status(500).json({
      error: message
    });
  }
});

/**
 * Initiate subscriber email transfer
 * POST /api/organizations/:organizationId/subscriber-email/transfer
 *
 * Body: { newSubscriberEmail }
 * Returns: { transferId, status, expiresAt, sentTo, message }
 */
router.post('/:organizationId/subscriber-email/transfer', enhancedAuthenticate, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = req.params.organizationId;
    const { newSubscriberEmail } = req.body;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      res.status(400).json({
        error: 'Missing required parameters'
      });
      return;
    }

    if (!newSubscriberEmail) {
      res.status(400).json({
        error: 'Missing required field: newSubscriberEmail'
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newSubscriberEmail)) {
      res.status(400).json({
        error: 'Invalid email format'
      });
      return;
    }

    // Check if user is organization owner
    const isOwner = await organizationMemberService.isOrganizationOwner(
      organizationId,
      userId
    );

    if (!isOwner) {
      res.status(403).json({
        error: 'Only organization owners can transfer subscriber email'
      });
      return;
    }

    // Initiate transfer
    const result = await subscriberEmailService.initiateTransfer(
      organizationId,
      newSubscriberEmail,
      userId
    );

    res.json({
      success: true,
      data: {
        status: 'initiated',
        sentTo: newSubscriberEmail,
        expiresAt: result.expiresAt,
        message: `Verification email sent to ${newSubscriberEmail}. The new subscriber must click the confirmation link to complete the transfer.`
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initiate subscriber email transfer';
    res.status(400).json({
      error: message
    });
  }
});

/**
 * Accept subscriber email transfer
 * POST /api/organizations/subscriber-email/transfer/accept
 *
 * Body: { transferToken }
 * Returns: { success, message, organization }
 */
router.post('/subscriber-email/transfer/accept', enhancedAuthenticate, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { transferToken } = req.body;
    // userId is available via req.user but not needed for this operation
    // The transfer validation is done via the token

    if (!transferToken) {
      res.status(400).json({
        error: 'Missing required field: transferToken'
      });
      return;
    }

    // Accept transfer
    const result = await subscriberEmailService.acceptTransfer(transferToken);

    res.json({
      success: true,
      data: {
        organizationId: result.organizationId,
        newEmail: result.newSubscriberEmail,
        message: result.message
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to accept subscriber email transfer';
    res.status(400).json({
      error: message
    });
  }
});

/**
 * Cancel pending subscriber email transfer
 * DELETE /api/organizations/:organizationId/subscriber-email/transfer
 */
router.delete('/:organizationId/subscriber-email/transfer', enhancedAuthenticate, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      res.status(400).json({
        error: 'Missing required parameters'
      });
      return;
    }

    // Check if user is organization owner
    const isOwner = await organizationMemberService.isOrganizationOwner(
      organizationId,
      userId
    );

    if (!isOwner) {
      res.status(403).json({
        error: 'Only organization owners can cancel subscriber email transfer'
      });
      return;
    }

    // Cancel transfer
    await subscriberEmailService.cancelTransfer(organizationId);

    res.json({
      success: true,
      message: 'Subscriber email transfer cancelled'
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel subscriber email transfer';
    res.status(400).json({
      error: message
    });
  }
});

/**
 * Get subscriber email transfer history
 * GET /api/organizations/:organizationId/subscriber-email/history
 *
 * Returns: { transfers: [] }
 */
router.get('/:organizationId/subscriber-email/history', enhancedAuthenticate, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = req.params.organizationId;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      res.status(400).json({
        error: 'Missing required parameters'
      });
      return;
    }

    // Check if user is organization admin
    const isAdmin = await organizationMemberService.isOrganizationAdmin(
      organizationId,
      userId
    );

    if (!isAdmin) {
      res.status(403).json({
        error: 'Only organization admins can view subscriber email history'
      });
      return;
    }

    // Get transfer history
    const history = await subscriberEmailService.getTransferHistory(organizationId);

    res.json({
      success: true,
      data: {
        transfers: history,
        total: history.length
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber email history';
    res.status(500).json({
      error: message
    });
  }
});

/**
 * Update subscriber email (system admin only, for emergencies)
 * POST /api/admin/organizations/:organizationId/subscriber-email
 *
 * Body: { newEmail }
 * Returns: { success, previousEmail, newEmail }
 */
router.post('/admin/:organizationId/subscriber-email', enhancedAuthenticate, async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const organizationId = req.params.organizationId;
    const { newEmail } = req.body;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      res.status(400).json({
        error: 'Missing required parameters'
      });
      return;
    }

    if (!newEmail) {
      res.status(400).json({
        error: 'Missing required field: newEmail'
      });
      return;
    }

    // Check if user is system admin
    const user = await require('../database')('users')
      .where('id', userId)
      .first();

    if (user?.system_role !== 'SUPER_ADMIN') {
      res.status(403).json({
        error: 'Only system administrators can update subscriber email'
      });
      return;
    }

    // Update subscriber email
    const result = await subscriberEmailService.updateSubscriberEmail(
      organizationId,
      newEmail,
      'Emergency update by system admin'
    );

    res.json({
      success: true,
      data: {
        previousEmail: result.previousEmail,
        newEmail: result.newEmail,
        success: result.success,
        reason: 'Emergency update by system admin'
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update subscriber email';
    res.status(400).json({
      error: message
    });
  }
});

export default router;
