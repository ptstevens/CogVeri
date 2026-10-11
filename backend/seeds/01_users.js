'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.seed = seed;
const bcryptjs_1 = __importDefault(require('bcryptjs'));
async function seed(knex) {
  // Deletes ALL existing entries (in reverse order due to foreign keys)
  await knex('activity_logs').del();
  await knex('notifications').del();
  await knex('review_comments').del();
  await knex('reviews').del();
  await knex('recordings').del();
  await knex('tasks').del();
  await knex('users').del();
  // Hash password for demo users
  const hashedPassword = await bcryptjs_1.default.hash('password123', 10);
  // Insert seed users
  const users = await knex('users')
    .insert([
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'admin@relay.company.com',
        name: 'Admin User',
        password: hashedPassword,
        role: 'admin',
        is_active: true,
        department: 'IT',
        job_title: 'System Administrator',
        notification_preferences: JSON.stringify({
          email: true,
          slack: true,
          inApp: true,
        }),
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'manager@relay.company.com',
        name: 'Manager User',
        password: hashedPassword,
        role: 'manager',
        is_active: true,
        department: 'Engineering',
        job_title: 'Engineering Manager',
        notification_preferences: JSON.stringify({
          email: true,
          slack: true,
          inApp: true,
        }),
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'reviewer@relay.company.com',
        name: 'Reviewer User',
        password: hashedPassword,
        role: 'reviewer',
        is_active: true,
        department: 'Quality Assurance',
        job_title: 'QA Lead',
        manager_id: '22222222-2222-2222-2222-222222222222',
        notification_preferences: JSON.stringify({
          email: true,
          slack: false,
          inApp: true,
        }),
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'employee1@relay.company.com',
        name: 'John Doe',
        password: hashedPassword,
        role: 'employee',
        is_active: true,
        department: 'Engineering',
        job_title: 'Software Developer',
        manager_id: '22222222-2222-2222-2222-222222222222',
        notification_preferences: JSON.stringify({
          email: true,
          slack: true,
          inApp: true,
        }),
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        email: 'employee2@relay.company.com',
        name: 'Jane Smith',
        password: hashedPassword,
        role: 'employee',
        is_active: true,
        department: 'Marketing',
        job_title: 'Marketing Specialist',
        manager_id: '22222222-2222-2222-2222-222222222222',
        notification_preferences: JSON.stringify({
          email: false,
          slack: true,
          inApp: true,
        }),
      },
      {
        id: '66666666-6666-6666-6666-666666666666',
        email: 'employee3@relay.company.com',
        name: 'Bob Johnson',
        password: hashedPassword,
        role: 'employee',
        is_active: true,
        department: 'Sales',
        job_title: 'Sales Representative',
        notification_preferences: JSON.stringify({
          email: true,
          slack: false,
          inApp: true,
        }),
      },
    ])
    .returning('*');
  console.log(`Seeded ${users.length} users`);
}
//# sourceMappingURL=01_users.js.map
