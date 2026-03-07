import { Router, Request, Response, NextFunction } from 'express';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { getSendEmailQueue } from '../queues/definitions/send-email.queue';
import { EmailTemplate } from '../queues/types/job-types';
import { authenticate } from '../middleware/auth';
import { requireSystemAdmin } from '../middleware/system-admin.middleware';

const router = Router();

/**
 * Security middleware: Block ALL test routes in production
 * Test endpoints should NEVER be accessible in production environments
 */
router.use((req: Request, res: Response, next: NextFunction): void => {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    logger.warn('Attempted access to test endpoint in production', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

/**
 * Security middleware: Require system admin authentication on ALL test routes
 * Even in non-production environments, only system admins should trigger test emails.
 */
router.use(authenticate as any, requireSystemAdmin as any);

// Test email endpoint - DEVELOPMENT ONLY
router.post('/test-email', async (_req: Request, res: Response) => {
  try {
    // Create a test task object
    const testTask = {
      id: 'test-123',
      title: 'Test Task: Contract End Date Notification Workflow',
      description: 'This is a test task to verify email functionality is working correctly.',
      type: 'recording',
      priority: 'high',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      estimated_duration: 45,
      status: 'assigned'
    };

    // Create test users
    const testAssignee = {
      id: 'user-456',
      name: 'Test User',
      email: process.env.TEST_EMAIL || process.env.EMAIL_USER || 'test@example.com'
    };

    const testCreator = {
      id: 'user-789',
      name: 'Task Creator',
      email: 'creator@relay.com'
    };

    logger.info(`Attempting to send test email to: ${testAssignee.email}`);

    // Send the email
    await emailService.sendTaskAssignmentEmail(testTask, testAssignee, testCreator);

    res.json({
      success: true,
      message: `Test email sent successfully to ${testAssignee.email}`,
      details: {
        recipient: testAssignee.email,
        taskTitle: testTask.title,
        emailService: process.env.EMAIL_ENABLED === 'true' ? 'enabled' : 'disabled'
      }
    });
  } catch (error: any) {
    logger.error('Test email failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
});

/**
 * Send ALL email templates for testing - DEVELOPMENT ONLY
 * Usage: POST /api/test/send-all-test-emails?email=your@email.com
 */
router.post('/send-all-test-emails', async (req: Request, res: Response) => {
  const testEmail = req.query.email as string || req.body.email;

  if (!testEmail) {
    res.status(400).json({
      success: false,
      message: 'Email address required. Use ?email=your@email.com',
    });
    return;
  }

  try {
    const queue = getSendEmailQueue();
    const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

    const testEmails = [
      // 1. Task Assignment (Indigo header)
      {
        name: 'Task Assignment',
        data: {
          template: EmailTemplate.TASK_ASSIGNMENT,
          to: testEmail,
          subject: '[TEST] New Task Assigned: Contract Review Process',
          taskId: 'test-task-001',
          taskTitle: 'Contract Review Process',
          taskDescription: 'Record yourself explaining the contract end date notification workflow.',
          taskPriority: 'high',
          taskType: 'recording',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          estimatedDuration: 30,
          creatorName: 'Sarah Manager',
          creatorEmail: 'sarah@example.com',
          assigneeName: 'Test User',
        },
      },

      // 2. Task Completion / Ready for Review (Green header)
      {
        name: 'Task Completion (Reviewer Notification)',
        data: {
          template: EmailTemplate.TASK_COMPLETION,
          to: testEmail,
          subject: '[TEST] Task Ready for Review: Contract Review Process',
          taskId: 'test-task-001',
          taskTitle: 'Contract Review Process',
          reviewerName: 'Test Reviewer',
          assigneeName: 'John Contributor',
          assigneeEmail: 'john@example.com',
          actualDuration: 25,
        },
      },

      // 3. Review Notification (Indigo header - default)
      {
        name: 'Review Notification',
        data: {
          template: EmailTemplate.REVIEW_NOTIFICATION,
          to: testEmail,
          subject: '[TEST] Recording Ready for Review: Contract Review Process',
          taskId: 'test-task-001',
          taskTitle: 'Contract Review Process',
          taskDescription: 'Record yourself explaining the contract end date notification workflow.',
          taskPriority: 'high',
          reviewerName: 'Test Reviewer',
          assigneeName: 'Jane Doe',
          assigneeEmail: 'jane@example.com',
        },
      },

      // 4. Task Rejection - Internal User (Red header)
      {
        name: 'Task Rejection (Internal)',
        data: {
          template: EmailTemplate.TASK_REJECTION,
          to: testEmail,
          subject: '[TEST] Task Requires Revision: Contract Review Process',
          taskId: 'test-task-001',
          taskTitle: 'Contract Review Process',
          taskDescription: 'Record yourself explaining the contract end date notification workflow.',
          reviewerName: 'Sarah Manager',
          reviewerEmail: 'sarah@example.com',
          assigneeName: 'Test User',
          feedback: 'Great start! However, please make sure to cover the notification timeline more clearly. Also, the audio was a bit quiet in the second half - please re-record with better microphone positioning.',
        },
      },

      // 5. Task Reminder (Amber header)
      {
        name: 'Task Reminder',
        data: {
          template: EmailTemplate.TASK_REMINDER,
          to: testEmail,
          subject: '[TEST] Reminder: Task Due Soon - Contract Review Process',
          taskId: 'test-task-001',
          taskTitle: 'Contract Review Process',
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString(),
          assigneeName: 'Test User',
        },
      },

      // 6. External Task Approved (Green header)
      {
        name: 'External Task Approved',
        data: {
          template: EmailTemplate.EXTERNAL_TASK_APPROVED,
          to: testEmail,
          subject: '[TEST] Your Recording Has Been Approved!',
          taskId: 'test-task-001',
          taskTitle: 'Contract Review Process',
          taskDescription: 'Record yourself explaining the contract end date notification workflow.',
          contributorFirstName: 'Test',
          contributorLastName: 'User',
          reviewerName: 'Sarah Manager',
          reviewerEmail: 'sarah@example.com',
          feedback: 'Excellent explanation! Very clear and well-structured. Thank you for your contribution.',
        },
      },

      // 7. External Task Rejected / Redo Request (Red header) - WHITE LOGO TEST
      {
        name: 'External Task Rejected (Redo Request)',
        data: {
          template: EmailTemplate.EXTERNAL_TASK_REJECTED,
          to: testEmail,
          subject: '[TEST] Task Requires Revision: Contract Review Process',
          taskId: 'test-task-001',
          taskTitle: 'Contract Review Process',
          taskDescription: 'Record yourself explaining the contract end date notification workflow.',
          contributorFirstName: 'Test',
          contributorLastName: 'User',
          reviewerName: 'Sarah Manager',
          reviewerEmail: 'sarah@example.com',
          feedback: 'Thank you for your submission! The content was good, but unfortunately the video quality was too low and there was significant background noise. Please re-record in a quieter environment with better lighting.',
          newMagicLink: `${frontendUrl}/external/task/abc123-magic-link-token`,
        },
      },

      // 8. Magic Link (Indigo header - default)
      {
        name: 'Magic Link',
        data: {
          template: EmailTemplate.MAGIC_LINK,
          to: testEmail,
          subject: '[TEST] Your Task Access Link',
          recipientName: 'Test User',
          magicLinkUrl: `${frontendUrl}/external/task/abc123-magic-link-token`,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          taskTitle: 'Contract Review Process',
        },
      },
    ];

    logger.info(`Queueing ${testEmails.length} test emails to: ${testEmail}`);

    const results = [];
    for (const email of testEmails) {
      try {
        await queue.addHighPriority(email.data as any);
        results.push({ name: email.name, status: 'queued' });
        logger.info(`Queued test email: ${email.name}`);
      } catch (error: any) {
        results.push({ name: email.name, status: 'failed', error: error.message });
        logger.error(`Failed to queue test email: ${email.name}`, error);
      }
    }

    res.json({
      success: true,
      message: `${results.filter(r => r.status === 'queued').length} of ${testEmails.length} test emails queued`,
      recipient: testEmail,
      emails: results,
      templates: [
        '1. Task Assignment (Indigo banner)',
        '2. Task Completion (Green banner)',
        '3. Review Notification (Indigo banner)',
        '4. Task Rejection - Internal (Red banner)',
        '5. Task Reminder (Amber banner)',
        '6. External Task Approved (Green banner)',
        '7. External Task Rejected/Redo (Red banner) ← White logo test',
        '8. Magic Link (Indigo banner)',
      ],
    });
  } catch (error: any) {
    logger.error('Failed to send test emails:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to queue test emails',
      error: error.message,
    });
  }
});

export default router;