import { Job } from 'bullmq';
import { BaseProcessor } from '../base.processor';
import {
  SendEmailJobData,
  EmailTemplate,
  TaskAssignmentEmailData,
  TaskCompletionEmailData,
  ReviewNotificationEmailData,
  TaskRejectionEmailData,
  TaskReminderEmailData,
  ExternalTaskApprovedEmailData,
  ExternalTaskRejectedEmailData,
  MagicLinkEmailData,
} from '../types/job-types';
import { QUEUE_CONFIGS, WORKER_CONCURRENCY } from '../../config/bullmq';
import { logger } from '../../utils/logger';
import {
  generateEmailTemplate,
  createInfoCard,
  createDetailsList,
  createPriorityBadge,
  createFeedbackBlock,
  createSuccessCallout,
  createWarningNotice,
  createStepsList,
  formatTaskType,
  BRAND_COLORS,
} from '../../utils/email-templates';
import { emailService } from '../../services/email.service';

/**
 * Send Email Processor
 * Handles email rendering and delivery through the email service
 *
 * Features:
 * - Template-based email rendering
 * - Integration with existing email service
 * - Progress reporting for long operations
 * - Detailed error logging for debugging
 */
export class SendEmailProcessor extends BaseProcessor<SendEmailJobData, void> {
  constructor() {
    super(QUEUE_CONFIGS.email.name, WORKER_CONCURRENCY.email);
  }

  /**
   * Process an email job
   * Routes to the appropriate template handler based on email type
   */
  protected async process(job: Job<SendEmailJobData, void, string>): Promise<void> {
    const { data } = job;

    logger.debug(`Processing email job: ${job.id}`, {
      template: data.template,
      to: data.to,
      subject: data.subject,
    });

    // Report initial progress
    await this.reportProgress(job, {
      percentage: 0,
      stage: 'rendering',
      message: 'Rendering email template',
    });

    // Render and send email based on template type
    const html = await this.renderEmail(data);

    // Report progress before sending
    await this.reportProgress(job, {
      percentage: 50,
      stage: 'sending',
      message: 'Sending email via email service',
    });

    // Send the email using the existing email service
    await emailService.sendEmail({
      to: data.to,
      subject: data.subject,
      html,
    });

    // Report completion
    await this.reportProgress(job, {
      percentage: 100,
      stage: 'complete',
      message: 'Email sent successfully',
    });

    logger.info(`Email sent successfully: ${data.to}`, {
      template: data.template,
      subject: data.subject,
      jobId: job.id,
    });
  }

  /**
   * Render email HTML based on template type
   */
  private async renderEmail(data: SendEmailJobData): Promise<string> {
    switch (data.template) {
      case EmailTemplate.TASK_ASSIGNMENT:
        return this.renderTaskAssignment(data);

      case EmailTemplate.TASK_COMPLETION:
        return this.renderTaskCompletion(data);

      case EmailTemplate.REVIEW_NOTIFICATION:
        return this.renderReviewNotification(data);

      case EmailTemplate.TASK_REJECTION:
        return this.renderTaskRejection(data);

      case EmailTemplate.TASK_REMINDER:
        return this.renderTaskReminder(data);

      case EmailTemplate.EXTERNAL_TASK_APPROVED:
        return this.renderExternalTaskApproved(data);

      case EmailTemplate.EXTERNAL_TASK_REJECTED:
        return this.renderExternalTaskRejected(data);

      case EmailTemplate.MAGIC_LINK:
        return this.renderMagicLink(data);

      case EmailTemplate.GENERIC:
        return (data).html;

      default:
        throw new Error(`Unknown email template: ${(data as any).template}`);
    }
  }

  /**
   * Render task assignment email
   */
  private renderTaskAssignment(data: TaskAssignmentEmailData): string {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    return generateEmailTemplate({
      title: 'New Task Assignment',
      preheader: `${data.creatorName} assigned you a new task`,
      content: `
        <p>Hi ${data.assigneeName},</p>
        <p>You have been assigned a new task by <strong>${data.creatorName}</strong>.</p>

        ${createInfoCard(`
          <h3 style="margin: 0 0 15px 0; color: ${BRAND_COLORS.text};">${data.taskTitle}</h3>
          ${data.taskDescription ? `<p style="margin: 0 0 10px 0;">${data.taskDescription}</p>` : ''}
          ${data.taskPriority ? createPriorityBadge(data.taskPriority) : ''}
          ${createDetailsList([
            ...(data.taskType ? [{ label: 'Type', value: formatTaskType(data.taskType) }] : []),
            ...(data.dueDate ? [{ label: 'Due Date', value: new Date(data.dueDate).toLocaleDateString() }] : []),
            ...(data.estimatedDuration ? [{ label: 'Est. Duration', value: `${data.estimatedDuration} minutes` }] : []),
          ])}
        `)}

        <p style="margin-top: 24px;"><strong>What you need to do:</strong></p>
        ${createStepsList([
          'Review the task details in CogVeri',
          'Start recording your screen when ready',
          'Complete the task while recording',
          'Submit the recording for review',
        ])}
      `,
      ctaButton: {
        text: 'View Task Details',
        url: `${frontendUrl}/tasks/${data.taskId}`,
      },
      footer: `<p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">If you have questions, please contact your manager or the task creator.</p>`,
    });
  }

  /**
   * Render task completion email
   */
  private renderTaskCompletion(data: TaskCompletionEmailData): string {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    return generateEmailTemplate({
      title: 'Task Ready for Review',
      preheader: `${data.assigneeName} submitted a task for your review`,
      headerColor: BRAND_COLORS.success,
      content: `
        <p>Hi ${data.reviewerName},</p>
        <p><strong>${data.assigneeName}</strong> has completed the task and submitted it for your review.</p>

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: data.taskTitle },
            { label: 'Completed by', value: data.assigneeName },
            { label: 'Submitted', value: new Date().toLocaleDateString() },
            ...(data.actualDuration ? [{ label: 'Duration', value: `${data.actualDuration} minutes` }] : []),
          ])}
        `, BRAND_COLORS.success)}
      `,
      ctaButton: {
        text: 'Review Recording',
        url: `${frontendUrl}/tasks/${data.taskId}/review`,
        color: BRAND_COLORS.success,
      },
    });
  }

  /**
   * Render review notification email
   */
  private renderReviewNotification(data: ReviewNotificationEmailData): string {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    return generateEmailTemplate({
      title: 'Recording Ready for Review',
      preheader: `${data.assigneeName} submitted a recording for your review`,
      content: `
        <p>Hi ${data.reviewerName},</p>
        <p><strong>${data.assigneeName}</strong> has submitted a recording for your review.</p>

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: data.taskTitle },
            { label: 'Description', value: data.taskDescription || 'N/A' },
            { label: 'Submitted by', value: data.assigneeName },
            { label: 'Priority', value: (data.taskPriority || 'normal').toUpperCase() },
          ])}
        `)}

        <p>Please review the recording and provide your feedback or approve the task completion.</p>
      `,
      ctaButton: {
        text: 'Review Recording',
        url: `${frontendUrl}/tasks/${data.taskId}/review`,
      },
    });
  }

  /**
   * Render task rejection email
   */
  private renderTaskRejection(data: TaskRejectionEmailData): string {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    return generateEmailTemplate({
      title: 'Task Requires Revision',
      preheader: `${data.reviewerName} requested changes to your submission`,
      headerColor: BRAND_COLORS.error,
      content: `
        <p>Hi ${data.assigneeName},</p>
        <p>Your task submission has been reviewed by <strong>${data.reviewerName}</strong> and requires some changes.</p>

        ${createFeedbackBlock(data.feedback, 'error')}

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: data.taskTitle },
            { label: 'Description', value: data.taskDescription || 'N/A' },
          ])}
        `, BRAND_COLORS.error)}

        <p>Please address the feedback and resubmit your recording.</p>
      `,
      ctaButton: {
        text: 'View Task',
        url: `${frontendUrl}/tasks/${data.taskId}`,
        color: BRAND_COLORS.error,
      },
    });
  }

  /**
   * Render task reminder email
   */
  private renderTaskReminder(data: TaskReminderEmailData): string {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    return generateEmailTemplate({
      title: 'Task Reminder',
      preheader: `Your task "${data.taskTitle}" is due soon`,
      headerColor: BRAND_COLORS.warning,
      content: `
        <p>Hi ${data.assigneeName},</p>

        ${createInfoCard(`
          <strong>Your task "${data.taskTitle}" is due ${data.dueDate ? `on ${new Date(data.dueDate).toLocaleDateString()}` : 'soon'}.</strong>
        `, BRAND_COLORS.warning)}

        <p>Please complete and submit your recording as soon as possible.</p>
      `,
      ctaButton: {
        text: 'Go to Task',
        url: `${frontendUrl}/tasks/${data.taskId}`,
        color: BRAND_COLORS.warning,
      },
    });
  }

  /**
   * Render external task approved email
   */
  private renderExternalTaskApproved(data: ExternalTaskApprovedEmailData): string {
    return generateEmailTemplate({
      title: 'Task Approved!',
      preheader: 'Great news! Your recording has been approved.',
      headerColor: BRAND_COLORS.success,
      content: `
        <p>Hi ${data.contributorFirstName} ${data.contributorLastName},</p>

        ${createSuccessCallout('Your recording has been approved!')}

        <p>Your recording has been reviewed and approved by <strong>${data.reviewerName}</strong>.</p>

        ${data.feedback ? createFeedbackBlock(data.feedback, 'success') : ''}

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: data.taskTitle },
            { label: 'Description', value: data.taskDescription || 'N/A' },
          ])}
        `, BRAND_COLORS.success)}

        <p>Thank you for your excellent work! We appreciate your contribution.</p>
      `,
    });
  }

  /**
   * Render external task rejected email
   */
  private renderExternalTaskRejected(data: ExternalTaskRejectedEmailData): string {
    return generateEmailTemplate({
      title: 'Task Requires Revision',
      preheader: `${data.reviewerName} requested changes to your submission`,
      headerColor: BRAND_COLORS.error,
      content: `
        <p>Hi ${data.contributorFirstName} ${data.contributorLastName},</p>
        <p>Your recording has been reviewed by <strong>${data.reviewerName}</strong> and requires some changes before it can be approved.</p>

        ${createFeedbackBlock(data.feedback, 'error')}

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: data.taskTitle },
            { label: 'Description', value: data.taskDescription || 'N/A' },
          ])}
        `, BRAND_COLORS.error)}

        <p style="margin-top: 24px;"><strong>What to do next:</strong></p>
        ${createStepsList([
          'Review the feedback above carefully',
          'Click the button below to access the task',
          'Record a new submission addressing the feedback',
          'Submit for review again',
        ])}
      `,
      ctaButton: {
        text: 'Redo Task Recording',
        url: data.newMagicLink,
      },
      footer: createWarningNotice('This link is valid for 30 days and can be used multiple times for resubmissions.'),
    });
  }

  /**
   * Render magic link email
   */
  private renderMagicLink(data: MagicLinkEmailData): string {
    return generateEmailTemplate({
      title: data.taskTitle ? `Task Access: ${data.taskTitle}` : 'Your Access Link',
      preheader: 'Click the button below to access your task',
      content: `
        <p>Hi ${data.recipientName},</p>
        <p>You've been invited to complete a task in CogVeri. Click the button below to get started.</p>

        ${data.taskTitle ? createInfoCard(`
          <strong>Task:</strong> ${data.taskTitle}
        `) : ''}

        ${createWarningNotice(`This link will expire on ${new Date(data.expiresAt).toLocaleDateString()} at ${new Date(data.expiresAt).toLocaleTimeString()}.`)}
      `,
      ctaButton: {
        text: 'Access Task',
        url: data.magicLinkUrl,
      },
      footer: `<p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">If you did not expect this email, you can safely ignore it. The link will expire automatically.</p>`,
    });
  }

  /**
   * Hook called when a job fails
   * Log additional context for debugging email delivery issues
   */
  protected async onFailed(job: Job<SendEmailJobData, void, string>, error: Error): Promise<void> {
    // Call parent to handle DLQ
    await super.onFailed(job, error);

    logger.error(`Email delivery failed: ${job.data.to}`, {
      template: job.data.template,
      subject: job.data.subject,
      error: error.message,
      attemptsMade: job.attemptsMade,
      jobId: job.id,
    });
  }
}

// Singleton instance
let sendEmailProcessorInstance: SendEmailProcessor | null = null;

/**
 * Get or create the SendEmailProcessor singleton instance
 */
export function getSendEmailProcessor(): SendEmailProcessor {
  if (!sendEmailProcessorInstance) {
    sendEmailProcessorInstance = new SendEmailProcessor();
  }
  return sendEmailProcessorInstance;
}
