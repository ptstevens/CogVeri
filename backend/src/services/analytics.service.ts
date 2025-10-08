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
   * Get task metrics
   */
  async getTaskMetrics(dateRange?: { start: Date; end: Date }): Promise<TaskMetrics> {
    try {
      const query = db('tasks');

      if (dateRange) {
        query.whereBetween('created_at', [dateRange.start, dateRange.end]);
      }

      const tasks = await query;

      // Calculate metrics
      const byStatus = tasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byPriority = tasks.reduce((acc, task) => {
        acc[task.priority] = (acc[task.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate average completion time (in hours)
      const completedTasks = tasks.filter(t => t.status === 'completed' && t.completed_at);
      const completionTimes = completedTasks.map(t => {
        const created = new Date(t.created_at).getTime();
        const completed = new Date(t.completed_at).getTime();
        return (completed - created) / (1000 * 60 * 60); // Convert to hours
      });

      const averageCompletionTime = completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;

      // Calculate overdue tasks
      const now = new Date();
      const overdueCount = tasks.filter(t =>
        t.status !== 'completed' &&
        t.due_date &&
        new Date(t.due_date) < now
      ).length;

      // Calculate on-time completion
      const completedOnTime = completedTasks.filter(t =>
        t.due_date &&
        new Date(t.completed_at) <= new Date(t.due_date)
      ).length;

      const completionRate = tasks.length > 0
        ? (completedTasks.length / tasks.length) * 100
        : 0;

      return {
        total: tasks.length,
        byStatus,
        byPriority,
        averageCompletionTime: Math.round(averageCompletionTime * 10) / 10,
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
   * Get recording metrics
   */
  async getRecordingMetrics(dateRange?: { start: Date; end: Date }): Promise<RecordingMetrics> {
    try {
      const query = db('recordings');

      if (dateRange) {
        query.whereBetween('created_at', [dateRange.start, dateRange.end]);
      }

      const recordings = await query;

      // Calculate metrics
      const byType = recordings.reduce((acc, rec) => {
        acc[rec.type] = (acc[rec.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalDuration = recordings.reduce((sum, rec) =>
        sum + (rec.duration_seconds || 0), 0
      );

      const averageDuration = recordings.length > 0
        ? totalDuration / recordings.length
        : 0;

      // Calculate storage used (in MB)
      const storageUsed = recordings.reduce((sum, rec) => {
        const bytes = parseInt(rec.file_size_bytes || '0');
        return sum + (bytes / (1024 * 1024));
      }, 0);

      // This week's recordings
      const weekStart = startOfWeek(new Date());
      const thisWeek = recordings.filter(r =>
        new Date(r.created_at) >= weekStart
      ).length;

      // This month's recordings
      const monthStart = startOfMonth(new Date());
      const thisMonth = recordings.filter(r =>
        new Date(r.created_at) >= monthStart
      ).length;

      return {
        total: recordings.length,
        totalDuration,
        averageDuration: Math.round(averageDuration),
        byType,
        storageUsed: Math.round(storageUsed * 10) / 10,
        thisWeek,
        thisMonth,
      };
    } catch (error) {
      logger.error('Error getting recording metrics:', error);
      throw error;
    }
  }

  /**
   * Get user metrics
   */
  async getUserMetrics(): Promise<UserMetrics> {
    try {
      const users = await db('users').select('*');

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
      const userActivity = await db('users')
        .leftJoin(
          db('tasks')
            .select('created_by')
            .count('* as tasks_completed')
            .where('status', 'completed')
            .groupBy('created_by')
            .as('task_counts'),
          'users.id',
          'task_counts.created_by'
        )
        .leftJoin(
          db('recordings')
            .select('user_id')
            .count('* as recordings_created')
            .groupBy('user_id')
            .as('recording_counts'),
          'users.id',
          'recording_counts.user_id'
        )
        .select(
          'users.id',
          'users.name',
          'users.email',
          db.raw('COALESCE(task_counts.tasks_completed, 0) as tasks_completed'),
          db.raw('COALESCE(recording_counts.recordings_created, 0) as recordings_created')
        )
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
   */
  async getReviewMetrics(): Promise<ReviewMetrics> {
    try {
      const reviews = await db('reviews').select('*');

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
      const reviewerPerformance = await db('reviews')
        .join('users', 'reviews.reviewer_id', 'users.id')
        .select(
          'reviews.reviewer_id',
          'users.name as reviewer_name',
          db.raw('COUNT(*) as reviews_completed'),
          db.raw('AVG(EXTRACT(EPOCH FROM (reviews.updated_at - reviews.created_at)) / 3600) as average_time')
        )
        .whereIn('reviews.status', ['approved', 'rejected'])
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
      const apiCallsToday = Number(apiCallsResult[0].count);

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
   */
  async getTrendData(days: number = 30): Promise<{
    tasksOverTime: TimeSeriesData[];
    recordingsOverTime: TimeSeriesData[];
    usersOverTime: TimeSeriesData[];
  }> {
    try {
      const dates = [];
      const now = new Date();

      for (let i = days - 1; i >= 0; i--) {
        dates.push(subDays(now, i));
      }

      // Get tasks created per day
      const tasksOverTime = await Promise.all(
        dates.map(async (date) => {
          const start = startOfDay(date);
          const end = endOfDay(date);
          const result = await db('tasks')
            .whereBetween('created_at', [start, end])
            .count('* as count');
          return {
            date: date.toISOString().split('T')[0],
            value: Number(result[0].count),
          };
        })
      );

      // Get recordings created per day
      const recordingsOverTime = await Promise.all(
        dates.map(async (date) => {
          const start = startOfDay(date);
          const end = endOfDay(date);
          const result = await db('recordings')
            .whereBetween('created_at', [start, end])
            .count('* as count');
          return {
            date: date.toISOString().split('T')[0],
            value: Number(result[0].count),
          };
        })
      );

      // Get users registered per day
      const usersOverTime = await Promise.all(
        dates.map(async (date) => {
          const start = startOfDay(date);
          const end = endOfDay(date);
          const result = await db('users')
            .whereBetween('created_at', [start, end])
            .count('* as count');
          return {
            date: date.toISOString().split('T')[0],
            value: Number(result[0].count),
          };
        })
      );

      return {
        tasksOverTime,
        recordingsOverTime,
        usersOverTime,
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
   */
  async getDashboardData(dateRange?: { start: Date; end: Date }): Promise<DashboardData> {
    try {
      const [tasks, recordings, users, reviews, system, trends] = await Promise.all([
        this.getTaskMetrics(dateRange),
        this.getRecordingMetrics(dateRange),
        this.getUserMetrics(),
        this.getReviewMetrics(),
        this.getSystemMetrics(),
        this.getTrendData(),
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
   */
  async generateReport(
    reportType: 'daily' | 'weekly' | 'monthly',
    format: 'json' | 'csv' = 'json'
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

      const data = await this.getDashboardData(dateRange);

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
    lines.push('Relay Analytics Report');
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