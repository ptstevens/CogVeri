import express from 'express';
import { enhancedAuthenticate, requireRole } from '../middleware/enhanced-auth.middleware';
import { EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { invitationService } from '../services/invitation.service';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * GET /api/invitations/v2/validate/:token
 * Public endpoint to validate invitation token (no auth required)
 */
router.get('/validate/:token', async (req, res): Promise<void> => {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({ error: 'Token required' });
      return;
    }

    const result = await invitationService.validateInvitationToken(token);
    res.json(result);
  } catch (error) {
    logger.error('Error validating invitation:', error);
    res.status(500).json({ error: 'Failed to validate invitation' });
  }
});

/**
 * POST /api/invitations/v2/accept
 * Accept invitation and create organization membership
 * Requires authentication
 */
router.post(
  '/accept',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res): Promise<void> => {
    try {
      const { token } = req.body;

      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      if (!token) {
        res.status(400).json({ error: 'Invitation token required' });
        return;
      }

      await invitationService.acceptInvitation(token, req.user.id);

      res.json({
        message: 'Invitation accepted successfully',
      });
    } catch (error) {
      logger.error('Error accepting invitation:', error);
      const errorMessage = (error as Error).message;

      if (errorMessage.includes('expired')) {
        res.status(400).json({ error: 'Invitation has expired' });
        return;
      }
      if (errorMessage.includes('not found')) {
        res.status(404).json({ error: 'Invitation not found' });
        return;
      }
      if (errorMessage.includes('already')) {
        res.status(400).json({ error: errorMessage });
        return;
      }
      if (errorMessage.includes('Email')) {
        res.status(400).json({ error: 'Email does not match invitation' });
        return;
      }

      res.status(500).json({ error: 'Failed to accept invitation' });
    }
  }
);

/**
 * POST /api/invitations/v2/reject
 * Reject invitation
 * Requires authentication
 */
router.post(
  '/reject',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res): Promise<void> => {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({ error: 'Invitation token required' });
        return;
      }

      await invitationService.rejectInvitation(token);

      res.json({
        message: 'Invitation rejected successfully',
      });
    } catch (error) {
      logger.error('Error rejecting invitation:', error);
      const errorMessage = (error as Error).message;

      if (errorMessage.includes('not found')) {
        res.status(404).json({ error: 'Invitation not found' });
        return;
      }
      if (errorMessage.includes('already')) {
        res.status(400).json({ error: 'Invitation has already been processed' });
        return;
      }

      res.status(500).json({ error: 'Failed to reject invitation' });
    }
  }
);

/**
 * GET /api/invitations/v2/pending
 * Get authenticated user's pending invitations
 * Requires authentication
 */
router.get(
  '/pending',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const invitations = await invitationService.getUserInvitations(req.user.email);

      res.json({
        data: invitations,
      });
    } catch (error) {
      logger.error('Error fetching pending invitations:', error);
      res.status(500).json({ error: 'Failed to fetch pending invitations' });
    }
  }
);

/**
 * POST /api/organizations/:id/invitations
 * Send invitation to user to join organization (OWNER/ADMIN only)
 * Requires authentication
 */
router.post(
  '/organizations/:id/invitations',
  enhancedAuthenticate,
  requireRole('OWNER', 'ADMIN'),
  async (req: EnhancedAuthRequest, res): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      if (req.user.org_id !== req.params.id) {
        res.status(403).json({ error: 'Cannot send invitations to other organizations' });
        return;
      }

      const { email, role } = req.body;

      if (!email || !role) {
        res.status(400).json({ error: 'Email and role are required' });
        return;
      }

      const validRoles = ['OWNER', 'ADMIN', 'CREATOR', 'REVIEWER', 'VIEWER', 'MEMBER'];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      const { token, id } = await invitationService.createInvitation({
        organizationId: req.params.id,
        email: email.toLowerCase(),
        role,
        invitedBy: req.user.id,
      });

      // Send email (integrate with email service)
      await invitationService.sendInvitationEmail(email, req.user.org_slug, token, req.user.email);

      res.status(201).json({
        id,
        email,
        role,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      logger.error('Error creating invitation:', error);
      const errorMessage = (error as Error).message;

      if (errorMessage.includes('already')) {
        res.status(400).json({ error: errorMessage });
        return;
      }

      res.status(500).json({ error: 'Failed to create invitation' });
    }
  }
);

/**
 * GET /api/organizations/:id/invitations
 * List organization invitations (OWNER/ADMIN only)
 * Requires authentication
 */
router.get(
  '/organizations/:id/invitations',
  enhancedAuthenticate,
  requireRole('OWNER', 'ADMIN'),
  async (req: EnhancedAuthRequest, res): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      if (req.user.org_id !== req.params.id) {
        res.status(403).json({ error: 'Cannot view invitations for other organizations' });
        return;
      }

      const status = (req.query.status as string) || undefined;
      const invitations = await invitationService.getOrganizationInvitations(req.params.id, status);

      res.json({
        data: invitations,
      });
    } catch (error) {
      logger.error('Error fetching invitations:', error);
      res.status(500).json({ error: 'Failed to fetch invitations' });
    }
  }
);

/**
 * DELETE /api/organizations/:id/invitations/:invitationId
 * Revoke pending invitation (OWNER/ADMIN only)
 * Requires authentication
 */
router.delete(
  '/organizations/:id/invitations/:invitationId',
  enhancedAuthenticate,
  requireRole('OWNER', 'ADMIN'),
  async (req: EnhancedAuthRequest, res): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      if (req.user.org_id !== req.params.id) {
        res.status(403).json({ error: 'Cannot manage invitations for other organizations' });
        return;
      }

      await invitationService.revokeInvitation(req.params.invitationId!, req.user.id);

      res.json({
        message: 'Invitation revoked successfully',
      });
    } catch (error) {
      logger.error('Error revoking invitation:', error);
      const errorMessage = (error as Error).message;

      if (errorMessage.includes('not found')) {
        res.status(404).json({ error: 'Invitation not found' });
        return;
      }
      if (errorMessage.includes('non-pending')) {
        res.status(400).json({ error: 'Cannot revoke non-pending invitation' });
        return;
      }

      res.status(500).json({ error: 'Failed to revoke invitation' });
    }
  }
);

export default router;
