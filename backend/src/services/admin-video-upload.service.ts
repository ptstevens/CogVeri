/**
 * Admin Video Upload Service
 *
 * Business logic for sysadmin video upload feature.
 * Allows sysadmins to upload videos directly to tasks, bypassing the normal recording flow.
 * Used for faster testing/iteration during development.
 */

import { db } from '../config/database';
import recordingService from './recording.service';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../utils/AppError';
import { logAuditAction, AuditActionType, AuditResourceType } from '../utils/audit-logger';

// Multer file interface (matching recording.service.ts)
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

// Task statuses that are eligible for sysadmin video upload
const ELIGIBLE_TASK_STATUSES = ['assigned', 'in_progress', 'rejected'];

/**
 * Escape special characters in LIKE patterns to prevent SQL injection via wildcards
 * Characters: % _ \ are escaped with backslash
 */
function escapeLikePattern(pattern: string): string {
  return pattern
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/%/g, '\\%')     // Escape percent
    .replace(/_/g, '\\_');    // Escape underscore
}

// Database row types for type-safe queries
interface TaskQueryRow {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  organization_id: string;
  organization_name: string;
  template_title: string | null;
  created_at: string;
  has_recording?: boolean;
  recording_status?: string | null;
  org_slug?: string;
}

interface RecordingRow {
  id: string;
  status: string;
  created_at: string;
  file_size_bytes: string | null;
}

interface CountRow {
  count: string | number;
}

export interface EligibleTask {
  id: string;
  title: string;
  status: string;
  assignee_email: string | null;
  assignee_name: string | null;
  organization_id: string;
  organization_name: string;
  template_title: string | null;
  created_at: string;
  has_recording: boolean;
  recording_status: string | null;
}

export interface TaskUploadDetails {
  id: string;
  title: string;
  status: string;
  description: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  organization_id: string;
  organization_name: string;
  template_title: string | null;
  created_at: string;
  has_recording: boolean;
  existing_recording: {
    id: string;
    status: string;
    created_at: string;
    file_size_bytes: string | null;
  } | null;
}

export interface UploadResult {
  recordingId: string;
  taskId: string;
  taskStatus: string;
  message: string;
}

class AdminVideoUploadService {
  /**
   * Get eligible tasks for video upload (filtered by organization)
   * Only tasks with status: assigned, in_progress, or rejected
   */
  async getEligibleTasks(
    organizationId: string,
    sysadminUserId: string,
    search?: string,
    page: number = 0,
    limit: number = 25
  ): Promise<{ tasks: EligibleTask[]; total: number }> {
    // Audit log: sysadmin accessing organization task data
    await logAuditAction({
      organizationId,
      actorId: sysadminUserId,
      action: AuditActionType.SYSADMIN_TASK_DATA_ACCESS,
      resourceType: AuditResourceType.ORGANIZATION,
      resourceId: organizationId,
      status: 'success',
      metadata: {
        search: search || null,
        page,
        limit,
        context: 'admin_video_upload_task_list',
      },
    });
    // Build base query with joins and filters (no SELECT yet)
    const baseQuery = () => {
      let q = db('tasks as t')
        .join('organizations as o', 't.organization_id', 'o.id')
        .leftJoin('users as u', 't.assigned_to', 'u.id')
        .leftJoin('task_templates as tt', 't.template_id', 'tt.id')
        .whereIn('t.status', ELIGIBLE_TASK_STATUSES)
        .where('t.organization_id', organizationId);

      // Apply search filter with escaped LIKE pattern
      if (search && search.trim()) {
        const escapedSearch = escapeLikePattern(search.trim().toLowerCase());
        const searchTerm = `%${escapedSearch}%`;
        q = q.where(function () {
          this.whereRaw('LOWER(t.title) LIKE ?', [searchTerm])
            .orWhereRaw('LOWER(u.email) LIKE ?', [searchTerm])
            .orWhereRaw('LOWER(u.name) LIKE ?', [searchTerm]);
        });
      }

      return q;
    };

    // Get total count (separate query without SELECT columns)
    const countResult = await baseQuery().count<CountRow[]>('t.id as count').first();
    const total = Number(countResult?.count || 0);

    // Get paginated results with full SELECT
    const tasks = await baseQuery()
      .select<TaskQueryRow[]>(
        't.id',
        't.title',
        't.status',
        'u.email as assignee_email',
        'u.name as assignee_name',
        't.organization_id',
        'o.name as organization_name',
        'tt.title as template_title',
        't.created_at',
        db.raw(`
          EXISTS (
            SELECT 1 FROM recordings r
            WHERE r.task_id = t.id
          ) as has_recording
        `),
        db.raw(`
          (
            SELECT r.status FROM recordings r
            WHERE r.task_id = t.id
            ORDER BY r.created_at DESC
            LIMIT 1
          ) as recording_status
        `)
      )
      .orderBy('t.created_at', 'desc')
      .offset(page * limit)
      .limit(limit) as EligibleTask[];

    return { tasks, total };
  }

  /**
   * Get task details for upload panel
   */
  async getTaskForUpload(taskId: string): Promise<TaskUploadDetails | null> {
    const task = await db('tasks as t')
      .join('organizations as o', 't.organization_id', 'o.id')
      .leftJoin('users as u', 't.assigned_to', 'u.id')
      .leftJoin('task_templates as tt', 't.template_id', 'tt.id')
      .select<TaskQueryRow[]>(
        't.id',
        't.title',
        't.status',
        't.description',
        'u.email as assignee_email',
        'u.name as assignee_name',
        't.organization_id',
        'o.name as organization_name',
        'tt.title as template_title',
        't.created_at'
      )
      .where('t.id', taskId)
      .first();

    if (!task) {
      return null;
    }

    // Check if task status is eligible
    if (!ELIGIBLE_TASK_STATUSES.includes(task.status)) {
      throw new BadRequestError(
        `Task status "${task.status}" is not eligible for video upload. ` +
        `Eligible statuses: ${ELIGIBLE_TASK_STATUSES.join(', ')}`
      );
    }

    // Get existing recording info
    const existingRecording = await db('recordings')
      .where('task_id', taskId)
      .orderBy('created_at', 'desc')
      .select<RecordingRow[]>('id', 'status', 'created_at', 'file_size_bytes')
      .first();

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      description: task.description ?? null,
      assignee_email: task.assignee_email,
      assignee_name: task.assignee_name,
      organization_id: task.organization_id,
      organization_name: task.organization_name,
      template_title: task.template_title,
      created_at: task.created_at,
      has_recording: !!existingRecording,
      existing_recording: existingRecording || null,
    };
  }

  /**
   * Upload video to a task
   * - Validates task eligibility
   * - Deletes existing recordings (hard delete)
   * - Creates new recording with sysadmin metadata
   * - Queues transcription, thumbnail, transcode jobs
   */
  async uploadVideoToTask(
    taskId: string,
    file: MulterFile,
    sysadminUserId: string
  ): Promise<UploadResult> {
    // Get task details
    const task = await db('tasks as t')
      .join('organizations as o', 't.organization_id', 'o.id')
      .select<TaskQueryRow[]>('t.id', 't.status', 't.organization_id', 'o.slug as org_slug')
      .where('t.id', taskId)
      .first();

    if (!task) {
      throw new NotFoundError('Task not found', { resourceId: taskId });
    }

    // Validate task status
    if (!ELIGIBLE_TASK_STATUSES.includes(task.status)) {
      throw new BadRequestError(
        `Task status "${task.status}" is not eligible for video upload. ` +
        `Eligible statuses: ${ELIGIBLE_TASK_STATUSES.join(', ')}`
      );
    }

    const organizationId: string = task.organization_id;

    logger.info('Starting sysadmin video upload', {
      taskId,
      sysadminUserId,
      organizationId,
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    // Delete all existing recordings for this task (hard delete including S3 files)
    await recordingService.hardDeleteAllRecordingsForTask(taskId);

    logger.info('Deleted existing recordings for task', { taskId });

    // Create new recording entry with sysadmin metadata
    const recording = await recordingService.createRecording(
      sysadminUserId,
      {
        task_id: taskId,
        mime_type: file.mimetype,
        duration_seconds: 0, // Will be updated after processing
        browser_info: JSON.stringify({
          uploadedBySysadmin: true,
          sysadminUserId,
          uploadMethod: 'admin-direct-upload',
        }),
        has_audio: true,
      },
      organizationId
    );

    logger.info('Created recording entry', { recordingId: recording.id, taskId });

    // Upload the file - this handles S3 upload, task status update, and queues jobs
    const updatedRecording = await recordingService.uploadRecording(
      sysadminUserId,
      recording.id,
      file,
      organizationId
    );

    logger.info('Sysadmin video upload completed', {
      recordingId: updatedRecording.id,
      taskId,
      sysadminUserId,
      status: updatedRecording.status,
    });

    // Audit log: sysadmin uploaded video to task
    await logAuditAction({
      organizationId,
      actorId: sysadminUserId,
      action: AuditActionType.SYSADMIN_VIDEO_UPLOAD,
      resourceType: AuditResourceType.TASK,
      resourceId: taskId,
      status: 'success',
      metadata: {
        recordingId: updatedRecording.id,
        fileSize: file.size,
        mimeType: file.mimetype,
        originalFilename: file.originalname,
        context: 'admin_video_upload',
      },
    });

    return {
      recordingId: updatedRecording.id,
      taskId,
      taskStatus: 'submitted',
      message: 'Video uploaded successfully. Transcription and analysis jobs have been queued.',
    };
  }
}

export const adminVideoUploadService = new AdminVideoUploadService();
