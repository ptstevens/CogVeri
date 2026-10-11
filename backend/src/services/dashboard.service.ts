import { db } from '../config/database';
import { logger } from '../utils/logger';
import { cacheService } from './cache.service';
import {
  CohortTaskRow,
  CohortTopPerformerRow,
  CohortLeaderboardRow,
  ExportDataRow,
} from '../types/db-rows';

// ─── Cohort Benchmarking Types ────────────────────────────────────────────────

export interface CohortStats {
  org_summary: {
    total_analyses: number;
    avg_score: number;
    pass_rate: number;
    partial_rate: number;
    fail_rate: number;
  };
  by_task: Array<{
    task_id: string;
    task_title: string;
    analysis_count: number;
    avg_score: number;
    pass_rate: number;
    score_distribution: { range: string; count: number }[];
    top_performers: Array<{ name: string; score: number }>;
  }>;
  leaderboard: Array<{
    user_id: string;
    name: string;
    avg_score: number;
    analyses_count: number;
    pass_rate: number;
  }>;
}

// ─── CSV Export Types ─────────────────────────────────────────────────────────

export interface ExportRow {
  task_title: string;
  task_status: string;
  assignee_name: string;
  assignee_email: string;
  recording_duration_seconds: number | null;
  analysis_score: number | null;
  analysis_verdict: string | null;
  steps_passed: number | null;
  steps_total: number | null;
  submitted_at: string | null;
  completed_at: string | null;
  task_created_at: string;
}

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
  recent_activity: Array<{
    id: string;
    type: string;
    description: string;
    user_name?: string;
    created_at: Date;
    metadata?: Record<string, unknown>;
  }>;
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
        throw new BadRequestError(
          'Organization ID is required. Please join or create an organization first.'
        );
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
      const taskAggregates = await db('tasks')
        .where('organization_id', organizationId)
        .where(function () {
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
          db.raw('count(case when archived = true then 1 end) as archived'),
          db.raw(
            `count(case when due_date < ? and status in ('assigned', 'in_progress', 'submitted') then 1 end) as overdue`,
            [now]
          ),
          db.raw(
            `count(case when assigned_to = ? and status = 'completed' and updated_at >= ? then 1 end) as completed_this_week`,
            [userId, weekAgo]
          ),
          db.raw(
            `count(case when assigned_to = ? and status = 'completed' and updated_at >= ? then 1 end) as completed_this_month`,
            [userId, monthAgo]
          )
        )
        .first();

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
      const recordingAggregates = await db('recordings')
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
        .first();

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
        .where(function () {
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

  async getManagerDashboardStats(
    _managerId: string,
    _organizationId?: string
  ): Promise<{
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

  async getTaskStatistics(
    _filters: { period?: string },
    organizationId?: string
  ): Promise<{
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

  // ─── Cohort Benchmarking ──────────────────────────────────────────────────────

  async getCohortStats(organizationId: string): Promise<CohortStats> {
    const cacheKey = `dashboard:cohort:${organizationId}`;
    const cached = await cacheService.get<CohortStats>(cacheKey);
    if (cached) return cached;

    // Org-level summary
    const orgSummary = await db('analysis_results as ar')
      .join('analysis_jobs as aj', 'ar.analysis_job_id', 'aj.id')
      .where('aj.organization_id', organizationId)
      .where('aj.status', 'completed')
      .select(
        db.raw('count(*) as total_analyses'),
        db.raw('round(avg(ar.overall_score)::numeric, 1) as avg_score'),
        db.raw(
          "round(100.0 * count(*) filter (where ar.overall_verdict = 'PASS') / nullif(count(*),0), 1) as pass_rate"
        ),
        db.raw(
          "round(100.0 * count(*) filter (where ar.overall_verdict = 'PARTIAL_PASS') / nullif(count(*),0), 1) as partial_rate"
        ),
        db.raw(
          "round(100.0 * count(*) filter (where ar.overall_verdict = 'FAIL') / nullif(count(*),0), 1) as fail_rate"
        )
      )
      .first();

    // Per-task breakdown
    const taskRows = await db('analysis_results as ar')
      .join('analysis_jobs as aj', 'ar.analysis_job_id', 'aj.id')
      .join('tasks as t', 'ar.task_id', 't.id')
      .where('aj.organization_id', organizationId)
      .where('aj.status', 'completed')
      .whereNotNull('ar.task_id')
      .select(
        't.id as task_id',
        't.title as task_title',
        db.raw('count(*) as analysis_count'),
        db.raw('round(avg(ar.overall_score)::numeric, 1) as avg_score'),
        db.raw(
          "round(100.0 * count(*) filter (where ar.overall_verdict = 'PASS') / nullif(count(*),0), 1) as pass_rate"
        ),
        db.raw('count(*) filter (where ar.overall_score >= 80) as score_80_plus'),
        db.raw(
          'count(*) filter (where ar.overall_score >= 60 and ar.overall_score < 80) as score_60_79'
        ),
        db.raw(
          'count(*) filter (where ar.overall_score >= 40 and ar.overall_score < 60) as score_40_59'
        ),
        db.raw('count(*) filter (where ar.overall_score < 40) as score_below_40')
      )
      .groupBy('t.id', 't.title')
      .orderBy('analysis_count', 'desc')
      .limit(10);

    // Top performers per task — get top 3 scorers per task
    const topPerformerRows = await db('analysis_results as ar')
      .join('analysis_jobs as aj', 'ar.analysis_job_id', 'aj.id')
      .join('recordings as r', 'ar.recording_id', 'r.id')
      .join('users as u', 'r.user_id', 'u.id')
      .where('aj.organization_id', organizationId)
      .where('aj.status', 'completed')
      .whereNotNull('ar.task_id')
      .whereNotNull('r.user_id')
      .select('ar.task_id', 'u.name', 'ar.overall_score')
      .orderBy('ar.overall_score', 'desc');

    // Leaderboard (top 10 users by avg score, min 2 analyses)
    const leaderboard = await db('analysis_results as ar')
      .join('analysis_jobs as aj', 'ar.analysis_job_id', 'aj.id')
      .join('recordings as r', 'ar.recording_id', 'r.id')
      .join('users as u', 'r.user_id', 'u.id')
      .where('aj.organization_id', organizationId)
      .where('aj.status', 'completed')
      .whereNotNull('r.user_id')
      .select(
        'u.id as user_id',
        'u.name',
        db.raw('count(*) as analyses_count'),
        db.raw('round(avg(ar.overall_score)::numeric, 1) as avg_score'),
        db.raw(
          "round(100.0 * count(*) filter (where ar.overall_verdict = 'PASS') / nullif(count(*),0), 1) as pass_rate"
        )
      )
      .groupBy('u.id', 'u.name')
      .having(db.raw('count(*) >= 2'))
      .orderBy('avg_score', 'desc')
      .limit(10);

    // Assemble by_task with top performers
    const byTask = taskRows.map((row: CohortTaskRow) => {
      const taskTopPerformers = topPerformerRows
        .filter((p: CohortTopPerformerRow) => p.task_id === row.task_id)
        .slice(0, 3)
        .map((p: CohortTopPerformerRow) => ({ name: p.name, score: parseFloat(p.overall_score) }));

      return {
        task_id: row.task_id,
        task_title: row.task_title,
        analysis_count: parseInt(row.analysis_count),
        avg_score: parseFloat(row.avg_score) || 0,
        pass_rate: parseFloat(row.pass_rate) || 0,
        score_distribution: [
          { range: '80-100', count: parseInt(row.score_80_plus) || 0 },
          { range: '60-79', count: parseInt(row.score_60_79) || 0 },
          { range: '40-59', count: parseInt(row.score_40_59) || 0 },
          { range: '0-39', count: parseInt(row.score_below_40) || 0 },
        ],
        top_performers: taskTopPerformers,
      };
    });

    const result: CohortStats = {
      org_summary: {
        total_analyses: parseInt(orgSummary?.total_analyses) || 0,
        avg_score: parseFloat(orgSummary?.avg_score) || 0,
        pass_rate: parseFloat(orgSummary?.pass_rate) || 0,
        partial_rate: parseFloat(orgSummary?.partial_rate) || 0,
        fail_rate: parseFloat(orgSummary?.fail_rate) || 0,
      },
      by_task: byTask,
      leaderboard: leaderboard.map((r: CohortLeaderboardRow) => ({
        user_id: r.user_id,
        name: r.name,
        avg_score: parseFloat(r.avg_score) || 0,
        analyses_count: parseInt(r.analyses_count) || 0,
        pass_rate: parseFloat(r.pass_rate) || 0,
      })),
    };

    await cacheService.set(cacheKey, result, 300); // 5 min cache
    return result;
  }

  // ─── Org-Wide CSV Export ──────────────────────────────────────────────────────

  async exportOrgData(organizationId: string, periodDays: number = 90): Promise<string> {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const rows = await db('tasks as t')
      .where('t.organization_id', organizationId)
      .where('t.created_at', '>=', since)
      .leftJoin('users as assignee', 't.assigned_to', 'assignee.id')
      .leftJoin('recordings as rec', function () {
        this.on('rec.task_id', 't.id').andOn('rec.organization_id', db.raw('?', [organizationId]));
      })
      .leftJoin('analysis_jobs as aj', function () {
        this.on('aj.recording_id', 'rec.id').andOn('aj.status', db.raw("'completed'"));
      })
      .leftJoin('analysis_results as ar', 'ar.analysis_job_id', 'aj.id')
      .select(
        't.title as task_title',
        't.status as task_status',
        't.created_at as task_created_at',
        't.submitted_at',
        't.completed_at',
        db.raw("coalesce(assignee.name, t.claim_name, 'Unassigned') as assignee_name"),
        db.raw("coalesce(assignee.email, t.claim_email, '') as assignee_email"),
        'rec.duration_seconds as recording_duration_seconds',
        'ar.overall_score as analysis_score',
        'ar.overall_verdict as analysis_verdict',
        'ar.steps_passed',
        'ar.steps_total'
      )
      .orderBy('t.created_at', 'desc');

    // Build CSV
    const headers = [
      'Task Title',
      'Status',
      'Assignee Name',
      'Assignee Email',
      'Recording Duration (s)',
      'Analysis Score (%)',
      'Verdict',
      'Steps Passed',
      'Steps Total',
      'Submitted At',
      'Completed At',
      'Created At',
    ];

    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = [
      headers.join(','),
      ...rows.map((r: ExportDataRow) =>
        [
          r.task_title,
          r.task_status,
          r.assignee_name,
          r.assignee_email,
          r.recording_duration_seconds,
          r.analysis_score !== null ? parseFloat(r.analysis_score).toFixed(1) : '',
          r.analysis_verdict,
          r.steps_passed,
          r.steps_total,
          r.submitted_at ? new Date(r.submitted_at).toISOString() : '',
          r.completed_at ? new Date(r.completed_at).toISOString() : '',
          new Date(r.task_created_at).toISOString(),
        ]
          .map(escape)
          .join(',')
      ),
    ];

    return csvRows.join('\n');
  }
}

export const dashboardService = new DashboardService();
