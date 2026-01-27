import { Response } from 'express';
import { jwtService } from '../services/jwt.service';
import { impersonationService } from '../services/impersonation.service';
import { EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { logger } from '../utils/logger';
import { logAuditAction, AuditActionType, AuditResourceType } from '../utils/audit-logger';

/**
 * Start impersonating a user in an organization
 * Only OWNER/ADMIN can impersonate users
 */
export const startImpersonation = async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { targetUserId } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!targetUserId) {
      res.status(400).json({ error: 'Target user ID required' });
      return;
    }

    // Verify actor has permission (OWNER/ADMIN in this org)
    if (!['owner', 'admin'].includes(req.user.org_role)) {
      res.status(403).json({ error: 'Only OWNER/ADMIN can impersonate users' });
      return;
    }

    // Verify target user exists and is in this organization
    const isValidTarget = await impersonationService.verifyTargetUser(targetUserId, req.user.org_id);
    if (!isValidTarget) {
      res.status(404).json({ error: 'Target user not found in organization' });
      return;
    }

    // Check if actor already has an active impersonation session
    const existingSession = await impersonationService.getActiveByActor(req.user.id, req.user.org_id);
    if (existingSession) {
      res.status(409).json({
        error: 'You already have an active impersonation session',
        existingSessionId: existingSession.id,
      });
      return;
    }

    // Generate impersonation token
    const { token, impersonationId } = await jwtService.generateImpersonationToken(
      targetUserId,
      req.user.org_id,
      req.user.id
    );

    // Create audit log entry in database
    const logId = await impersonationService.createLog({
      organizationId: req.user.org_id,
      actorId: req.user.id,
      targetUserId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { impersonationId },
    });

    // Log audit event
    logAuditAction({
      organizationId: req.user.org_id,
      actorId: req.user.id,
      action: AuditActionType.ADMIN_IMPERSONATION_STARTED,
      resourceType: AuditResourceType.USER,
      resourceId: targetUserId,
      metadata: {
        targetUserId,
        impersonationLogId: logId,
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logger.info(`User ${req.user.id} started impersonating ${targetUserId} in org ${req.user.org_id}`);

    res.json({
      accessToken: token,
      impersonationId,
      targetUserId,
      expiresIn: '1h',
      warning: 'You are now impersonating a user. All actions will be logged.',
    });
  } catch (error) {
    logger.error('Error starting impersonation:', error);
    res.status(500).json({ error: 'Failed to start impersonation' });
  }
};

/**
 * End impersonation session
 */
export const endImpersonation = async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!req.user.isImpersonating || !req.user.impersonationId) {
      res.status(400).json({ error: 'No active impersonation session' });
      return;
    }

    // Get the impersonation session to find the log ID
    const session = await impersonationService.getById(req.user.impersonationId);

    if (session) {
      // Update impersonation log with end time
      await impersonationService.endSession(session.id);

      // Log audit event
      logAuditAction({
        organizationId: req.user.org_id,
        actorId: req.user.actorUserId,
        action: AuditActionType.ADMIN_IMPERSONATION_ENDED,
        resourceType: AuditResourceType.USER,
        resourceId: req.user.id,
        metadata: {
          targetUserId: req.user.id,
          impersonationLogId: session.id,
          duration: session.started_at
            ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
            : null,
        },
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    logger.info(`User ${req.user.actorUserId} ended impersonation of ${req.user.id}`);

    res.json({
      message: 'Impersonation session ended',
      endedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error ending impersonation:', error);
    res.status(500).json({ error: 'Failed to end impersonation' });
  }
};

/**
 * Get current impersonation status
 */
export const getImpersonationStatus = async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!req.user.isImpersonating) {
      res.json({
        isImpersonating: false,
      });
      return;
    }

    // Get impersonation details from database
    const session = req.user.impersonationId
      ? await impersonationService.getById(req.user.impersonationId)
      : null;

    if (session) {
      res.json({
        isImpersonating: true,
        impersonationId: session.id,
        actor: session.actor || { id: req.user.actorUserId, email: '', name: '' },
        targetUser: session.target_user || { id: req.user.id, email: req.user.email || '', name: '' },
        startedAt: session.started_at,
        startedAtISO: new Date(session.started_at).toISOString(),
      });
      return;
    }

    // Fallback to JWT data if session not found in DB
    res.json({
      isImpersonating: true,
      impersonationId: req.user.impersonationId,
      actor: { id: req.user.actorUserId || 'unknown', email: '', name: '' },
      targetUser: { id: req.user.id, email: req.user.email || '', name: '' },
      startedAt: new Date(),
      startedAtISO: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error getting impersonation status:', error);
    res.status(500).json({ error: 'Failed to get impersonation status' });
  }
};

/**
 * Get impersonation audit logs for an organization
 * Only OWNER/ADMIN can view this
 */
export const getImpersonationAudit = async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Verify permissions
    if (!['owner', 'admin'].includes(req.user.org_role)) {
      res.status(403).json({ error: 'Only OWNER/ADMIN can view impersonation audit logs' });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);

    // Get impersonation logs from database
    const { logs, total } = await impersonationService.getOrgLogs(
      req.user.org_id,
      page,
      limit
    );

    res.json({
      data: logs.map((log) => ({
        id: log.id,
        actor: log.actor || { id: log.actor_id, email: '', name: '' },
        target: log.target_user || { id: log.target_user_id, email: '', name: '' },
        startedAt: new Date(log.started_at).toISOString(),
        endedAt: log.ended_at ? new Date(log.ended_at).toISOString() : null,
        status: log.status,
        duration: log.ended_at
          ? Math.round((new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 1000)
          : null,
        ipAddress: log.ip_address,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    logger.error('Error getting impersonation audit:', error);
    res.status(500).json({ error: 'Failed to get impersonation audit logs' });
  }
};
