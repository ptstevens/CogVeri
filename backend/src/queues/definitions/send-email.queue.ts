import { BaseQueue } from '../base.queue';
import { SendEmailJobData, EmailTemplate, JobName } from '../types/job-types';
import { QUEUE_CONFIGS } from '../../config/bullmq';

/**
 * Email Queue
 * Handles asynchronous email sending with retry support
 *
 * Features:
 * - Automatic retries with exponential backoff
 * - Support for all email templates
 * - Priority-based processing
 * - Rate limiting protection
 */
export class SendEmailQueue extends BaseQueue<SendEmailJobData, void> {
  constructor() {
    super(QUEUE_CONFIGS.email.name, {
      defaultJobOptions: QUEUE_CONFIGS.email.defaultJobOptions,
    });
  }

  /**
   * Get job name based on email template type
   * Useful for monitoring and debugging
   */
  protected getJobName(data: SendEmailJobData): string {
    return `${JobName.SEND_EMAIL}:${data.template}`;
  }

  /**
   * Add a high-priority email (e.g., password reset, magic links)
   */
  async addHighPriority(data: SendEmailJobData) {
    return this.add(data, { priority: 1 });
  }

  /**
   * Add a low-priority email (e.g., notifications, reminders)
   */
  async addLowPriority(data: SendEmailJobData) {
    return this.add(data, { priority: 10 });
  }

  /**
   * Schedule an email for later delivery
   * @param data - Email data
   * @param delayMs - Delay in milliseconds
   */
  async scheduleEmail(data: SendEmailJobData, delayMs: number) {
    return this.add(data, { delay: delayMs });
  }

  /**
   * Add multiple emails in bulk with default options
   */
  async sendBulkEmails(emails: SendEmailJobData[]) {
    return this.addBulk(emails.map((data) => ({ data })));
  }
}

// Singleton instance
let sendEmailQueueInstance: SendEmailQueue | null = null;

/**
 * Get or create the SendEmailQueue singleton instance
 */
export function getSendEmailQueue(): SendEmailQueue {
  if (!sendEmailQueueInstance) {
    sendEmailQueueInstance = new SendEmailQueue();
  }
  return sendEmailQueueInstance;
}

// Type-safe helper for adding specific email types
export const emailQueueHelpers = {
  /**
   * Queue a task assignment notification email
   */
  queueTaskAssignment: async (params: {
    to: string;
    taskId: string;
    taskTitle: string;
    taskDescription?: string;
    taskPriority?: string;
    taskType?: string;
    dueDate?: string;
    estimatedDuration?: number;
    creatorName: string;
    creatorEmail: string;
    assigneeName: string;
  }) => {
    const queue = getSendEmailQueue();
    return queue.add({
      ...params,
      template: EmailTemplate.TASK_ASSIGNMENT,
      subject: `New Task Assigned: ${params.taskTitle}`,
    });
  },

  /**
   * Queue a task completion notification email
   */
  queueTaskCompletion: async (params: {
    to: string;
    taskId: string;
    taskTitle: string;
    reviewerName: string;
    assigneeName: string;
    assigneeEmail: string;
    actualDuration?: number;
  }) => {
    const queue = getSendEmailQueue();
    return queue.add({
      ...params,
      template: EmailTemplate.TASK_COMPLETION,
      subject: `Task Ready for Review: ${params.taskTitle}`,
    });
  },

  /**
   * Queue a review notification email
   */
  queueReviewNotification: async (params: {
    to: string;
    taskId: string;
    taskTitle: string;
    taskDescription?: string;
    taskPriority?: string;
    reviewerName: string;
    assigneeName: string;
    assigneeEmail: string;
  }) => {
    const queue = getSendEmailQueue();
    return queue.add({
      ...params,
      template: EmailTemplate.REVIEW_NOTIFICATION,
      subject: `New Recording to Review: ${params.taskTitle}`,
    });
  },

  /**
   * Queue a task rejection notification email
   */
  queueTaskRejection: async (params: {
    to: string;
    taskId: string;
    taskTitle: string;
    taskDescription?: string;
    reviewerName: string;
    reviewerEmail: string;
    assigneeName: string;
    feedback: string;
  }) => {
    const queue = getSendEmailQueue();
    return queue.add({
      ...params,
      template: EmailTemplate.TASK_REJECTION,
      subject: `Task Needs Revision: ${params.taskTitle}`,
    });
  },

  /**
   * Queue a task reminder email
   */
  queueTaskReminder: async (params: {
    to: string;
    taskId: string;
    taskTitle: string;
    dueDate?: string;
    assigneeName: string;
  }) => {
    const queue = getSendEmailQueue();
    return queue.addLowPriority({
      ...params,
      template: EmailTemplate.TASK_REMINDER,
      subject: `Reminder: Task "${params.taskTitle}" is due soon`,
    });
  },

  /**
   * Queue a magic link email (high priority)
   */
  queueMagicLink: async (params: {
    to: string;
    recipientName: string;
    magicLinkUrl: string;
    expiresAt: string;
    taskTitle?: string;
  }) => {
    const queue = getSendEmailQueue();
    return queue.addHighPriority({
      ...params,
      template: EmailTemplate.MAGIC_LINK,
      subject: params.taskTitle
        ? `Task Access Link: ${params.taskTitle}`
        : 'Your CogVeri Access Link',
    });
  },

  /**
   * Queue a generic custom email
   */
  queueGenericEmail: async (params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }) => {
    const queue = getSendEmailQueue();
    return queue.add({
      template: EmailTemplate.GENERIC,
      ...params,
    });
  },
};
