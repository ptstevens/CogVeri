import { db } from '../config/database';
import { logger } from '../utils/logger';
import { cacheService } from './cache.service';

export interface DashboardStats {
  tasks: {
    total: number;
    draft: number;
    assigned: number;
    in_progress: number;
    submitted: number;
    in_review: number;
    completed: number;
    rejected: number;
    overdue: number;
    archived: number;
  };
  recordings: {
    total: number;
    total_duration: number;
    average_duration: number;
    this_week: number;
    this_month: number;
  };
  performance: {
    tasks_completed_this_week: number;
    tasks_completed_this_month: number;
    average_completion_time: number;
    on_time_completion_rate: number;
  };
  recent_activity: any[];
}

class DashboardService {
  async getUserDashboardStats(userId: string, organizationId?: string): Promise<DashboardStats> {
    try {
      // Get organization ID from async context if not provided
      if (!organizationId) {
        const { getAsyncContext } = await import('../middleware/asyncContext');
        const context = getAsyncContext();
        organizationId = context?.organization_id;
      }

      const { BadRequestError } = await import('../utils/AppError');
      
      // Users without an organization (org_id='default-org' in JWT) cannot access dashboard stats
      if (!organizationId || organizationId === 'default-org') {
        throw new BadRequestError('Organization ID is required. Please join or create an organization first.');
      }

      // ★ Cache key: dashboard stats are cached per user per organization
      // TTL: 5 minutes (300s) - reasonable balance between freshness and DB load reduction
      const cacheKey = `dashboard:stats:${organizationId}:${userId}`;
      
      // Try to get from cache first
      const cached = await cacheService.get<DashboardStats>(cacheKey);
      if (cached) {
        logger.debug(`Dashboard stats cache hit for user ${userId} in org ${organizationId}`);
        return cached;
      }

      logger.debug(`Dashboard stats cache miss for user ${userId} in org ${organizationId}`);

      // Time windows for performance metrics
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const now = new Date();

      // ★ OPTIMIZATION: Consolidate all task queries into ONE batch query
      // Instead of 5 separate queries (taskStats, overdue, archived, completedThisWeek, completedThisMonth),
      // use PostgreSQL aggregation and CASE statements to get all stats in one query
      const taskAggregates = (await db('tasks')
        .where('organization_id', organizationId)
        .where(function() {
          this.where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewed_by', userId);
        })
        .select(
          db.raw('count(*) as total'),
          db.raw("count(case when status = 'draft' then 1 end) as draft"),
          db.raw("count(case when status = 'assigned' then 1 end) as assigned"),
          db.raw("count(case when status = 'in_progress' then 1 end) as in_progress"),
          db.raw("count(case when status = 'submitted' then 1 end) as submitted"),
          db.raw("count(case when status = 'in_review' then 1 end) as in_review"),
          db.raw("count(case when status = 'completed' then 1 end) as completed"),
          db.raw("count(case when status = 'rejected' then 1 end) as rejected"),
          db.raw("count(case when archived = true then 1 end) as archived"),
          db.raw(`count(case when due_date < ? and status in ('assigned', 'in_progress', 'submitted') then 1 end) as overdue`, [now]),
          db.raw(`count(case when assigned_to = ? and status = 'completed' and updated_at >= ? then 1 end) as completed_this_week`, [userId, weekAgo]),
          db.raw(`count(case when assigned_to = ? and status = 'completed' and updated_at >= ? then 1 end) as completed_this_month`, [userId, monthAgo])
        )
        .first());

      const tasks = {
        total: parseInt(taskAggregates.total) || 0,
        draft: parseInt(taskAggregates.draft) || 0,
        assigned: parseInt(taskAggregates.assigned) || 0,
        in_progress: parseInt(taskAggregates.in_progress) || 0,
        submitted: parseInt(taskAggregates.submitted) || 0,
        in_review: parseInt(taskAggregates.in_review) || 0,
        completed: parseInt(taskAggregates.completed) || 0,
        rejected: parseInt(taskAggregates.rejected) || 0,
        overdue: parseInt(taskAggregates.overdue) || 0,
        archived: parseInt(taskAggregates.archived) || 0,
      };

      // ★ OPTIMIZATION: Consolidate all recording queries into ONE batch query
      // Instead of 3 separate queries (recordingStats, recordingsThisWeek, recordingsThisMonth),
      // use PostgreSQL CASE statements to get all in one query
      const recordingAggregates = (await db('recordings')
        .where('organization_id', organizationId)
        .where('user_id', userId)
        .where('status', '!=', 'deleted')
        .select(
          db.raw('count(*) as total'),
          db.raw('sum(duration_seconds) as total_duration'),
          db.raw('avg(duration_seconds)::integer as average_duration'),
          db.raw(`count(case when created_at >= ? then 1 end) as this_week`, [weekAgo]),
          db.raw(`count(case when created_at >= ? then 1 end) as this_month`, [monthAgo])
        )
        .first());

      const recordings = {
        total: parseInt(recordingAggregates.total) || 0,
        total_duration: parseInt(recordingAggregates.total_duration) || 0,
        average_duration: parseInt(recordingAggregates.average_duration) || 0,
        this_week: parseInt(recordingAggregates.this_week) || 0,
        this_month: parseInt(recordingAggregates.this_month) || 0,
      };

      const performance = {
        tasks_completed_this_week: parseInt(taskAggregates.completed_this_week) || 0,
        tasks_completed_this_month: parseInt(taskAggregates.completed_this_month) || 0,
        average_completion_time: 0, // Could be calculated with EXTRACT(epoch from (updated_at - created_at))
        on_time_completion_rate: 0, // Could be calculated with CASE statements
      };

      // Get recent activity (this is still needed as it returns full records)
      const recentActivity = await db('tasks')
        .where('organization_id', organizationId)
        .where(function() {
          this.where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewed_by', userId);
        })
        .orderBy('updated_at', 'desc')
        .limit(10)
        .select('id', 'title', 'status', 'updated_at');

      const result = {
        tasks,
        recordings,
        performance,
        recent_activity: recentActivity,
      };

      // ★ Cache the result for 5 minutes
      // This significantly reduces database load for frequently accessed dashboard
      await cacheService.set(cacheKey, result, 5 * 60);

      return result;
    } catch (error) {
      logger.error('Error fetching user dashboard stats:', error);
      throw error;
    }
  }

  async getManagerDashboardStats(_managerId: string, _organizationId?: string): Promise<{
    team_members: number;
    team_tasks: {
      total: number;
      completed: number;
      in_progress: number;
      overdue: number;
    };
    member_performance: Array<Record<string, unknown>>;
  }> {
    try {
      // Temporary simplified implementation
      return {
        team_members: 0,
        team_tasks: {
          total: 0,
          completed: 0,
          in_progress: 0,
          overdue: 0,
        },
        member_performance: [],
      };
    } catch (error) {
      logger.error('Error fetching manager dashboard stats:', error);
      return {
        team_members: 0,
        team_tasks: {
          total: 0,
          completed: 0,
          in_progress: 0,
          overdue: 0,
        },
        member_performance: [],
      };
    }
  }

  async getTaskStatistics(_filters: { period?: string }, organizationId?: string): Promise<{
    total: number;
    by_status: Record<string, number>;
    by_priority: Record<string, number>;
    by_type: Record<string, number>;
  }> {
    // Get organization ID from async context if not provided
    if (!organizationId) {
      const { getAsyncContext } = await import('../middleware/asyncContext');
      const context = getAsyncContext();
      organizationId = context?.organization_id;
    }
    // Temporary simplified implementation
    return {
      total: 0,
      by_status: {},
      by_priority: {},
      by_type: {},
    };
  }
}

export const dashboardService = new DashboardService();