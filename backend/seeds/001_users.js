'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.seed = seed;
const bcrypt_1 = __importDefault(require('bcrypt'));
async function seed(knex) {
  // Delete in reverse order of dependencies
  await knex('review_comments').del();
  await knex('reviews').del();
  await knex('activity_logs').del();
  await knex('notifications').del();
  await knex('recordings').del();
  await knex('tasks').del();
  await knex('users').del();
  const hashedPassword = await bcrypt_1.default.hash('password123', 10);
  // Inserts seed entries
  await knex('users').insert([
    {
      id: knex.raw('gen_random_uuid()'),
      email: 'admin@relay.company.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
      department: 'IT',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: knex.raw('gen_random_uuid()'),
      email: 'manager1@relay.company.com',
      password: hashedPassword,
      name: 'John Manager',
      role: 'manager',
      department: 'Engineering',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: knex.raw('gen_random_uuid()'),
      email: 'employee1@relay.company.com',
      password: hashedPassword,
      name: 'Jane Employee',
      role: 'employee',
      department: 'Engineering',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: knex.raw('gen_random_uuid()'),
      email: 'employee2@relay.company.com',
      password: hashedPassword,
      name: 'Bob Developer',
      role: 'employee',
      department: 'Engineering',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: knex.raw('gen_random_uuid()'),
      email: 'reviewer1@relay.company.com',
      password: hashedPassword,
      name: 'Alice Reviewer',
      role: 'reviewer',
      department: 'Quality Assurance',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
  console.log('✅ Users table seeded successfully');
}
//# sourceMappingURL=001_users.js.map
