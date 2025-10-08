import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Check if email is enabled
    if (process.env.EMAIL_ENABLED !== 'true') {
      logger.info('Email service disabled');
      return;
    }

    // Using Gmail SMTP (free option)
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // Verify connection (but don't fail if credentials are incorrect)
    if (this.transporter) {
      this.transporter.verify((error, success) => {
        if (error) {
          logger.warn('Email service not configured properly. Check credentials:', error.message);
          // Don't throw - allow the app to run without email
        } else {
          logger.info('Email service ready to send notifications');
        }
      });
    }
  }

  private async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      logger.error('Email transporter not initialized');
      return;
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || `"Relay System" <${process.env.EMAIL_USER || 'noreply@relay.com'}>`,
        to: options.to,
        subject: options.subject,
        text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        html: options.html
      };

      logger.info(`📧 Attempting to send email to: ${options.to} | Subject: ${options.subject}`);
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`✅ Email successfully sent to ${options.to} | MessageID: ${info.messageId}`);
    } catch (error) {
      logger.error(`❌ Failed to send email to ${options.to}:`, error);
      throw error;
    }
  }

  // Send task assignment notification
  async sendTaskAssignmentEmail(task: any, assignee: any, creator: any): Promise<void> {
    const subject = `New Task Assigned: ${task.title}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .task-details { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .priority { padding: 5px 10px; border-radius: 4px; display: inline-block; margin: 10px 0; }
          .priority-high { background-color: #FEE2E2; color: #DC2626; }
          .priority-medium { background-color: #FEF3C7; color: #D97706; }
          .priority-low { background-color: #D1FAE5; color: #059669; }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4F46E5;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin-top: 20px;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Task Assignment</h1>
          </div>
          <div class="content">
            <p>Hi ${assignee.name || assignee.email},</p>

            <p>You have been assigned a new task by ${creator.name || creator.email}.</p>

            <div class="task-details">
              <h2>${task.title}</h2>
              ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ''}

              <p><strong>Type:</strong> ${this.formatTaskType(task.type)}</p>

              <div>
                <span class="priority priority-${task.priority}">
                  Priority: ${task.priority.toUpperCase()}
                </span>
              </div>

              ${task.due_date ? `<p><strong>Due Date:</strong> ${new Date(task.due_date).toLocaleString()}</p>` : ''}
              ${task.estimated_duration ? `<p><strong>Estimated Duration:</strong> ${task.estimated_duration} minutes</p>` : ''}
            </div>

            <p><strong>What you need to do:</strong></p>
            <ol>
              <li>Review the task details in the Relay system</li>
              <li>Start recording your screen when ready</li>
              <li>Complete the task while recording</li>
              <li>Submit the recording for review</li>
            </ol>

            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tasks/${task.id}" class="button">
              View Task Details
            </a>

            <div class="footer">
              <p>This is an automated message from the Relay system.</p>
              <p>If you have questions, please contact your manager or the task creator.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: assignee.email,
      subject,
      html
    });
  }

  // Send task completion notification
  async sendTaskCompletionEmail(task: any, reviewer: any, assignee: any): Promise<void> {
    const subject = `Task Ready for Review: ${task.title}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #10B981;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Task Ready for Review</h1>
          </div>
          <div class="content">
            <p>Hi ${reviewer.name || reviewer.email},</p>

            <p>${assignee.name || assignee.email} has completed the task "${task.title}" and submitted it for your review.</p>

            <p><strong>Task Details:</strong></p>
            <ul>
              <li>Title: ${task.title}</li>
              <li>Completed by: ${assignee.name || assignee.email}</li>
              <li>Completion time: ${new Date().toLocaleString()}</li>
              ${task.actual_duration ? `<li>Actual duration: ${task.actual_duration} minutes</li>` : ''}
            </ul>

            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tasks/${task.id}/review" class="button">
              Review Recording
            </a>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: reviewer.email,
      subject,
      html
    });
  }

  // Send review notification when recording is uploaded
  async sendReviewNotification(task: any, reviewer: any, assignee: any): Promise<void> {
    const subject = `New Recording to Review: ${task.title}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #8B5CF6; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .info { background-color: white; padding: 15px; border-left: 4px solid #8B5CF6; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #8B5CF6; color: white; text-decoration: none; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Recording Ready for Review</h1>
          </div>
          <div class="content">
            <p>Hi ${reviewer.name || reviewer.email},</p>

            <p><strong>${assignee.name || assignee.email}</strong> has submitted a recording for your review.</p>

            <div class="info">
              <h3>Task Details:</h3>
              <ul>
                <li><strong>Title:</strong> ${task.title}</li>
                <li><strong>Description:</strong> ${task.description || 'N/A'}</li>
                <li><strong>Submitted by:</strong> ${assignee.name || assignee.email}</li>
                <li><strong>Priority:</strong> ${task.priority || 'normal'}</li>
              </ul>
            </div>

            <p>Please review the recording and provide your feedback or approve the task completion.</p>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tasks/${task.id}/review" class="button">
                Review Recording
              </a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: reviewer.email,
      subject,
      html
    });

    logger.info(`Review notification sent to ${reviewer.email} for task ${task.id}`);
  }

  // Send task rejection notification
  async sendTaskRejectionEmail(task: any, reviewer: any, assignee: any, feedback: string): Promise<void> {
    const subject = `Task Needs Revision: ${task.title}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #EF4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .feedback { background-color: #FEE2E2; padding: 15px; border-left: 4px solid #EF4444; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #EF4444; color: white; text-decoration: none; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Task Requires Revision</h1>
          </div>
          <div class="content">
            <p>Hi ${assignee.name || assignee.email},</p>

            <p>Your task submission has been reviewed by <strong>${reviewer.name || reviewer.email}</strong> and requires some changes.</p>

            <div class="feedback">
              <h3>Reviewer Feedback:</h3>
              <p>${feedback}</p>
            </div>

            <p><strong>Task:</strong> ${task.title}</p>
            <p><strong>Description:</strong> ${task.description || 'N/A'}</p>

            <p>Please address the feedback and resubmit your recording.</p>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tasks/${task.id}" class="button">
                View Task
              </a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: assignee.email,
      subject,
      html
    });

    logger.info(`Task rejection notification sent to ${assignee.email} for task ${task.id}`);
  }

  // Send reminder emails
  async sendTaskReminderEmail(task: any, assignee: any): Promise<void> {
    const subject = `Reminder: Task "${task.title}" is due soon`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #F59E0B; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .warning { background-color: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Task Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${assignee.name || assignee.email},</p>

            <div class="warning">
              <strong>Your task "${task.title}" is due ${task.due_date ? `on ${new Date(task.due_date).toLocaleString()}` : 'soon'}.</strong>
            </div>

            <p>Please complete and submit your recording as soon as possible.</p>

            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tasks/${task.id}" class="button" style="display: inline-block; padding: 12px 24px; background-color: #F59E0B; color: white; text-decoration: none; border-radius: 6px;">
              Go to Task
            </a>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: assignee.email,
      subject,
      html
    });
  }

  // Send external task approved notification
  async sendExternalTaskApprovedEmail(task: any, contributor: any, reviewer: any, feedback: string): Promise<void> {
    const subject = `✅ Task Approved: ${task.title}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .feedback { background-color: #D1FAE5; padding: 15px; border-left: 4px solid #10B981; margin: 20px 0; }
          .checkmark { font-size: 48px; color: #10B981; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="checkmark">✓</div>
            <h1>Task Approved!</h1>
          </div>
          <div class="content">
            <p>Hi ${contributor.first_name} ${contributor.last_name},</p>

            <p>Great news! Your recording has been reviewed and <strong>approved</strong> by ${reviewer.name || reviewer.email}.</p>

            <div class="feedback">
              <h3>📝 Reviewer Feedback:</h3>
              <p>${feedback || 'No additional feedback provided.'}</p>
            </div>

            <div style="background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #10B981;">
              <h3>Task Details:</h3>
              <p><strong>Title:</strong> ${task.title}</p>
              <p><strong>Description:</strong> ${task.description || 'N/A'}</p>
            </div>

            <p>Thank you for your excellent work! We appreciate your contribution.</p>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              This is an automated email notification from the Relay task management system.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: contributor.email,
      subject,
      html
    });

    logger.info(`External task approval notification sent to ${contributor.email} for task ${task.id}`);
  }

  // Send external task rejected notification with new magic link
  async sendExternalTaskRejectedEmail(task: any, contributor: any, reviewer: any, feedback: string, newMagicLink: string): Promise<void> {
    const subject = `❌ Task Needs Revision: ${task.title}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #EF4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .feedback { background-color: #FEE2E2; padding: 15px; border-left: 4px solid #EF4444; margin: 20px 0; }
          .button { display: inline-block; padding: 14px 28px; background-color: #8B5CF6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .warning-icon { font-size: 48px; color: #EF4444; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="warning-icon">⚠</div>
            <h1>Task Requires Revision</h1>
          </div>
          <div class="content">
            <p>Hi ${contributor.first_name} ${contributor.last_name},</p>

            <p>Your recording has been reviewed by <strong>${reviewer.name || reviewer.email}</strong> and requires some changes before it can be approved.</p>

            <div class="feedback">
              <h3>📋 Reviewer Feedback:</h3>
              <p>${feedback}</p>
            </div>

            <div style="background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #EF4444;">
              <h3>Task Details:</h3>
              <p><strong>Title:</strong> ${task.title}</p>
              <p><strong>Description:</strong> ${task.description || 'N/A'}</p>
            </div>

            <p><strong>What to do next:</strong></p>
            <ol>
              <li>Review the feedback above carefully</li>
              <li>Click the button below to access the task</li>
              <li>Record a new submission addressing the feedback</li>
              <li>Submit for review again</li>
            </ol>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${newMagicLink}" class="button">
                Redo Task Recording
              </a>
            </div>

            <p style="margin-top: 20px; padding: 15px; background-color: #FEF3C7; border-left: 4px solid #F59E0B;">
              <strong>⏰ Note:</strong> This link is valid for 30 days and can be used multiple times for resubmissions.
            </p>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              This is an automated email notification from the Relay task management system.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: contributor.email,
      subject,
      html
    });

    logger.info(`External task rejection notification sent to ${contributor.email} with new magic link for task ${task.id}`);
  }

  private formatTaskType(type: string): string {
    const typeMap: Record<string, string> = {
      'recording': 'Screen Recording',
      'live_demo': 'Live Demo',
      'hybrid': 'Hybrid (Recording + Live)'
    };
    return typeMap[type] || type;
  }
}

export const emailService = new EmailService();