/**
 * Batch Loading Utilities
 * Helps prevent N+1 query patterns by loading related data in batches
 */

import { db } from '../config/database';

/**
 * Load multiple records by IDs in a single query
 */
export async function batchLoadByIds<T>(
  table: string,
  ids: string[],
  idColumn = 'id'
): Promise<Map<string, T>> {
  if (ids.length === 0) {
    return new Map();
  }

  const uniqueIds = [...new Set(ids)];
  const records = await db(table).whereIn(idColumn, uniqueIds);

  const map = new Map<string, T>();
  for (const record of records) {
    map.set(record[idColumn], record as T);
  }

  return map;
}

/**
 * Load related records grouped by a foreign key
 * Example: Load all step_scores for multiple analysis_jobs
 */
export async function batchLoadRelated<T>(
  table: string,
  foreignKey: string,
  foreignKeyValues: string[],
  orderBy?: { column: string; direction: 'asc' | 'desc' }
): Promise<Map<string, T[]>> {
  if (foreignKeyValues.length === 0) {
    return new Map();
  }

  const uniqueValues = [...new Set(foreignKeyValues)];
  let query = db(table).whereIn(foreignKey, uniqueValues);

  if (orderBy) {
    query = query.orderBy(orderBy.column, orderBy.direction);
  }

  const records = await query;

  const map = new Map<string, T[]>();
  for (const record of records) {
    const key = record[foreignKey];
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(record as T);
  }

  return map;
}

/**
 * Analysis-specific batch loader
 * Fetches recording with all related data in optimized queries
 */
export async function loadRecordingWithAnalysis(
  recordingId: string,
  organizationId: string
): Promise<{
  recording: any;
  task: any | null;
  template: any | null;
  analysisJob: any | null;
  analysisResults: any | null;
  stepScores: any[];
} | null> {
  // Single query with JOINs to get recording, task, and template
  const recordingData = await db('recordings as r')
    .leftJoin('tasks as t', 'r.task_id', 't.id')
    .leftJoin('task_templates as tt', 't.template_id', 'tt.id')
    .select(
      'r.*',
      't.id as task_id',
      't.title as task_title',
      't.template_id',
      'tt.id as template_id',
      'tt.evaluation_criteria as template_evaluation_criteria'
    )
    .where('r.id', recordingId)
    .where('r.organization_id', organizationId)
    .first();

  if (!recordingData) {
    return null;
  }

  // Separate the joined data
  const recording = {
    ...recordingData,
    task_title: undefined,
    template_id: undefined,
    template_evaluation_criteria: undefined,
  };
  delete recording.task_title;
  delete recording.template_id;
  delete recording.template_evaluation_criteria;

  const task = recordingData.task_id
    ? {
        id: recordingData.task_id,
        title: recordingData.task_title,
        template_id: recordingData.template_id,
      }
    : null;

  const template = recordingData.template_id
    ? {
        id: recordingData.template_id,
        evaluation_criteria: recordingData.template_evaluation_criteria,
      }
    : null;

  // Get latest analysis job with results in one query using JOIN
  const analysisData = await db('analysis_jobs as aj')
    .leftJoin('analysis_results as ar', 'aj.id', 'ar.analysis_job_id')
    .select('aj.*', 'ar.id as result_id', 'ar.*')
    .where('aj.recording_id', recordingId)
    .orderBy('aj.created_at', 'desc')
    .first();

  const analysisJob = analysisData
    ? {
        id: analysisData.id,
        recording_id: analysisData.recording_id,
        task_id: analysisData.task_id,
        organization_id: analysisData.organization_id,
        status: analysisData.status,
        progress: analysisData.progress,
        stage: analysisData.stage,
        started_at: analysisData.started_at,
        completed_at: analysisData.completed_at,
        error_message: analysisData.error_message,
        ai_tokens_used: analysisData.ai_tokens_used,
        estimated_cost_usd: analysisData.estimated_cost_usd,
        config_snapshot: analysisData.config_snapshot,
      }
    : null;

  const analysisResults = analysisData?.result_id
    ? {
        id: analysisData.result_id,
        analysis_job_id: analysisData.id,
        recording_id: analysisData.recording_id,
        overall_score: analysisData.overall_score,
        overall_verdict: analysisData.overall_verdict,
        overall_confidence: analysisData.overall_confidence,
        steps_passed: analysisData.steps_passed,
        steps_partial: analysisData.steps_partial,
        steps_failed: analysisData.steps_failed,
        steps_total: analysisData.steps_total,
        summary_text: analysisData.summary_text,
        strengths: analysisData.strengths,
        improvements: analysisData.improvements,
      }
    : null;

  // Get step scores only if we have an analysis job
  const stepScores = analysisJob
    ? await db('analysis_step_scores')
        .where('analysis_job_id', analysisJob.id)
        .orderBy('step_order', 'asc')
    : [];

  return {
    recording,
    task,
    template,
    analysisJob,
    analysisResults,
    stepScores,
  };
}

/**
 * Batch load recordings with their latest analysis status
 * Useful for listing recordings with analysis info
 */
export async function loadRecordingsWithAnalysisStatus(recordingIds: string[]): Promise<
  Map<
    string,
    {
      analysisStatus: string | null;
      analysisScore: number | null;
      analysisVerdict: string | null;
    }
  >
> {
  if (recordingIds.length === 0) {
    return new Map();
  }

  // Get latest analysis job for each recording using a subquery
  const latestJobs = await db('analysis_jobs as aj')
    .select(
      'aj.recording_id',
      'aj.status',
      db.raw(`
        (SELECT ar.overall_score
         FROM analysis_results ar
         WHERE ar.analysis_job_id = aj.id
         LIMIT 1) as overall_score
      `),
      db.raw(`
        (SELECT ar.overall_verdict
         FROM analysis_results ar
         WHERE ar.analysis_job_id = aj.id
         LIMIT 1) as overall_verdict
      `)
    )
    .whereIn('aj.recording_id', recordingIds)
    .whereIn(
      'aj.id',
      db('analysis_jobs')
        .select(db.raw('MAX(id)'))
        .whereIn('recording_id', recordingIds)
        .groupBy('recording_id')
    );

  const map = new Map();
  for (const job of latestJobs) {
    map.set(job.recording_id, {
      analysisStatus: job.status,
      analysisScore: job.overall_score,
      analysisVerdict: job.overall_verdict,
    });
  }

  // Add null entries for recordings without analysis
  for (const id of recordingIds) {
    if (!map.has(id)) {
      map.set(id, {
        analysisStatus: null,
        analysisScore: null,
        analysisVerdict: null,
      });
    }
  }

  return map;
}

/**
 * Load tasks with their templates in a single query
 */
export async function loadTasksWithTemplates(
  taskIds: string[]
): Promise<Map<string, { task: any; template: any | null }>> {
  if (taskIds.length === 0) {
    return new Map();
  }

  const tasksData = await db('tasks as t')
    .leftJoin('task_templates as tt', 't.template_id', 'tt.id')
    .select('t.*', 'tt.id as template_id', 'tt.name as template_name', 'tt.evaluation_criteria')
    .whereIn('t.id', taskIds);

  const map = new Map();
  for (const data of tasksData) {
    const task = { ...data };
    delete task.template_id;
    delete task.template_name;
    delete task.evaluation_criteria;

    const template = data.template_id
      ? {
          id: data.template_id,
          name: data.template_name,
          evaluation_criteria: data.evaluation_criteria,
        }
      : null;

    map.set(data.id, { task, template });
  }

  return map;
}
