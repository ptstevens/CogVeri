import { db } from '../config/database';
import { logger } from '../utils/logger';

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
  async getUserDashboardStats(userId: string): Promise<DashboardStats> {
    try {
      // Get task stats for tasks related to this user
      const taskStats = await db('tasks')
        .select('status')
        .where(function() {
          this.where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewer_id', userId);
        })
        .groupBy('status')
        .select(db.raw('count(*) as count, status'));

      const tasks = {
        total: 0,
        draft: 0,
        assigned: 0,
        in_progress: 0,
        submitted: 0,
        in_review: 0,
        completed: 0,
        rejected: 0,
        overdue: 0,
        archived: 0,
      };

      taskStats.forEach((stat: any) => {
        tasks.total += parseInt(stat.count);
        if (stat.status in tasks) {
          (tasks as any)[stat.status] = parseInt(stat.count);
        }
      });

      // Get overdue tasks
      const overdueCount = await db('tasks')
        .where(function() {
          this.where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewer_id', userId);
        })
        .where('due_date', '<', new Date())
        .whereIn('status', ['assigned', 'in_progress', 'submitted'])
        .count('* as count')
        .first();

      tasks.overdue = parseInt(overdueCount?.count as string) || 0;

      // Get archived tasks count
      const archivedCount = await db('tasks')
        .where(function() {
          this.where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewer_id', userId);
        })
        .where('archived', true)
        .count('* as count')
        .first();

      tasks.archived = parseInt(archivedCount?.count as string) || 0;

      // Get recording stats for user's tasks
      const recordingStats = await db('recordings')
        .where('user_id', userId)
        .where('status', '!=', 'deleted')
        .select(
          db.raw('count(*) as total'),
          db.raw('sum(duration_seconds) as total_duration'),
          db.raw('avg(duration_seconds) as average_duration')
        )
        .first();

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const recordingsThisWeek = await db('recordings')
        .where('user_id', userId)
        .where('created_at', '>=', weekAgo)
        .where('status', '!=', 'deleted')
        .count('* as count')
        .first();

      const recordingsThisMonth = await db('recordings')
        .where('user_id', userId)
        .where('created_at', '>=', monthAgo)
        .where('status', '!=', 'deleted')
        .count('* as count')
        .first();

      const recordings = {
        total: parseInt((recordingStats as any)?.total as string) || 0,
        total_duration: parseInt((recordingStats as any)?.total_duration as string) || 0,
        average_duration: parseFloat((recordingStats as any)?.average_duration as string) || 0,
        this_week: parseInt(recordingsThisWeek?.count as string) || 0,
        this_month: parseInt(recordingsThisMonth?.count as string) || 0,
      };

      // Get performance metrics
      const completedThisWeek = await db('tasks')
        .where('assigned_to', userId)
        .where('status', 'completed')
        .where('updated_at', '>=', weekAgo)
        .count('* as count')
        .first();

      const completedThisMonth = await db('tasks')
        .where('assigned_to', userId)
        .where('status', 'completed')
        .where('updated_at', '>=', monthAgo)
        .count('* as count')
        .first();

      const performance = {
        tasks_completed_this_week: parseInt(completedThisWeek?.count as string) || 0,
        tasks_completed_this_month: parseInt(completedThisMonth?.count as string) || 0,
        average_completion_time: 0,
        on_time_completion_rate: 0,
      };

      // Get recent activity
      const recentActivity = await db('tasks')
        .where(function() {
          this.where('assigned_to', userId)
            .orWhere('created_by', userId)
            .orWhere('reviewer_id', userId);
        })
        .orderBy('updated_at', 'desc')
        .limit(10)
        .select('id', 'title', 'status', 'updated_at');

      return {
        tasks,
        recordings,
        performance,
        recent_activity: recentActivity,
      };
    } catch (error) {
      logger.error('Error fetching user dashboard stats:', error);
      throw error;
    }
  }

  async getManagerDashboardStats(managerId: string): Promise<any> {
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

  async getTaskStatistics(filters: { period?: string }): Promise<any> {
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