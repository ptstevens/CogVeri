import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { dashboardService } from '../services/dashboard.service';
import { BadRequestError } from '../utils/AppError';

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const organizationId = (req as any).user?.org_id;
    const userRole = req.user!.org_role;
    const isSystemAdmin = (req as any).user?.is_system_admin;

    // System admins can access dashboard without explicit organization context
    if (!organizationId && !isSystemAdmin) {
      throw new BadRequestError('Organization ID is required');
    }

    // Get basic user dashboard stats
    const stats = await dashboardService.getUserDashboardStats(userId, organizationId);

    // If user is a manager, also get team stats
    let teamStats = null;
    if (userRole === 'manager' || userRole === 'admin' || userRole === 'owner') {
      teamStats = await dashboardService.getManagerDashboardStats(userId, organizationId);
    }

    res.json({
      success: true,
      data: {
        ...stats,
        team: teamStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTaskStatistics = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    const isSystemAdmin = (req as any).user?.is_system_admin;

    // System admins can access task statistics without explicit organization context
    if (!organizationId && !isSystemAdmin) {
      throw new BadRequestError('Organization ID is required');
    }

    const { period = '30d' } = req.query;

    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // This would typically query the database for task completion trends
    // For now, returning mock data
    const stats = {
      period,
      start_date: startDate,
      end_date: new Date(),
      tasks_created: 42,
      tasks_completed: 38,
      average_completion_time: 48, // hours
      completion_rate: 90.5, // percentage
      trend: [
        { date: '2024-01-01', created: 5, completed: 3 },
        { date: '2024-01-02', created: 3, completed: 4 },
        { date: '2024-01-03', created: 7, completed: 6 },
        // ... more data points
      ],
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

export const getPerformanceMetrics = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    const userRole = req.user!.org_role;
    const isSystemAdmin = (req as any).user?.is_system_admin;

    // System admins can access performance metrics without explicit organization context
    if (!organizationId && !isSystemAdmin) {
      throw new BadRequestError('Organization ID is required');
    }

    if (userRole !== 'manager' && userRole !== 'admin') {
      throw new BadRequestError('Access denied. Manager or admin role required.');
    }

    // This would typically calculate various performance metrics
    const metrics = {
      team_productivity: {
        tasks_per_user: 8.5,
        average_completion_time: 36, // hours
        on_time_delivery_rate: 85, // percentage
      },
      quality_metrics: {
        first_time_approval_rate: 78, // percentage
        average_review_cycles: 1.3,
        customer_satisfaction: 4.2, // out of 5
      },
      efficiency_metrics: {
        recording_to_review_time: 24, // hours
        review_to_completion_time: 12, // hours
        total_cycle_time: 48, // hours
      },
    };

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

export const getActivityFeed = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    const isSystemAdmin = (req as any).user?.is_system_admin;

    // System admins can access activity feed without explicit organization context
    if (!organizationId && !isSystemAdmin) {
      throw new BadRequestError('Organization ID is required');
    }

    const { limit = 20, offset = 0 } = req.query;

    // This would typically fetch recent activity from the database
    const activities = [
      {
        id: '1',
        type: 'task_completed',
        title: 'Onboarding Tutorial Recording',
        user: 'John Doe',
        timestamp: new Date(),
      },
      {
        id: '2',
        type: 'recording_uploaded',
        title: 'Product Demo Video',
        user: 'Jane Smith',
        timestamp: new Date(Date.now() - 3600000),
      },
      // ... more activities
    ];

    res.json({
      success: true,
      data: activities,
      pagination: {
        total: 100,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    next(error);
  }
};
/**
 * GET /dashboard/cohort
 * Cohort benchmarking — org-wide performance analytics
 * Requires admin/owner/manager role
 */
export const getCohortStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    if (!organizationId) throw new BadRequestError('Organization ID is required');

    const stats = await dashboardService.getCohortStats(organizationId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /dashboard/export?period=90
 * Org-wide CSV data export
 * Requires admin/owner role
 */
export const exportOrgData = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    if (!organizationId) throw new BadRequestError('Organization ID is required');

    const periodDays = Math.min(parseInt(req.query.period as string) || 90, 365);
    const csv = await dashboardService.exportOrgData(organizationId, periodDays);

    const filename = `cogveri-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};
