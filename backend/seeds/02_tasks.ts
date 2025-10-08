import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Insert seed tasks
  const tasks = await knex('tasks').insert([
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      title: 'Dashboard Navigation Demo',
      description: 'Record a demonstration of navigating through the main dashboard and its key features.',
      instructions: '1. Login to the application\n2. Navigate to the dashboard\n3. Show all main widgets\n4. Demonstrate filtering options\n5. Export a report',
      type: 'recording',
      status: 'assigned',
      created_by: '22222222-2222-2222-2222-222222222222', // Manager
      assigned_to: '44444444-4444-4444-4444-444444444444', // John Doe
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      min_duration_seconds: 120,
      max_duration_seconds: 600,
      required_features: JSON.stringify(['dashboard', 'widgets', 'filters', 'export']),
      evaluation_criteria: JSON.stringify({
        clarity: 'Clear voice and screen capture',
        completeness: 'All features demonstrated',
        accuracy: 'Correct usage shown'
      }),
      priority: 'high',
      category: 'onboarding',
      tags: ['dashboard', 'navigation', 'basics']
    },
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      title: 'Customer Management Module',
      description: 'Demonstrate the complete customer management workflow including CRUD operations.',
      instructions: '1. Create a new customer\n2. Edit customer details\n3. Search and filter customers\n4. Delete a customer\n5. Show audit trail',
      type: 'recording',
      status: 'in_progress',
      created_by: '22222222-2222-2222-2222-222222222222',
      assigned_to: '55555555-5555-5555-5555-555555555555', // Jane Smith
      started_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started yesterday
      due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      min_duration_seconds: 300,
      max_duration_seconds: 900,
      priority: 'medium',
      category: 'training',
      tags: ['customer', 'crud', 'management']
    },
    {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      title: 'Live Sales Presentation Demo',
      description: 'Conduct a live demonstration of the sales presentation module with a reviewer.',
      type: 'live_demo',
      status: 'assigned',
      created_by: '22222222-2222-2222-2222-222222222222',
      assigned_to: '66666666-6666-6666-6666-666666666666', // Bob Johnson
      reviewed_by: '33333333-3333-3333-3333-333333333333', // Reviewer
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      min_duration_seconds: 600,
      priority: 'low',
      category: 'compliance',
      tags: ['sales', 'presentation', 'live']
    },
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      title: 'Security Features Overview',
      description: 'Record an overview of all security features including authentication, authorization, and audit logging.',
      type: 'recording',
      status: 'submitted',
      created_by: '22222222-2222-2222-2222-222222222222',
      assigned_to: '44444444-4444-4444-4444-444444444444', // John Doe
      submitted_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      priority: 'urgent',
      category: 'compliance',
      tags: ['security', 'authentication', 'audit']
    },
    {
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      title: 'Reporting Module Walkthrough',
      description: 'Demonstrate how to create, customize, and export reports.',
      type: 'recording',
      status: 'completed',
      created_by: '22222222-2222-2222-2222-222222222222',
      assigned_to: '55555555-5555-5555-5555-555555555555', // Jane Smith
      reviewed_by: '33333333-3333-3333-3333-333333333333',
      submitted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      completed_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      priority: 'medium',
      category: 'training',
      tags: ['reporting', 'analytics', 'export']
    }
  ]).returning('*');

  console.log(`Seeded ${tasks.length} tasks`);
}