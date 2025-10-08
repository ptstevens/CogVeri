import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';

const router = Router();

// Test email endpoint
router.post('/test-email', async (req: AuthenticatedRequest, res: Response) => {
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

export default router;