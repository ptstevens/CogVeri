/**
 * Script to send test emails for all email templates
 * Usage: npx ts-node scripts/send-test-emails.ts <email-address>
 */

import 'dotenv/config';
import { getSendEmailQueue } from '../src/queues/definitions/send-email.queue';
import { EmailTemplate } from '../src/queues/types/job-types';

const TEST_EMAIL = process.argv[2] || 'paul.s@gatekeeperhq.com';

async function sendTestEmails() {
  console.log(`\n📧 Sending test emails to: ${TEST_EMAIL}\n`);

  const queue = getSendEmailQueue();
  const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

  const testEmails = [
    // 1. Task Assignment (Indigo header)
    {
      name: 'Task Assignment',
      data: {
        template: EmailTemplate.TASK_ASSIGNMENT,
        to: TEST_EMAIL,
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
        assigneeName: 'Paul',
      },
    },

    // 2. Task Completion / Ready for Review (Green header)
    {
      name: 'Task Completion (Reviewer Notification)',
      data: {
        template: EmailTemplate.TASK_COMPLETION,
        to: TEST_EMAIL,
        subject: '[TEST] Task Ready for Review: Contract Review Process',
        taskId: 'test-task-001',
        taskTitle: 'Contract Review Process',
        reviewerName: 'Paul',
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
        to: TEST_EMAIL,
        subject: '[TEST] Recording Ready for Review: Contract Review Process',
        taskId: 'test-task-001',
        taskTitle: 'Contract Review Process',
        taskDescription: 'Record yourself explaining the contract end date notification workflow.',
        taskPriority: 'high',
        reviewerName: 'Paul',
        assigneeName: 'Jane Doe',
        assigneeEmail: 'jane@example.com',
      },
    },

    // 4. Task Rejection - Internal User (Red header)
    {
      name: 'Task Rejection (Internal)',
      data: {
        template: EmailTemplate.TASK_REJECTION,
        to: TEST_EMAIL,
        subject: '[TEST] Task Requires Revision: Contract Review Process',
        taskId: 'test-task-001',
        taskTitle: 'Contract Review Process',
        taskDescription: 'Record yourself explaining the contract end date notification workflow.',
        reviewerName: 'Sarah Manager',
        reviewerEmail: 'sarah@example.com',
        assigneeName: 'Paul',
        feedback: 'Great start! However, please make sure to cover the notification timeline more clearly. Also, the audio was a bit quiet in the second half - please re-record with better microphone positioning.',
      },
    },

    // 5. Task Reminder (Amber header)
    {
      name: 'Task Reminder',
      data: {
        template: EmailTemplate.TASK_REMINDER,
        to: TEST_EMAIL,
        subject: '[TEST] Reminder: Task Due Soon - Contract Review Process',
        taskId: 'test-task-001',
        taskTitle: 'Contract Review Process',
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        assigneeName: 'Paul',
      },
    },

    // 6. External Task Approved (Green header)
    {
      name: 'External Task Approved',
      data: {
        template: EmailTemplate.EXTERNAL_TASK_APPROVED,
        to: TEST_EMAIL,
        subject: '[TEST] Your Recording Has Been Approved!',
        taskId: 'test-task-001',
        taskTitle: 'Contract Review Process',
        taskDescription: 'Record yourself explaining the contract end date notification workflow.',
        contributorFirstName: 'Paul',
        contributorLastName: 'Smith',
        reviewerName: 'Sarah Manager',
        reviewerEmail: 'sarah@example.com',
        feedback: 'Excellent explanation! Very clear and well-structured. Thank you for your contribution.',
      },
    },

    // 7. External Task Rejected / Redo Request (Red header) - THE ONE YOU ASKED ABOUT
    {
      name: 'External Task Rejected (Redo Request)',
      data: {
        template: EmailTemplate.EXTERNAL_TASK_REJECTED,
        to: TEST_EMAIL,
        subject: '[TEST] Task Requires Revision: Contract Review Process',
        taskId: 'test-task-001',
        taskTitle: 'Contract Review Process',
        taskDescription: 'Record yourself explaining the contract end date notification workflow.',
        contributorFirstName: 'Paul',
        contributorLastName: 'Smith',
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
        to: TEST_EMAIL,
        subject: '[TEST] Your Task Access Link',
        recipientName: 'Paul',
        magicLinkUrl: `${frontendUrl}/external/task/abc123-magic-link-token`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        taskTitle: 'Contract Review Process',
      },
    },
  ];

  console.log('Queueing emails...\n');

  let i = 0;
  for (const email of testEmails) {
    i++;
    try {
      await queue.addHighPriority(email.data as any);
      console.log(`✅ ${i}. ${email.name}`);
    } catch (error) {
      console.error(`❌ ${i}. ${email.name} - Failed:`, error);
    }
  }

  console.log('\n📬 All test emails queued! They should arrive shortly.\n');
  console.log('Templates sent:');
  console.log('  1. Task Assignment (Indigo banner)');
  console.log('  2. Task Completion (Green banner)');
  console.log('  3. Review Notification (Indigo banner)');
  console.log('  4. Task Rejection - Internal (Red banner)');
  console.log('  5. Task Reminder (Amber banner)');
  console.log('  6. External Task Approved (Green banner)');
  console.log('  7. External Task Rejected/Redo (Red banner) ← White logo fix');
  console.log('  8. Magic Link (Indigo banner)');
  console.log('');

  // Give time for the queue to process
  await new Promise((resolve) => setTimeout(resolve, 2000));
  process.exit(0);
}

sendTestEmails().catch((error) => {
  console.error('Failed to send test emails:', error);
  process.exit(1);
});
