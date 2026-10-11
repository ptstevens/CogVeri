import { db } from '../config/database';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import {
  S3Client as _S3Client,
  ListObjectsV2Command as _ListObjectsV2Command,
} from '@aws-sdk/client-s3';

/**
 * Observability Service
 *
 * Provides comprehensive metrics for monitoring the CogVeri platform:
 * - Active users and session tracking
 * - Recording counts and storage usage
 * - Queue metrics for job processing
 * - System metrics (memory, response times)
 *
 * SLO Targets:
 * - Metrics collection: < 1s latency
 * - Data freshness: < 60s staleness
 */

// Metric types
interface UserMetrics {
  totalUsers: number;
  activeUsersToday: number;
  activeUsersWeek: number;
  activeUsersMonth: number;
  newUsersToday: number;
  newUsersWeek: number;
  usersByRole: Record<string, number>;
}

interface RecordingMetrics {
  totalRecordings: number;
  recordingsToday: number;
  recordingsWeek: number;
  recordingsMonth: number;
  averageRecordingSize: number;
  totalStorageBytes: number;
  recordingsByStatus: Record<string, number>;
}

interface TaskMetrics {
  totalTasks: number;
  tasksToday: number;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
  averageTaskDuration: number;
  overdueTasksCount: number;
}

interface QueueMetrics {
  pendingJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  jobsByType: Record<string, number>;
  retryCount: number;
}

interface SystemMetrics {
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentUsed: number;
  };
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  responseTimeP50: number;
  responseTimeP95: number;
  responseTimeP99: number;
  requestsPerMinute: number;
  errorRate: number;
}

interface OrganizationMetrics {
  totalOrganizations: number;
  activeOrganizations: number;
  organizationsByTier: Record<string, number>;
  averageUsersPerOrg: number;
  averageStoragePerOrg: number;
}

interface DashboardMetrics {
  timestamp: string;
  users: UserMetrics;
  recordings: RecordingMetrics;
  tasks: TaskMetrics;
  queue: QueueMetrics;
  system: SystemMetrics;
  organizations: OrganizationMetrics;
}

class ObservabilityService {
  private metricsCache: DashboardMetrics | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  /**
   * Get all dashboard metrics
   */
  async getDashboardMetrics(forceRefresh = false): Promise<DashboardMetrics> {
    // Return cached metrics if still valid
    if (
      !forceRefresh &&
      this.metricsCache &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS
    ) {
      return this.metricsCache;
    }

    try {
      // Collect all metrics in parallel
      const [users, recordings, tasks, queue, system, organizations] = await Promise.all([
        this.getUserMetrics(),
        this.getRecordingMetrics(),
        this.getTaskMetrics(),
        this.getQueueMetrics(),
        this.getSystemMetrics(),
        this.getOrganizationMetrics(),
      ]);

      const metrics: DashboardMetrics = {
        timestamp: new Date().toISOString(),
        users,
        recordings,
        tasks,
        queue,
        system,
        organizations,
      };

      // Cache the results
      this.metricsCache = metrics;
      this.cacheTimestamp = Date.now();

      return metrics;
    } catch (error) {
      logger.error('Error collecting dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Get user-related metrics
   */
  async getUserMetrics(): Promise<UserMetrics> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Execute queries in parallel
      const [
        totalResult,
        activeTodayResult,
        activeWeekResult,
        activeMonthResult,
        newTodayResult,
        newWeekResult,
        roleResults,
      ] = await Promise.all([
        db('users').count('id as count').first(),
        db('users').where('last_login_at', '>=', today).count('id as count').first(),
        db('users').where('last_login_at', '>=', weekAgo).count('id as count').first(),
        db('users').where('last_login_at', '>=', monthAgo).count('id as count').first(),
        db('users').where('created_at', '>=', today).count('id as count').first(),
        db('users').where('created_at', '>=', weekAgo).count('id as count').first(),
        db('users').select('role').count('id as count').groupBy('role'),
      ]);

      const usersByRole: Record<string, number> = {};
      roleResults.forEach((row: any) => {
        usersByRole[row.role || 'unknown'] = parseInt(row.count, 10);
      });

      return {
        totalUsers: parseInt((totalResult as any)?.count || 0, 10),
        activeUsersToday: parseInt((activeTodayResult as any)?.count || 0, 10),
        activeUsersWeek: parseInt((activeWeekResult as any)?.count || 0, 10),
        activeUsersMonth: parseInt((activeMonthResult as any)?.count || 0, 10),
        newUsersToday: parseInt((newTodayResult as any)?.count || 0, 10),
        newUsersWeek: parseInt((newWeekResult as any)?.count || 0, 10),
        usersByRole,
      };
    } catch (error) {
      logger.error('Error getting user metrics:', error);
      return {
        totalUsers: 0,
        activeUsersToday: 0,
        activeUsersWeek: 0,
        activeUsersMonth: 0,
        newUsersToday: 0,
        newUsersWeek: 0,
        usersByRole: {},
      };
    }
  }

  /**
   * Get recording-related metrics
   */
  async getRecordingMetrics(): Promise<RecordingMetrics> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalResult,
        todayResult,
        weekResult,
        monthResult,
        avgSizeResult,
        totalStorageResult,
        statusResults,
      ] = await Promise.all([
        db('recordings').count('id as count').first(),
        db('recordings').where('created_at', '>=', today).count('id as count').first(),
        db('recordings').where('created_at', '>=', weekAgo).count('id as count').first(),
        db('recordings').where('created_at', '>=', monthAgo).count('id as count').first(),
        db('recording_file_sizes').avg('file_size_bytes as avg').first(),
        db('recording_file_sizes').sum('file_size_bytes as total').first(),
        db('recordings').select('status').count('id as count').groupBy('status'),
      ]);

      const recordingsByStatus: Record<string, number> = {};
      statusResults.forEach((row: any) => {
        recordingsByStatus[row.status || 'unknown'] = parseInt(row.count, 10);
      });

      return {
        totalRecordings: parseInt((totalResult as any)?.count || 0, 10),
        recordingsToday: parseInt((todayResult as any)?.count || 0, 10),
        recordingsWeek: parseInt((weekResult as any)?.count || 0, 10),
        recordingsMonth: parseInt((monthResult as any)?.count || 0, 10),
        averageRecordingSize: parseFloat((avgSizeResult as any)?.avg || 0),
        totalStorageBytes: parseInt((totalStorageResult as any)?.total || 0, 10),
        recordingsByStatus,
      };
    } catch (error) {
      logger.error('Error getting recording metrics:', error);
      return {
        totalRecordings: 0,
        recordingsToday: 0,
        recordingsWeek: 0,
        recordingsMonth: 0,
        averageRecordingSize: 0,
        totalStorageBytes: 0,
        recordingsByStatus: {},
      };
    }
  }

  /**
   * Get task-related metrics
   */
  async getTaskMetrics(): Promise<TaskMetrics> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [
        totalResult,
        todayResult,
        statusResults,
        priorityResults,
        avgDurationResult,
        overdueResult,
      ] = await Promise.all([
        db('tasks').count('id as count').first(),
        db('tasks').where('created_at', '>=', today).count('id as count').first(),
        db('tasks').select('status').count('id as count').groupBy('status'),
        db('tasks').select('priority').count('id as count').groupBy('priority'),
        db('tasks')
          .whereNotNull('completed_at')
          .select(db.raw('AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration'))
          .first(),
        db('tasks')
          .where('status', '!=', 'completed')
          .where('due_date', '<', now)
          .count('id as count')
          .first(),
      ]);

      const tasksByStatus: Record<string, number> = {};
      statusResults.forEach((row: any) => {
        tasksByStatus[row.status || 'unknown'] = parseInt(row.count, 10);
      });

      const tasksByPriority: Record<string, number> = {};
      priorityResults.forEach((row: any) => {
        tasksByPriority[row.priority || 'unknown'] = parseInt(row.count, 10);
      });

      return {
        totalTasks: parseInt((totalResult as any)?.count || 0, 10),
        tasksToday: parseInt((todayResult as any)?.count || 0, 10),
        tasksByStatus,
        tasksByPriority,
        averageTaskDuration: parseFloat(avgDurationResult?.avg_duration || 0),
        overdueTasksCount: parseInt((overdueResult as any)?.count || 0, 10),
      };
    } catch (error) {
      logger.error('Error getting task metrics:', error);
      return {
        totalTasks: 0,
        tasksToday: 0,
        tasksByStatus: {},
        tasksByPriority: {},
        averageTaskDuration: 0,
        overdueTasksCount: 0,
      };
    }
  }

  /**
   * Get queue-related metrics
   */
  async getQueueMetrics(): Promise<QueueMetrics> {
    try {
      const redis = getRedisClient();

      if (!redis) {
        return {
          pendingJobs: 0,
          activeJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          averageProcessingTime: 0,
          jobsByType: {},
          retryCount: 0,
        };
      }

      // Get queue stats from Redis (BullMQ pattern)
      const queues = ['video-processing', 'email', 'notifications', 'cleanup'];
      let pendingJobs = 0;
      let activeJobs = 0;
      let completedJobs = 0;
      let failedJobs = 0;
      const jobsByType: Record<string, number> = {};

      for (const queue of queues) {
        try {
          const waiting = await redis.llen(`bull:${queue}:wait`);
          const active = await redis.llen(`bull:${queue}:active`);
          const completed = (await redis.get(`bull:${queue}:completed`)) || '0';
          const failed = (await redis.get(`bull:${queue}:failed`)) || '0';

          pendingJobs += waiting;
          activeJobs += active;
          completedJobs += parseInt(completed, 10);
          failedJobs += parseInt(failed, 10);
          jobsByType[queue] = waiting + active;
        } catch (queueError) {
          // Queue might not exist, that's okay
          logger.debug(`Queue ${queue} not found:`, queueError);
        }
      }

      // Get average processing time from recent jobs
      let averageProcessingTime = 0;
      try {
        const recentJobTimes = await redis.lrange('metrics:job_processing_times', 0, 99);
        if (recentJobTimes.length > 0) {
          const times = recentJobTimes.map((t) => parseInt(t, 10));
          averageProcessingTime = times.reduce((a, b) => a + b, 0) / times.length;
        }
      } catch (timeError) {
        // Metrics might not be tracked yet
      }

      // Get retry count
      let retryCount = 0;
      try {
        const retries = (await redis.get('metrics:job_retries')) || '0';
        retryCount = parseInt(retries, 10);
      } catch (retryError) {
        // Metrics might not be tracked yet
      }

      return {
        pendingJobs,
        activeJobs,
        completedJobs,
        failedJobs,
        averageProcessingTime,
        jobsByType,
        retryCount,
      };
    } catch (error) {
      logger.error('Error getting queue metrics:', error);
      return {
        pendingJobs: 0,
        activeJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        averageProcessingTime: 0,
        jobsByType: {},
        retryCount: 0,
      };
    }
  }

  /**
   * Get system-related metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const uptime = process.uptime();

      // Calculate memory percentage
      const percentUsed = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      // Get response time percentiles from API metrics (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const [responseTimesResult, requestCountResult, errorCountResult] = await Promise.all([
        db('api_metrics')
          .where('created_at', '>=', oneHourAgo)
          .select('response_time_ms')
          .orderBy('response_time_ms'),
        db('api_metrics').where('created_at', '>=', oneHourAgo).count('id as count').first(),
        db('api_metrics')
          .where('created_at', '>=', oneHourAgo)
          .where('error', true)
          .count('id as count')
          .first(),
      ]);

      // Calculate percentiles
      const responseTimes = responseTimesResult.map((r: any) => r.response_time_ms);
      const responseTimeP50 = this.percentile(responseTimes, 50);
      const responseTimeP95 = this.percentile(responseTimes, 95);
      const responseTimeP99 = this.percentile(responseTimes, 99);

      // Calculate requests per minute
      const totalRequests = parseInt((requestCountResult as any)?.count || 0, 10);
      const requestsPerMinute = totalRequests / 60;

      // Calculate error rate
      const errorCount = parseInt((errorCountResult as any)?.count || 0, 10);
      const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

      return {
        memoryUsage: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
          percentUsed: Math.round(percentUsed * 100) / 100,
        },
        cpuUsage,
        uptime,
        responseTimeP50,
        responseTimeP95,
        responseTimeP99,
        requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Error getting system metrics:', error);
      const memoryUsage = process.memoryUsage();
      return {
        memoryUsage: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss,
          percentUsed: 0,
        },
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime(),
        responseTimeP50: 0,
        responseTimeP95: 0,
        responseTimeP99: 0,
        requestsPerMinute: 0,
        errorRate: 0,
      };
    }
  }

  /**
   * Get organization-related metrics
   */
  async getOrganizationMetrics(): Promise<OrganizationMetrics> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [totalResult, activeResult, tierResults, avgUsersResult, avgStorageResult] =
        await Promise.all([
          db('organizations').count('id as count').first(),
          db('organizations')
            .whereExists(function () {
              this.select('*')
                .from('users')
                .whereRaw('users.organization_id = organizations.id')
                .where('users.last_login_at', '>=', thirtyDaysAgo);
            })
            .count('id as count')
            .first(),
          db('organizations')
            .select('subscription_tier')
            .count('id as count')
            .groupBy('subscription_tier'),
          db('organizations')
            .select(db.raw('AVG(member_count) as avg'))
            .from(
              db('users')
                .select('organization_id')
                .count('id as member_count')
                .groupBy('organization_id')
                .as('user_counts')
            )
            .first(),
          db('storage_metrics').avg('total_bytes_used as avg').first(),
        ]);

      const organizationsByTier: Record<string, number> = {};
      tierResults.forEach((row: any) => {
        organizationsByTier[row.subscription_tier || 'free'] = parseInt(row.count, 10);
      });

      return {
        totalOrganizations: parseInt((totalResult as any)?.count || 0, 10),
        activeOrganizations: parseInt((activeResult as any)?.count || 0, 10),
        organizationsByTier,
        averageUsersPerOrg: parseFloat((avgUsersResult as any)?.avg || 0),
        averageStoragePerOrg: parseFloat((avgStorageResult as any)?.avg || 0),
      };
    } catch (error) {
      logger.error('Error getting organization metrics:', error);
      return {
        totalOrganizations: 0,
        activeOrganizations: 0,
        organizationsByTier: {},
        averageUsersPerOrg: 0,
        averageStoragePerOrg: 0,
      };
    }
  }

  /**
   * Record a response time for percentile calculations
   */
  async recordResponseTime(responseTimeMs: number): Promise<void> {
    try {
      const redis = getRedisClient();
      if (redis) {
        // Keep last 1000 response times for percentile calculation
        await redis.lpush('metrics:response_times', responseTimeMs.toString());
        await redis.ltrim('metrics:response_times', 0, 999);
      }
    } catch (error) {
      // Non-blocking error
      logger.debug('Error recording response time:', error);
    }
  }

  /**
   * Record a job processing time
   */
  async recordJobProcessingTime(processingTimeMs: number): Promise<void> {
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.lpush('metrics:job_processing_times', processingTimeMs.toString());
        await redis.ltrim('metrics:job_processing_times', 0, 99);
      }
    } catch (error) {
      // Non-blocking error
      logger.debug('Error recording job processing time:', error);
    }
  }

  /**
   * Increment job retry counter
   */
  async incrementJobRetries(): Promise<void> {
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.incr('metrics:job_retries');
      }
    } catch (error) {
      // Non-blocking error
      logger.debug('Error incrementing job retries:', error);
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;

    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, Math.min(index, arr.length - 1))] ?? 0;
  }

  /**
   * Get metrics for Prometheus-style export
   */
  async getPrometheusMetrics(): Promise<string> {
    const metrics = await this.getDashboardMetrics();

    const lines: string[] = [
      '# HELP cogveri_users_total Total number of users',
      '# TYPE cogveri_users_total gauge',
      `cogveri_users_total ${metrics.users.totalUsers}`,

      '# HELP cogveri_users_active Active users',
      '# TYPE cogveri_users_active gauge',
      `cogveri_users_active{period="day"} ${metrics.users.activeUsersToday}`,
      `cogveri_users_active{period="week"} ${metrics.users.activeUsersWeek}`,
      `cogveri_users_active{period="month"} ${metrics.users.activeUsersMonth}`,

      '# HELP cogveri_recordings_total Total number of recordings',
      '# TYPE cogveri_recordings_total gauge',
      `cogveri_recordings_total ${metrics.recordings.totalRecordings}`,

      '# HELP cogveri_storage_bytes Total storage used in bytes',
      '# TYPE cogveri_storage_bytes gauge',
      `cogveri_storage_bytes ${metrics.recordings.totalStorageBytes}`,

      '# HELP cogveri_tasks_total Total number of tasks',
      '# TYPE cogveri_tasks_total gauge',
      `cogveri_tasks_total ${metrics.tasks.totalTasks}`,

      '# HELP cogveri_tasks_overdue Number of overdue tasks',
      '# TYPE cogveri_tasks_overdue gauge',
      `cogveri_tasks_overdue ${metrics.tasks.overdueTasksCount}`,

      '# HELP cogveri_queue_pending Pending jobs in queue',
      '# TYPE cogveri_queue_pending gauge',
      `cogveri_queue_pending ${metrics.queue.pendingJobs}`,

      '# HELP cogveri_queue_failed Failed jobs',
      '# TYPE cogveri_queue_failed counter',
      `cogveri_queue_failed ${metrics.queue.failedJobs}`,

      '# HELP cogveri_memory_usage_bytes Memory usage in bytes',
      '# TYPE cogveri_memory_usage_bytes gauge',
      `cogveri_memory_usage_bytes{type="heap_used"} ${metrics.system.memoryUsage.heapUsed}`,
      `cogveri_memory_usage_bytes{type="heap_total"} ${metrics.system.memoryUsage.heapTotal}`,
      `cogveri_memory_usage_bytes{type="rss"} ${metrics.system.memoryUsage.rss}`,

      '# HELP cogveri_response_time_ms Response time percentiles in milliseconds',
      '# TYPE cogveri_response_time_ms gauge',
      `cogveri_response_time_ms{quantile="0.5"} ${metrics.system.responseTimeP50}`,
      `cogveri_response_time_ms{quantile="0.95"} ${metrics.system.responseTimeP95}`,
      `cogveri_response_time_ms{quantile="0.99"} ${metrics.system.responseTimeP99}`,

      '# HELP cogveri_error_rate_percent Error rate percentage',
      '# TYPE cogveri_error_rate_percent gauge',
      `cogveri_error_rate_percent ${metrics.system.errorRate}`,

      '# HELP cogveri_uptime_seconds Application uptime in seconds',
      '# TYPE cogveri_uptime_seconds counter',
      `cogveri_uptime_seconds ${metrics.system.uptime}`,
    ];

    return lines.join('\n');
  }
}

export default new ObservabilityService();
