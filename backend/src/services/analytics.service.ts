import { db } from '../config/database';
import { logger } from '../utils/logger';
import { subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

interface TaskMetrics {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  averageCompletionTime: number;
  overdueCount: number;
  completedOnTime: number;
  completionRate: number;
}

interface RecordingMetrics {
  total: number;
  totalDuration: number;
  averageDuration: number;
  byType: Record<string, number>;
  storageUsed: number;
  thisWeek: number;
  thisMonth: number;
}

interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  usersByRole: Record<string, number>;
  mostActiveUsers: Array<{
    id: string;
    name: string;
    email: string;
    tasksCompleted: number;
    recordingsCreated: number;
  }>;
}

interface ReviewMetrics {
  total: number;
  pending: number;
  averageReviewTime: number;
  approvalRate: number;
  rejectionRate: number;
  reviewerPerformance: Array<{
    reviewerId: string;
    reviewerName: string;
    reviewsCompleted: number;
    averageTime: number;
  }>;
}

interface SystemMetrics {
  databaseSize: number;
  apiCallsToday: number;
  averageResponseTime: number;
  errorRate: number;
  uptime: number;
}

interface TimeSeriesData {
  date: string;
  value: number;
}

interface DashboardData {
  tasks: TaskMetrics;
  recordings: RecordingMetrics;
  users: UserMetrics;
  reviews: ReviewMetrics;
  system: SystemMetrics;
  trends: {
    tasksOverTime: TimeSeriesData[];
    recordingsOverTime: TimeSeriesData[];
    usersOverTime: TimeSeriesData[];
  };
}

class AnalyticsService {
  /**
   * Track an analytics event
   */
  async trackEvent(
    eventType: string,
    userId: string | null,
    eventData: any = {}
  ): Promise<void> {
    try {
      await db('analytics_events').insert({
        event_type: eventType,
        user_id: userId,
        event_data: JSON.stringify(eventData),
        created_at: new Date(),
      });
    } catch (error) {
      logger.error('Error tracking analytics event:', error);
    }
  }

  /**
   * Get task metrics using SQL aggregation (PERFORMANCE FIX)
   *
   * This replaces the previous implementation that fetched all rows into memory.
   * Now uses SQL GROUP BY and aggregation functions for O(1) memory usage.
   *
   * @param dateRange - Optional date range filter
   * @param organizationId - Organization ID for multi-tenant data isolation
   */
  async getTaskMetrics(dateRange?: { start: Date; end: Date }, organizationId?: string): Promise<TaskMetrics> {
    try {
      // Build base query with filters
      const baseQuery = () => {
        const q = db('tasks');
        if (organizationId) {
          q.where('organization_id', organizationId);
        }
        if (dateRange) {
          q.whereBetween('created_at', [dateRange.start, dateRange.end]);
        }
        return q;
      };

      // Execute all aggregations in parallel for efficiency
      const [
        totalResult,
        statusCounts,
        priorityCounts,
        completionStats,
        overdueResult,
        onTimeResult,
      ] = await Promise.all([
        // Total count
        baseQuery().count('* as count').first(),

        // Count by status (using GROUP BY instead of fetching all rows)
        baseQuery()
          .select('status')
          .count('* as count')
          .groupBy('status'),

        // Count by priority
        baseQuery()
          .select('priority')
          .count('* as count')
          .groupBy('priority'),

        // Completion statistics (average time, completed count)
        baseQuery()
          .where('status', 'completed')
          .whereNotNull('completed_at')
          .select(
            db.raw('COUNT(*) as completed_count'),
            db.raw('AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) as avg_completion_hours')
          )
          .first(),

        // Overdue count
        baseQuery()
          .whereNot('status', 'completed')
          .whereNotNull('due_date')
          .where('due_date', '<', new Date())
          .count('* as count')
          .first(),

        // Completed on time count
        baseQuery()
          .where('status', 'completed')
          .whereNotNull('completed_at')
          .whereNotNull('due_date')
          .whereRaw('completed_at <= due_date')
          .count('* as count')
          .first(),
      ]);

      // Transform results
      const total = Number(totalResult?.count ?? 0);
      const completedCount = Number(completionStats?.completed_count ?? 0);
      const avgCompletionHours = Number(completionStats?.avg_completion_hours ?? 0);

      // Build status map
      const byStatus: Record<string, number> = {};
      for (const row of statusCounts) {
        if (row.status) {
          byStatus[row.status] = Number(row.count);
        }
      }

      // Build priority map
      const byPriority: Record<string, number> = {};
      for (const row of priorityCounts) {
        if (row.priority) {
          byPriority[row.priority] = Number(row.count);
        }
      }

      const overdueCount = Number(overdueResult?.count ?? 0);
      const completedOnTime = Number(onTimeResult?.count ?? 0);
      const completionRate = total > 0 ? (completedCount / total) * 100 : 0;

      return {
        total,
        byStatus,
        byPriority,
        averageCompletionTime: Math.round(avgCompletionHours * 10) / 10,
        overdueCount,
        completedOnTime,
        completionRate: Math.round(completionRate * 10) / 10,
      };
    } catch (error) {
      logger.error('Error getting task metrics:', error);
      throw error;
    }
  }

  /**
   * Get recording metrics using SQL aggregation (PERFORMANCE FIX)
   *
   * This replaces the previous implementation that fetched all rows into memory.
   *
   * @param dateRange - Optional date range filter
   * @param organizationId - Organization ID for multi-tenant data isolation
   */
  async getRecordingMetrics(dateRange?: { start: Date; end: Date }, organizationId?: string): Promise<RecordingMetrics> {
    try {
      // Build base query with filters
      const baseQuery = () => {
        const q = db('recordings');
        if (organizationId) {
          q.where('organization_id', organizationId);
        }
        if (dateRange) {
          q.whereBetween('created_at', [dateRange.start, dateRange.end]);
        }
        return q;
      };

      const weekStart = startOfWeek(new Date());
      const monthStart = startOfMonth(new Date());

      // Execute all aggregations in parallel
      const [
        overallStats,
        typeCounts,
        thisWeekResult,
        thisMonthResult,
      ] = await Promise.all([
        // Overall stats: total, duration, storage
        baseQuery()
          .select(
            db.raw('COUNT(*) as total'),
            db.raw('COALESCE(SUM(duration_seconds), 0) as total_duration'),
            db.raw('COALESCE(AVG(duration_seconds), 0) as avg_duration'),
            db.raw('COALESCE(SUM(CAST(file_size_bytes AS BIGINT)), 0) as total_bytes')
          )
          .first(),

        // Count by type
        baseQuery()
          .select('type')
          .count('* as count')
          .groupBy('type'),

        // This week count
        baseQuery()
          .where('created_at', '>=', weekStart)
          .count('* as count')
          .first(),

        // This month count
        baseQuery()
          .where('created_at', '>=', monthStart)
          .count('* as count')
          .first(),
      ]);

      // Transform results
      const total = Number(overallStats?.total ?? 0);
      const totalDuration = Number(overallStats?.total_duration ?? 0);
      const averageDuration = Number(overallStats?.avg_duration ?? 0);
      const totalBytes = Number(overallStats?.total_bytes ?? 0);
      const storageUsed = totalBytes / (1024 * 1024); // Convert to MB

      // Build type map
      const byType: Record<string, number> = {};
      for (const row of typeCounts) {
        if (row.type) {
          byType[row.type] = Number(row.count);
        }
      }

      return {
        total,
        totalDuration,
        averageDuration: Math.round(averageDuration),
        byType,
        storageUsed: Math.round(storageUsed * 10) / 10,
        thisWeek: Number(thisWeekResult?.count ?? 0),
        thisMonth: Number(thisMonthResult?.count ?? 0),
      };
    } catch (error) {
      logger.error('Error getting recording metrics:', error);
      throw error;
    }
  }

  /**
   * Get user metrics
   * @param organizationId - Organization ID for multi-tenant data isolation
   */
  async getUserMetrics(organizationId?: string): Promise<UserMetrics> {
    try {
      const query = db('users').select('*');
      if (organizationId) {
        query.where('organization_id', organizationId);
      }
      const users = await query;

      // Count users by role
      const usersByRole = users.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Get active users (logged in within last 7 days)
      const sevenDaysAgo = subDays(new Date(), 7);
      const activeUsers = users.filter(u =>
        u.last_login && new Date(u.last_login) >= sevenDaysAgo
      ).length;

      // New users this month
      const monthStart = startOfMonth(new Date());
      const newUsersThisMonth = users.filter(u =>
        new Date(u.created_at) >= monthStart
      ).length;

      // Get most active users
      // Build subqueries with organization filter
      const tasksSubquery = db('tasks')
        .select('created_by')
        .count('* as tasks_completed')
        .where('status', 'completed')
        .modify((qb) => {
          if (organizationId) {
            qb.where('organization_id', organizationId);
          }
        })
        .groupBy('created_by')
        .as('task_counts');

      const recordingsSubquery = db('recordings')
        .select('user_id')
        .count('* as recordings_created')
        .modify((qb) => {
          if (organizationId) {
            qb.where('organization_id', organizationId);
          }
        })
        .groupBy('user_id')
        .as('recording_counts');

      let userActivityQuery = db('users')
        .leftJoin(tasksSubquery, 'users.id', 'task_counts.created_by')
        .leftJoin(recordingsSubquery, 'users.id', 'recording_counts.user_id')
        .select(
          'users.id',
          'users.name',
          'users.email',
          db.raw('COALESCE(task_counts.tasks_completed, 0) as tasks_completed'),
          db.raw('COALESCE(recording_counts.recordings_created, 0) as recordings_created')
        );

      if (organizationId) {
        userActivityQuery = userActivityQuery.where('users.organization_id', organizationId);
      }

      const userActivity = await userActivityQuery
        .orderBy('tasks_completed', 'desc')
        .limit(5);

      return {
        totalUsers: users.length,
        activeUsers,
        newUsersThisMonth,
        usersByRole,
        mostActiveUsers: userActivity.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          tasksCompleted: Number(u.tasks_completed),
          recordingsCreated: Number(u.recordings_created),
        })),
      };
    } catch (error) {
      logger.error('Error getting user metrics:', error);
      throw error;
    }
  }

  /**
   * Get review metrics
   * @param organizationId - Organization ID for multi-tenant data isolation
   */
  async getReviewMetrics(organizationId?: string): Promise<ReviewMetrics> {
    try {
      // Reviews don't have organization_id directly, so we join through tasks
      let reviewsQuery = db('reviews').select('reviews.*');
      if (organizationId) {
        reviewsQuery = reviewsQuery
          .join('tasks', 'reviews.task_id', 'tasks.id')
          .where('tasks.organization_id', organizationId);
      }
      const reviews = await reviewsQuery;

      const pending = reviews.filter(r => r.status === 'pending').length;

      // Calculate average review time (in hours)
      const completedReviews = reviews.filter(r => r.status === 'approved' || r.status === 'rejected');
      const reviewTimes = completedReviews.map(r => {
        const created = new Date(r.created_at).getTime();
        const completed = new Date(r.updated_at).getTime();
        return (completed - created) / (1000 * 60 * 60);
      });

      const averageReviewTime = reviewTimes.length > 0
        ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length
        : 0;

      const approved = reviews.filter(r => r.status === 'approved').length;
      const rejected = reviews.filter(r => r.status === 'rejected').length;
      const total = approved + rejected;

      const approvalRate = total > 0 ? (approved / total) * 100 : 0;
      const rejectionRate = total > 0 ? (rejected / total) * 100 : 0;

      // Get reviewer performance
      let performanceQuery = db('reviews')
        .join('users', 'reviews.reviewer_id', 'users.id')
        .select(
          'reviews.reviewer_id',
          'users.name as reviewer_name',
          db.raw('COUNT(*) as reviews_completed'),
          db.raw('AVG(EXTRACT(EPOCH FROM (reviews.updated_at - reviews.created_at)) / 3600) as average_time')
        )
        .whereIn('reviews.status', ['approved', 'rejected']);

      if (organizationId) {
        performanceQuery = performanceQuery
          .join('tasks', 'reviews.task_id', 'tasks.id')
          .where('tasks.organization_id', organizationId);
      }

      const reviewerPerformance = await performanceQuery
        .groupBy('reviews.reviewer_id', 'users.name')
        .orderBy('reviews_completed', 'desc')
        .limit(5);

      return {
        total: reviews.length,
        pending,
        averageReviewTime: Math.round(averageReviewTime * 10) / 10,
        approvalRate: Math.round(approvalRate * 10) / 10,
        rejectionRate: Math.round(rejectionRate * 10) / 10,
        reviewerPerformance: reviewerPerformance.map(r => ({
          reviewerId: r.reviewer_id,
          reviewerName: r.reviewer_name,
          reviewsCompleted: Number(r.reviews_completed),
          averageTime: Math.round(Number(r.average_time) * 10) / 10,
        })),
      };
    } catch (error) {
      logger.error('Error getting review metrics:', error);
      throw error;
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      // Get database size (this is PostgreSQL specific)
      const dbSizeResult = await db.raw(`
        SELECT pg_database_size(current_database()) as size
      `);
      const databaseSize = dbSizeResult.rows[0]?.size || 0;

      // Get API calls today (from analytics events)
      const todayStart = startOfDay(new Date());
      const apiCallsResult = await db('analytics_events')
        .where('event_type', 'api_call')
        .where('created_at', '>=', todayStart)
        .count('* as count');
      const apiCallsToday = Number(apiCallsResult[0]?.count ?? 0);

      // Get average response time (mock data for now)
      const averageResponseTime = 145; // milliseconds

      // Calculate error rate (mock data for now)
      const errorRate = 0.2; // percentage

      // Calculate uptime (in hours since last restart - mock)
      const uptime = 720; // 30 days

      return {
        databaseSize: Math.round(databaseSize / (1024 * 1024)), // Convert to MB
        apiCallsToday,
        averageResponseTime,
        errorRate,
        uptime,
      };
    } catch (error) {
      logger.error('Error getting system metrics:', error);
      // Return default values if database-specific queries fail
      return {
        databaseSize: 0,
        apiCallsToday: 0,
        averageResponseTime: 0,
        errorRate: 0,
        uptime: 0,
      };
    }
  }

  /**
   * Get time series data for trends
   * Optimized: Uses 3 aggregated GROUP BY queries instead of 90+ individual queries
   *
   * @param days - Number of days to include in the trend data (default: 30)
   * @param organizationId - Organization ID for multi-tenant data isolation (required for security)
   */
  async getTrendData(days: number = 30, organizationId?: string): Promise<{
    tasksOverTime: TimeSeriesData[];
    recordingsOverTime: TimeSeriesData[];
    usersOverTime: TimeSeriesData[];
  }> {
    try {
      // Calculate the start date for the query range
      const startDate = subDays(new Date(), days);

      // Build date lookup for filling gaps (days with zero counts)
      const dateMap = new Map<string, number>();
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = date.toISOString().split('T')[0] ?? '';
        dateMap.set(dateStr, 0);
      }

      // Execute all three aggregated queries in parallel (3 queries instead of 90+)
      const [tasksResult, recordingsResult, usersResult] = await Promise.all([
        // Single aggregated query for tasks (instead of 30 individual queries)
        db('tasks')
          .select(db.raw("DATE(created_at) as date"))
          .count('* as count')
          .where('created_at', '>=', startDate)
          .modify((queryBuilder) => {
            if (organizationId) {
              queryBuilder.where('organization_id', organizationId);
            }
          })
          .groupBy(db.raw('DATE(created_at)'))
          .orderBy('date', 'asc'),

        // Single aggregated query for recordings (instead of 30 individual queries)
        db('recordings')
          .select(db.raw("DATE(created_at) as date"))
          .count('* as count')
          .where('created_at', '>=', startDate)
          .modify((queryBuilder) => {
            if (organizationId) {
              queryBuilder.where('organization_id', organizationId);
            }
          })
          .groupBy(db.raw('DATE(created_at)'))
          .orderBy('date', 'asc'),

        // Single aggregated query for users (instead of 30 individual queries)
        db('users')
          .select(db.raw("DATE(created_at) as date"))
          .count('* as count')
          .where('created_at', '>=', startDate)
          .modify((queryBuilder) => {
            if (organizationId) {
              queryBuilder.where('organization_id', organizationId);
            }
          })
          .groupBy(db.raw('DATE(created_at)'))
          .orderBy('date', 'asc'),
      ]);

      // Helper function to merge query results with date map (fills in zero-count days)
      const mergeWithDateMap = (results: Array<{ date: Date | string; count: string | number }>): TimeSeriesData[] => {
        const merged = new Map(dateMap);
        for (const row of results) {
          const dateStr = row.date instanceof Date
            ? (row.date.toISOString().split('T')[0] ?? '')
            : (String(row.date).split('T')[0] ?? '');
          merged.set(dateStr, Number(row.count));
        }
        return Array.from(merged.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, value]) => ({ date, value }));
      };

      return {
        tasksOverTime: mergeWithDateMap(tasksResult),
        recordingsOverTime: mergeWithDateMap(recordingsResult),
        usersOverTime: mergeWithDateMap(usersResult),
      };
    } catch (error) {
      logger.error('Error getting trend data:', error);
      return {
        tasksOverTime: [],
        recordingsOverTime: [],
        usersOverTime: [],
      };
    }
  }

  /**
   * Get complete dashboard data
   * @param dateRange - Optional date range filter
   * @param organizationId - Organization ID for multi-tenant data isolation
   */
  async getDashboardData(dateRange?: { start: Date; end: Date }, organizationId?: string): Promise<DashboardData> {
    try {
      const [tasks, recordings, users, reviews, system, trends] = await Promise.all([
        this.getTaskMetrics(dateRange, organizationId),
        this.getRecordingMetrics(dateRange, organizationId),
        this.getUserMetrics(organizationId),
        this.getReviewMetrics(organizationId),
        this.getSystemMetrics(),
        this.getTrendData(30, organizationId),
      ]);

      return {
        tasks,
        recordings,
        users,
        reviews,
        system,
        trends,
      };
    } catch (error) {
      logger.error('Error getting dashboard data:', error);
      throw error;
    }
  }

  /**
   * Generate report
   * @param reportType - Type of report (daily, weekly, monthly)
   * @param format - Output format (json or csv)
   * @param organizationId - Organization ID for multi-tenant data isolation
   */
  async generateReport(
    reportType: 'daily' | 'weekly' | 'monthly',
    format: 'json' | 'csv' = 'json',
    organizationId?: string
  ): Promise<any> {
    try {
      let dateRange;
      const now = new Date();

      switch (reportType) {
        case 'daily':
          dateRange = {
            start: startOfDay(now),
            end: endOfDay(now),
          };
          break;
        case 'weekly':
          dateRange = {
            start: startOfWeek(now),
            end: endOfWeek(now),
          };
          break;
        case 'monthly':
          dateRange = {
            start: startOfMonth(now),
            end: endOfMonth(now),
          };
          break;
      }

      const data = await this.getDashboardData(dateRange, organizationId);

      if (format === 'csv') {
        // Convert to CSV format
        return this.convertToCSV(data);
      }

      return data;
    } catch (error) {
      logger.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Convert data to CSV format
   */
  private convertToCSV(data: any): string {
    // Simplified CSV conversion
    const lines = [];
    lines.push('CogVeri Analytics Report');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    lines.push('Task Metrics');
    lines.push(`Total Tasks,${data.tasks.total}`);
    lines.push(`Completion Rate,${data.tasks.completionRate}%`);
    lines.push(`Average Completion Time,${data.tasks.averageCompletionTime} hours`);
    lines.push('');

    lines.push('Recording Metrics');
    lines.push(`Total Recordings,${data.recordings.total}`);
    lines.push(`Total Duration,${data.recordings.totalDuration} seconds`);
    lines.push(`Storage Used,${data.recordings.storageUsed} MB`);
    lines.push('');

    lines.push('User Metrics');
    lines.push(`Total Users,${data.users.totalUsers}`);
    lines.push(`Active Users,${data.users.activeUsers}`);
    lines.push('');

    lines.push('Review Metrics');
    lines.push(`Total Reviews,${data.reviews.total}`);
    lines.push(`Approval Rate,${data.reviews.approvalRate}%`);
    lines.push(`Average Review Time,${data.reviews.averageReviewTime} hours`);

    return lines.join('\n');
  }
}

export default new AnalyticsService();