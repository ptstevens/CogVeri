/**
 * RecordingNotificationService
 *
 * Handles notification operations for recordings.
 * Extracted from RecordingService for better separation of concerns (Fix #1).
 *
 * Responsibilities:
 * - Send reviewer notifications when recordings are uploaded
 */

import { db } from '../config/database';
import { emailService } from './email.service';
import { logger } from '../utils/logger';

/**
 * Recording interface (minimal fields needed for notifications)
 */
interface Recording {
  id: string;
  task_id: string;
}

export class RecordingNotificationService {
  /**
   * Send notification to the task reviewer when a recording is uploaded
   */
  async sendReviewerNotification(
    recording: Recording,
    fileUrl: string,
    userId: string
  ): Promise<void> {
    const task = await db('tasks').where('id', recording.task_id).first();

    if (!task?.reviewed_by) return;

    const reviewer = await db('users').where('id', task.reviewed_by).first();

    // Get assignee from users or external_contributors
    let assignee = await db('users').where('id', userId).first();

    if (!assignee) {
      const contributor = await db('external_contributors').where('id', userId).first();

      if (contributor) {
        assignee = {
          id: contributor.id,
          name:
            `${contributor.first_name || ''} ${contributor.last_name || ''}`.trim() ||
            contributor.email,
          email: contributor.email,
        };
      }
    }

    if (reviewer && assignee) {
      await emailService.sendReviewNotification(
        { ...task, recording_url: fileUrl },
        reviewer,
        assignee
      );
      logger.info(`Review notification sent to ${reviewer.email} for recording ${recording.id}`);
    }
  }

  /**
   * Send notification to the task reviewer after AI analysis completes
   * Includes analysis results (score, verdict) in the email
   */
  async sendReviewerNotificationWithAnalysis(
    recording: Recording,
    fileUrl: string,
    userId: string,
    analysisResults: {
      score: number;
      verdict: string;
      verdictText: string;
    }
  ): Promise<void> {
    const task = await db('tasks').where('id', recording.task_id).first();

    if (!task?.reviewed_by) return;

    const reviewer = await db('users').where('id', task.reviewed_by).first();

    // Get assignee from users or external_contributors
    let assignee = await db('users').where('id', userId).first();

    if (!assignee) {
      const contributor = await db('external_contributors').where('id', userId).first();

      if (contributor) {
        assignee = {
          id: contributor.id,
          name:
            `${contributor.first_name || ''} ${contributor.last_name || ''}`.trim() ||
            contributor.email,
          email: contributor.email,
        };
      }
    }

    if (reviewer && assignee) {
      await emailService.sendReviewNotificationWithAnalysis(
        { ...task, recording_url: fileUrl },
        reviewer,
        assignee,
        analysisResults
      );
      logger.info(
        `Review notification with analysis sent to ${reviewer.email} for recording ${recording.id} (${analysisResults.verdictText})`
      );
    }
  }
}

// Export singleton instance
export const recordingNotificationService = new RecordingNotificationService();
export default recordingNotificationService;
