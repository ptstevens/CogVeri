import { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  // PRODUCTION SAFEGUARD: Prevent accidental data destruction
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowProdSeed = process.env.ALLOW_PRODUCTION_SEED === 'true';

  if (nodeEnv === 'production' && !allowProdSeed) {
    console.warn('⚠️  Seed aborted: Running seeds in production is disabled.');
    console.warn('   Set ALLOW_PRODUCTION_SEED=true to override (dangerous!)');
    return;
  }

  if (nodeEnv === 'production' && allowProdSeed) {
    console.warn('⚠️  WARNING: Running seed in production mode!');
  }

  // Define organization ID for all test users
  const ORG_ID = '00000000-0000-0000-0000-000000000001';

  // Deletes ALL existing entries (in reverse order due to foreign keys)
  await knex('activity_logs').del();
  await knex('notifications').del();
  await knex('review_comments').del();
  await knex('reviews').del();
  await knex('recordings').del();
  await knex('tasks').del();
  await knex('users').del();

  // Hash passwords - SUPER_ADMIN gets production password, others get demo password
  const superAdminPassword = await bcrypt.hash('Cogveri2025!', 12);
  const demoPassword = await bcrypt.hash('password123', 10);

  // Insert seed users
  const users = await knex('users').insert([
    {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@cogveri.com',
      name: 'Paul Stevens',
      password: superAdminPassword,
      role: 'admin',
      is_active: true,
      is_system_admin: true,
      system_role: 'SUPER_ADMIN',
      organization_id: ORG_ID,
      org_role: 'owner',
      org_status: 'active',
      department: 'Platform',
      job_title: 'System Administrator',
      notification_preferences: JSON.stringify({
        email: true,
        slack: true,
        inApp: true
      })
    },
    {
      id: '11111111-1111-1111-1111-111111111112',
      email: '***REDACTED_EMAIL***',
      name: '***REDACTED_NAME***',
      password: superAdminPassword,
      role: 'admin',
      is_active: true,
      is_system_admin: false,  // Not a SYSADMIN - can be granted later by admin@cogveri.com
      organization_id: ORG_ID,
      org_role: 'admin',
      org_status: 'active',
      department: 'Platform',
      job_title: 'Administrator',
      notification_preferences: JSON.stringify({
        email: true,
        slack: true,
        inApp: true
      })
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'manager@cogveri.app',
      name: 'Manager User',
      password: demoPassword,
      role: 'manager',
      is_active: true,
      organization_id: ORG_ID,
      org_role: 'admin',
      org_status: 'active',
      department: 'Engineering',
      job_title: 'Engineering Manager',
      notification_preferences: JSON.stringify({
        email: true,
        slack: true,
        inApp: true
      })
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'reviewer@cogveri.app',
      name: 'Reviewer User',
      password: demoPassword,
      role: 'reviewer',
      is_active: true,
      organization_id: ORG_ID,
      org_role: 'member',
      org_status: 'active',
      department: 'Quality Assurance',
      job_title: 'QA Lead',
      manager_id: '22222222-2222-2222-2222-222222222222',
      notification_preferences: JSON.stringify({
        email: true,
        slack: false,
        inApp: true
      })
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'employee1@cogveri.app',
      name: 'John Doe',
      password: demoPassword,
      role: 'employee',
      is_active: true,
      organization_id: ORG_ID,
      org_role: 'member',
      org_status: 'active',
      department: 'Engineering',
      job_title: 'Software Developer',
      manager_id: '22222222-2222-2222-2222-222222222222',
      notification_preferences: JSON.stringify({
        email: true,
        slack: true,
        inApp: true
      })
    },
    {
      id: '55555555-5555-5555-5555-555555555555',
      email: 'employee2@cogveri.app',
      name: 'Jane Smith',
      password: demoPassword,
      role: 'employee',
      is_active: true,
      organization_id: ORG_ID,
      org_role: 'member',
      org_status: 'active',
      department: 'Marketing',
      job_title: 'Marketing Specialist',
      manager_id: '22222222-2222-2222-2222-222222222222',
      notification_preferences: JSON.stringify({
        email: false,
        slack: true,
        inApp: true
      })
    },
    {
      id: '66666666-6666-6666-6666-666666666666',
      email: 'employee3@cogveri.app',
      name: 'Bob Johnson',
      password: demoPassword,
      role: 'employee',
      is_active: true,
      organization_id: ORG_ID,
      org_role: 'member',
      org_status: 'active',
      department: 'Sales',
      job_title: 'Sales Representative',
      notification_preferences: JSON.stringify({
        email: true,
        slack: false,
        inApp: true
      })
    }
  ]).returning('*');

  // Set the SUPER_ADMIN as owner of the organization
  // This is required for migration 046 to find and upgrade to Enterprise tier
  const ADMIN_USER_ID = '11111111-1111-1111-1111-111111111111';
  await knex('organizations')
    .where('id', ORG_ID)
    .update({
      owner_id: ADMIN_USER_ID,
      owner_email: 'admin@cogveri.com',
    });

  // Add all users to organization_members table (new multi-org model)
  const now = new Date();
  const memberships = [
    { user_id: '11111111-1111-1111-1111-111111111111', role: 'owner' },   // admin@cogveri.com
    { user_id: '11111111-1111-1111-1111-111111111112', role: 'admin' },   // ***REDACTED_EMAIL***
    { user_id: '22222222-2222-2222-2222-222222222222', role: 'admin' },   // manager@cogveri.app
    { user_id: '33333333-3333-3333-3333-333333333333', role: 'reviewer' }, // reviewer@cogveri.app
    { user_id: '44444444-4444-4444-4444-444444444444', role: 'limited' }, // employee1@cogveri.app
    { user_id: '55555555-5555-5555-5555-555555555555', role: 'limited' }, // employee2@cogveri.app
    { user_id: '66666666-6666-6666-6666-666666666666', role: 'limited' }, // employee3@cogveri.app
  ];

  await knex('organization_members').insert(
    memberships.map(m => ({
      user_id: m.user_id,
      organization_id: ORG_ID,
      role: m.role,
      status: 'active',
      joined_at: now,
      created_at: now,
      updated_at: now,
    }))
  );

  console.log(`Seeded ${users.length} users`);
  console.log(`Seeded ${memberships.length} organization memberships`);
  console.log(`Set organization owner to SUPER_ADMIN (admin@cogveri.com)`);
}