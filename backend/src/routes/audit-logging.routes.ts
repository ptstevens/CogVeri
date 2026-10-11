import { Router } from 'express';
import { getOrganizationAuditLogs } from '../utils/audit-logger';
import * as auditLoggingController from '../controllers/audit-logging.controller';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';

const router = Router();

// Apply authentication and organization middleware to all audit logging routes
router.use(enhancedAuthenticate);

// Audit log retrieval endpoints
router.get('/audit-logs', auditLoggingController.getAuditLogs);
router.get('/audit-logs/:logId', auditLoggingController.getAuditLogDetail);
router.get('/audit-logs/statistics', auditLoggingController.getAuditStatistics);

// Audit log export endpoint
router.get('/audit-logs/export', auditLoggingController.exportAuditLogs);

// Get organization audit logs (alternative endpoint using utility function)
router.get(
  '/organizations/:organizationId/audit-logs',
  async (req: EnhancedAuthRequest, res): Promise<void> => {
    try {
      const { organizationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string;
      const resourceType = req.query.resourceType as string;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      // Verify user has access to this organization
      if (req.user?.org_id !== organizationId && !req.user?.is_system_admin) {
        res.status(403).json({
          error: 'You do not have access to audit logs for this organization',
        });
        return;
      }

      const result = await getOrganizationAuditLogs(organizationId!, {
        limit,
        offset,
        action,
        resourceType: resourceType as any,
        startDate,
        endDate,
      });

      res.json({
        success: true,
        data: {
          logs: result.logs,
          total: result.total,
          hasMore: offset + result.logs.length < result.total,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to fetch audit logs',
      });
    }
  }
);

export default router;
