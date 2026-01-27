import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { logger } from '../utils/logger';
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
} from '../utils/email-templates';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];  // Optional CC recipients for billing emails etc.
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private oauth2Client: any = null;
  private useOAuth2: boolean = false;

  constructor() {
    this.initializeTransporter();
  }

  private async initializeTransporter() {
    // Check if email is enabled
    if (process.env.EMAIL_ENABLED !== 'true') {
      logger.info('Email service disabled');
      return;
    }

    // Check if Google OAuth2 credentials are provided
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const sendAsEmail = process.env.GOOGLE_SEND_AS_EMAIL;

    if (serviceAccountEmail && serviceAccountKey && sendAsEmail) {
      // Use Google OAuth2 with service account
      await this.initializeOAuth2Transport(serviceAccountEmail, serviceAccountKey, sendAsEmail);
    } else {
      // Fall back to SMTP
      this.initializeSMTPTransport();
    }
  }

  private async initializeOAuth2Transport(
    serviceAccountEmail: string,
    serviceAccountKey: string,
    sendAsEmail: string
  ) {
    try {
      // Parse the private key (handle escaped newlines from env vars)
      const privateKey = serviceAccountKey.replace(/\\n/g, '\n');

      // Create JWT auth client for service account
      this.oauth2Client = new google.auth.JWT({
        email: serviceAccountEmail,
        key: privateKey,
        scopes: ['https://mail.google.com/'],
        subject: sendAsEmail, // Impersonate this user
      });

      // Get initial access token
      const { token } = await this.oauth2Client.getAccessToken();

      if (!token) {
        throw new Error('Failed to obtain access token');
      }

      // Create transport with OAuth2
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: sendAsEmail,
          serviceClient: serviceAccountEmail,
          privateKey: privateKey,
          accessToken: token,
        },
      });

      this.useOAuth2 = true;

      logger.info('✅ Email service ready (Google OAuth2)');
      logger.info(`Sending from: ${sendAsEmail}`);
    } catch (error: any) {
      logger.error('Failed to initialize Google OAuth2 email:', error.message);
      logger.warn('Falling back to SMTP configuration...');
      this.initializeSMTPTransport();
    }
  }

  private initializeSMTPTransport() {
    // Email transporter configuration
    const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.EMAIL_PORT || '587');
    const user = process.env.EMAIL_USER;
    const password = process.env.EMAIL_PASSWORD;
    const isSecure = process.env.EMAIL_SECURE === 'true';

    // Build SMTP URL based on configuration
    let smtpUrl: string;
    if (user && password) {
      // Authenticated SMTP (e.g., Gmail)
      smtpUrl = `smtp${isSecure ? 's' : ''}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
    } else {
      // Unauthenticated SMTP (e.g., MailHog development)
      smtpUrl = `smtp://${host}:${port}`;
    }

    this.transporter = nodemailer.createTransport(smtpUrl);
    this.useOAuth2 = false;

    // Verify connection (but don't fail if credentials are incorrect)
    if (this.transporter) {
      this.transporter.verify((error, _success) => {
        if (error) {
          logger.warn('Email service not configured properly. Check credentials:');
          logger.warn(`Error code: ${(error as any).code || 'N/A'}`);
          logger.warn(`Error message: ${error.message}`);
          // Don't throw - allow the app to run without email
        } else {
          logger.info('✅ Email service ready (SMTP)');
          logger.info(`SMTP configured: ${host}:${port}`);
          logger.info(`Sending from: ${process.env.EMAIL_FROM || user}`);
        }
      });
    }
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (!this.oauth2Client) return null;

    try {
      const { token } = await this.oauth2Client.getAccessToken();
      return token;
    } catch (error) {
      logger.error('Failed to refresh OAuth2 access token:', error);
      return null;
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      logger.error('Email transporter not initialized');
      return;
    }

    try {
      // Determine the "from" address
      const fromAddress = this.useOAuth2
        ? process.env.GOOGLE_SEND_AS_EMAIL
        : process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@cogveri.com';

      const mailOptions: nodemailer.SendMailOptions = {
        from: `"CogVeri" <${fromAddress}>`,
        to: options.to,
        subject: options.subject,
        text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        html: options.html,
        ...(options.cc && { cc: options.cc }),  // Include CC if provided
      };

      logger.info(`📧 Attempting to send email to: ${options.to} | Subject: ${options.subject}`);

      // For OAuth2, refresh token before sending if needed
      if (this.useOAuth2 && this.oauth2Client) {
        const newToken = await this.refreshAccessToken();
        if (newToken && this.transporter) {
          // Update the access token
          (this.transporter as any).options.auth.accessToken = newToken;
        }
      }

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`✅ Email successfully sent to ${options.to} | MessageID: ${info.messageId}`);
    } catch (error: any) {
      // If OAuth2 token expired, try to refresh and retry once
      if (this.useOAuth2 && error.code === 'EAUTH') {
        logger.warn('OAuth2 token may have expired, attempting refresh...');
        const newToken = await this.refreshAccessToken();
        if (newToken && this.transporter) {
          (this.transporter as any).options.auth.accessToken = newToken;
          try {
            const fromAddress = process.env.GOOGLE_SEND_AS_EMAIL;
            const mailOptions = {
              from: `"CogVeri" <${fromAddress}>`,
              to: options.to,
              subject: options.subject,
              text: options.text || options.html.replace(/<[^>]*>/g, ''),
              html: options.html
            };
            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`✅ Email successfully sent after token refresh to ${options.to} | MessageID: ${info.messageId}`);
            return;
          } catch (retryError) {
            logger.error(`❌ Failed to send email even after token refresh:`, retryError);
            throw retryError;
          }
        }
      }
      logger.error(`❌ Failed to send email to ${options.to}:`, error);
      throw error;
    }
  }

  // Send task assignment notification
  async sendTaskAssignmentEmail(task: any, assignee: any, creator: any): Promise<void> {
    const subject = `New Task Assigned: ${task.title}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    const html = generateEmailTemplate({
      title: 'New Task Assignment',
      preheader: `${creator.name || creator.email} assigned you a new task`,
      content: `
        <p>Hi ${assignee.name || assignee.email},</p>
        <p>You have been assigned a new task by <strong>${creator.name || creator.email}</strong>.</p>

        ${createInfoCard(`
          <h3 style="margin: 0 0 15px 0; color: ${BRAND_COLORS.text};">${task.title}</h3>
          ${task.description ? `<p style="margin: 0 0 10px 0;">${task.description}</p>` : ''}
          ${createPriorityBadge(task.priority || 'medium')}
          ${createDetailsList([
            { label: 'Type', value: formatTaskType(task.type) },
            ...(task.due_date ? [{ label: 'Due Date', value: new Date(task.due_date).toLocaleDateString() }] : []),
            ...(task.estimated_duration ? [{ label: 'Est. Duration', value: `${task.estimated_duration} minutes` }] : []),
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
        url: `${frontendUrl}/tasks/${task.id}`,
      },
      footer: `<p style="color: ${BRAND_COLORS.textMuted}; font-size: 14px;">If you have questions, please contact your manager or the task creator.</p>`,
    });

    await this.sendEmail({ to: assignee.email, subject, html });
  }

  // Send task completion notification
  async sendTaskCompletionEmail(task: any, reviewer: any, assignee: any): Promise<void> {
    const subject = `Task Ready for Review: ${task.title}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    const html = generateEmailTemplate({
      title: 'Task Ready for Review',
      preheader: `${assignee.name || assignee.email} submitted a task for your review`,
      headerColor: BRAND_COLORS.success,
      content: `
        <p>Hi ${reviewer.name || reviewer.email},</p>
        <p><strong>${assignee.name || assignee.email}</strong> has completed the task and submitted it for your review.</p>

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: task.title },
            { label: 'Completed by', value: assignee.name || assignee.email },
            { label: 'Submitted', value: new Date().toLocaleDateString() },
            ...(task.actual_duration ? [{ label: 'Duration', value: `${task.actual_duration} minutes` }] : []),
          ])}
        `, BRAND_COLORS.success)}
      `,
      ctaButton: {
        text: 'Review Recording',
        url: `${frontendUrl}/tasks/${task.id}/review`,
        color: BRAND_COLORS.success,
      },
    });

    await this.sendEmail({ to: reviewer.email, subject, html });
  }

  // Send review notification when recording is uploaded
  async sendReviewNotification(task: any, reviewer: any, assignee: any): Promise<void> {
    const subject = `New Recording to Review: ${task.title}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    const html = generateEmailTemplate({
      title: 'Recording Ready for Review',
      preheader: `${assignee.name || assignee.email} submitted a recording for your review`,
      content: `
        <p>Hi ${reviewer.name || reviewer.email},</p>
        <p><strong>${assignee.name || assignee.email}</strong> has submitted a recording for your review.</p>

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: task.title },
            { label: 'Description', value: task.description || 'N/A' },
            { label: 'Submitted by', value: assignee.name || assignee.email },
            { label: 'Priority', value: (task.priority || 'normal').toUpperCase() },
          ])}
        `)}

        <p>Please review the recording and provide your feedback or approve the task completion.</p>
      `,
      ctaButton: {
        text: 'Review Recording',
        url: `${frontendUrl}/tasks/${task.id}/review`,
      },
    });

    await this.sendEmail({ to: reviewer.email, subject, html });
    logger.info(`Review notification sent to ${reviewer.email} for task ${task.id}`);
  }

  // Send review notification with AI analysis results (sent after analysis completes)
  async sendReviewNotificationWithAnalysis(
    task: any,
    reviewer: any,
    assignee: any,
    analysisResults: { score: number; verdict: string; verdictText: string }
  ): Promise<void> {
    const subject = `Recording Ready for Review: ${task.title} (${analysisResults.verdictText})`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    // Determine color based on verdict
    const verdictColors: Record<string, string> = {
      'PASS': BRAND_COLORS.success,
      'PARTIAL_PASS': '#F59E0B', // amber
      'NEEDS_REVIEW': '#F59E0B', // amber
      'FAIL': BRAND_COLORS.error,
    };
    const verdictColor = verdictColors[analysisResults.verdict] || BRAND_COLORS.primary;

    const html = generateEmailTemplate({
      title: 'Recording Ready for Review',
      preheader: `${assignee.name || assignee.email} submitted a recording - AI Score: ${analysisResults.score.toFixed(0)}%`,
      content: `
        <p>Hi ${reviewer.name || reviewer.email},</p>
        <p><strong>${assignee.name || assignee.email}</strong> has submitted a recording for your review. AI analysis is complete.</p>

        ${createInfoCard(`
          <div style="text-align: center; padding: 10px 0; margin-bottom: 15px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-size: 32px; font-weight: bold; color: ${verdictColor};">${analysisResults.score.toFixed(0)}%</div>
            <div style="font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">${analysisResults.verdictText}</div>
          </div>
          ${createDetailsList([
            { label: 'Task', value: task.title },
            { label: 'Submitted by', value: assignee.name || assignee.email },
            { label: 'Priority', value: (task.priority || 'normal').toUpperCase() },
          ])}
        `, verdictColor)}

        <p>Please review the recording and the AI analysis results, then approve or provide feedback.</p>
      `,
      ctaButton: {
        text: 'Review Recording',
        url: `${frontendUrl}/tasks/${task.id}/review`,
        color: verdictColor,
      },
    });

    await this.sendEmail({ to: reviewer.email, subject, html });
    logger.info(`Review notification with analysis sent to ${reviewer.email} for task ${task.id}`);
  }

  // Send task rejection notification
  async sendTaskRejectionEmail(task: any, reviewer: any, assignee: any, feedback: string): Promise<void> {
    const subject = `Task Needs Revision: ${task.title}`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    const html = generateEmailTemplate({
      title: 'Task Requires Revision',
      preheader: `${reviewer.name || reviewer.email} requested changes to your submission`,
      headerColor: BRAND_COLORS.error,
      content: `
        <p>Hi ${assignee.name || assignee.email},</p>
        <p>Your task submission has been reviewed by <strong>${reviewer.name || reviewer.email}</strong> and requires some changes.</p>

        ${createFeedbackBlock(feedback, 'error')}

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: task.title },
            { label: 'Description', value: task.description || 'N/A' },
          ])}
        `, BRAND_COLORS.error)}

        <p>Please address the feedback and resubmit your recording.</p>
      `,
      ctaButton: {
        text: 'View Task',
        url: `${frontendUrl}/tasks/${task.id}`,
        color: BRAND_COLORS.error,
      },
    });

    await this.sendEmail({ to: assignee.email, subject, html });
    logger.info(`Task rejection notification sent to ${assignee.email} for task ${task.id}`);
  }

  // Send reminder emails
  async sendTaskReminderEmail(task: any, assignee: any): Promise<void> {
    const subject = `Reminder: Task "${task.title}" is due soon`;
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    const html = generateEmailTemplate({
      title: 'Task Reminder',
      preheader: `Your task "${task.title}" is due soon`,
      headerColor: BRAND_COLORS.warning,
      content: `
        <p>Hi ${assignee.name || assignee.email},</p>

        ${createInfoCard(`
          <strong>Your task "${task.title}" is due ${task.due_date ? `on ${new Date(task.due_date).toLocaleDateString()}` : 'soon'}.</strong>
        `, BRAND_COLORS.warning)}

        <p>Please complete and submit your recording as soon as possible.</p>
      `,
      ctaButton: {
        text: 'Go to Task',
        url: `${frontendUrl}/tasks/${task.id}`,
        color: BRAND_COLORS.warning,
      },
    });

    await this.sendEmail({ to: assignee.email, subject, html });
  }

  // Send external task approved notification
  async sendExternalTaskApprovedEmail(task: any, contributor: any, reviewer: any, feedback: string): Promise<void> {
    const subject = `Task Approved: ${task.title}`;

    const html = generateEmailTemplate({
      title: 'Task Approved!',
      preheader: 'Great news! Your recording has been approved.',
      headerColor: BRAND_COLORS.success,
      content: `
        <p>Hi ${contributor.first_name} ${contributor.last_name},</p>

        ${createSuccessCallout('Your recording has been approved!')}

        <p>Your recording has been reviewed and approved by <strong>${reviewer.name || reviewer.email}</strong>.</p>

        ${feedback ? createFeedbackBlock(feedback, 'success') : ''}

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: task.title },
            { label: 'Description', value: task.description || 'N/A' },
          ])}
        `, BRAND_COLORS.success)}

        <p>Thank you for your excellent work! We appreciate your contribution.</p>
      `,
    });

    await this.sendEmail({ to: contributor.email, subject, html });
    logger.info(`External task approval notification sent to ${contributor.email} for task ${task.id}`);
  }

  // Send external task rejected notification with new magic link
  async sendExternalTaskRejectedEmail(task: any, contributor: any, reviewer: any, feedback: string, newMagicLink: string): Promise<void> {
    const subject = `Task Needs Revision: ${task.title}`;

    const html = generateEmailTemplate({
      title: 'Task Requires Revision',
      preheader: `${reviewer.name || reviewer.email} requested changes to your submission`,
      headerColor: BRAND_COLORS.error,
      content: `
        <p>Hi ${contributor.first_name} ${contributor.last_name},</p>
        <p>Your recording has been reviewed by <strong>${reviewer.name || reviewer.email}</strong> and requires some changes before it can be approved.</p>

        ${createFeedbackBlock(feedback, 'error')}

        ${createInfoCard(`
          ${createDetailsList([
            { label: 'Task', value: task.title },
            { label: 'Description', value: task.description || 'N/A' },
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
        url: newMagicLink,
      },
      footer: createWarningNotice('This link is valid for 30 days and can be used multiple times for resubmissions.'),
    });

    await this.sendEmail({ to: contributor.email, subject, html });
    logger.info(`External task rejection notification sent to ${contributor.email} with new magic link for task ${task.id}`);
  }
}

export const emailService = new EmailService();