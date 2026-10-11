import express from 'express';
import {
  enhancedAuthenticate,
  requireRole,
  // preventImpersonatedActions is available for routes that need to block impersonation
  preventImpersonatedActions as _preventImpersonatedActions,
} from '../middleware/enhanced-auth.middleware';
import {
  startImpersonation,
  endImpersonation,
  getImpersonationStatus,
  getImpersonationAudit,
} from '../controllers/impersonation.controller';
import { jwtService } from '../services/jwt.service';
// import { prisma } from '../db/prisma'; // Not using Prisma - using Knex instead
import { logger } from '../utils/logger';
import { EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';

import { loginWithImpersonationToken } from '../controllers/auth.controller';

const router = express.Router();

/**
 * POST /api/auth/v2/impersonate/token
 * Login using an impersonation token
 */
router.post('/impersonate/token', loginWithImpersonationToken);

/**
 * POST /api/auth/v2/refresh
 * Refresh access token with optional organization switch
 */
router.post('/refresh', async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    const { refreshToken, targetOrgId } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const payload = jwtService.verifyRefreshToken(refreshToken);
    const newAccessToken = await jwtService.generateAccessToken(payload.userId, targetOrgId);

    res.json({
      accessToken: newAccessToken,
      expiresIn: '1h',
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * POST /api/auth/v2/switch-org
 * Change active organization without re-login
 * Requires authentication
 */
router.post(
  '/switch-org',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res): Promise<void> => {
    try {
      const { organizationId } = req.body;

      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      if (!organizationId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      // Pass cross-tenant context for sysadmins with active impersonation
      const crossTenantAccess =
        req.user.is_system_admin && req.user.isImpersonating
          ? { isSystemAdmin: true, currentOrgId: req.user.org_id }
          : undefined;

      const newAccessToken = await jwtService.switchOrganization(
        req.user.id,
        organizationId,
        crossTenantAccess
      );

      res.json({
        accessToken: newAccessToken,
        expiresIn: '1h',
      });
    } catch (error) {
      logger.error('Organization switch error:', error);
      res.status(400).json({ error: (error as Error).message });
    }
  }
);

/**
 * GET /api/auth/v2/me
 * Get current authenticated user with full multi-organization context
 * Requires authentication
 */
router.get('/me', enhancedAuthenticate, async (req: EnhancedAuthRequest, res): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Fetch user details
    const { db } = await import('../config/database');
    const user = await db('users')
      .where('id', req.user.id)
      .select('id', 'email', 'name', 'created_at')
      .first();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user,
      organization: {
        id: req.user.org_id,
        slug: req.user.org_slug,
        role: req.user.org_role,
      },
      organizations: req.user.organizations,
      isImpersonating: req.user.isImpersonating,
      ...(req.user.isImpersonating && {
        impersonationId: req.user.impersonationId,
        actorId: req.user.actorUserId,
      }),
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * POST /api/auth/v2/impersonate
 * Start impersonating a user (OWNER/ADMIN only)
 * Requires authentication
 */
router.post(
  '/impersonate',
  enhancedAuthenticate,
  requireRole('OWNER', 'ADMIN'),
  startImpersonation
);

/**
 * POST /api/auth/v2/impersonate/end
 * End current impersonation session
 * Requires authentication and active impersonation
 */
router.post('/impersonate/end', enhancedAuthenticate, endImpersonation);

/**
 * GET /api/auth/v2/impersonate/status
 * Get current impersonation status
 * Requires authentication
 */
router.get('/impersonate/status', enhancedAuthenticate, getImpersonationStatus);

/**
 * GET /api/auth/v2/impersonate/audit
 * View impersonation audit logs (OWNER/ADMIN only)
 * Requires authentication
 */
router.get(
  '/impersonate/audit',
  enhancedAuthenticate,
  requireRole('OWNER', 'ADMIN'),
  getImpersonationAudit
);

export default router;
