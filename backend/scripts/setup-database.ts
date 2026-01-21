#!/usr/bin/env ts-node
/**
 * Unified Database Setup Script
 *
 * Usage:
 *   npx ts-node scripts/setup-database.ts [options]
 *
 * Options:
 *   --reset             Drop all data and recreate schema (DESTRUCTIVE!)
 *   --admin-email=X     Super admin email (default: SUPER_ADMIN_EMAIL env or admin@cogveri.com)
 *   --admin-pass=X      Super admin password (default: SUPER_ADMIN_PASSWORD env or auto-generated)
 *   --skip-templates    Skip seeding system default templates
 *   --skip-rate-limits  Skip seeding rate limit rules
 *   --admin-only        Only create/update super admin (skip reset/seeds)
 *   --help              Show this help message
 *
 * Examples:
 *   npm run db:reset:full                              # Full reset with defaults
 *   npm run db:reset:full -- --admin-email=me@co.com   # Custom admin email
 *   npm run db:setup:admin                             # Just create admin user
 */

import knex from 'knex';
import bcrypt from 'bcrypt';
import { execSync } from 'child_process';
import crypto from 'crypto';

const { v4: uuidv4 } = require('uuid');

// =====================
// Configuration
// =====================

interface ScriptOptions {
  reset: boolean;
  adminEmail: string;
  adminPassword: string;
  skipTemplates: boolean;
  skipRateLimits: boolean;
  adminOnly: boolean;
  showHelp: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);

  const options: ScriptOptions = {
    reset: false,
    adminEmail: process.env.SUPER_ADMIN_EMAIL || 'admin@cogveri.com',
    adminPassword: process.env.SUPER_ADMIN_PASSWORD || generateSecurePassword(),
    skipTemplates: false,
    skipRateLimits: false,
    adminOnly: false,
    showHelp: false,
  };

  for (const arg of args) {
    if (arg === '--reset') {
      options.reset = true;
    } else if (arg === '--skip-templates') {
      options.skipTemplates = true;
    } else if (arg === '--skip-rate-limits') {
      options.skipRateLimits = true;
    } else if (arg === '--admin-only') {
      options.adminOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      options.showHelp = true;
    } else if (arg.startsWith('--admin-email=')) {
      options.adminEmail = arg.split('=')[1];
    } else if (arg.startsWith('--admin-pass=')) {
      options.adminPassword = arg.split('=')[1];
    }
  }

  return options;
}

function generateSecurePassword(): string {
  return crypto.randomBytes(12).toString('base64').slice(0, 16);
}

function showHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                  CogVeri Database Setup Script                  ║
╚══════════════════════════════════════════════════════════════════╝

Usage:
  npx ts-node scripts/setup-database.ts [options]

Options:
  --reset             Drop all data and recreate schema (DESTRUCTIVE!)
  --admin-email=X     Super admin email (default: admin@cogveri.com)
  --admin-pass=X      Super admin password (default: auto-generated)
  --skip-templates    Skip template check (templates created via migration 041)
  --skip-rate-limits  Skip seeding rate limit rules
  --admin-only        Only create/update super admin
  --help, -h          Show this help message

NOTE: System templates are now created via migration 041_replace_system_templates.ts
      This script only checks that they exist.
`);
}

// =====================
// Database Connection
// =====================

function getDbConnection() {
  const dbUser = process.env.DB_USER || 'cogveri_user';
  const dbPass = process.env.DB_PASSWORD || 'cogveri_password';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5454';
  const dbName = process.env.DB_NAME || 'cogveri_multitenant';

  const connectionString = `postgres://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`;

  return {
    connectionString,
    env: {
      ...process.env,
      DB_PORT: dbPort,
      DB_HOST: dbHost,
      DB_USER: dbUser,
      DB_PASSWORD: dbPass,
      DB_NAME: dbName,
      DATABASE_URL: connectionString,
      NODE_ENV: 'development',
    },
    knex: knex({
      client: 'pg',
      connection: connectionString,
    }),
    dbUser,
  };
}

// =====================
// Main Operations
// =====================

async function resetSchema(db: knex.Knex, dbUser: string): Promise<void> {
  console.log('\n🔥 Wiping database (DROP SCHEMA public CASCADE)...');
  try {
    await db.raw('DROP SCHEMA public CASCADE');
    await db.raw('CREATE SCHEMA public');
    await db.raw('GRANT ALL ON SCHEMA public TO public');
    await db.raw('GRANT ALL ON SCHEMA public TO ' + dbUser);
    console.log('✅ Schema wiped and recreated.');
  } catch (e: any) {
    console.error('❌ Error wiping schema:', e.message);
    throw e;
  }
}

async function runMigrations(env: NodeJS.ProcessEnv): Promise<number> {
  console.log('\n🏗️  Running migrations...');
  try {
    execSync('npm run db:migrate', { stdio: 'inherit', env: env as any });
    console.log('✅ Migrations complete.');
    return 0;
  } catch (e: any) {
    console.error('❌ Error running migrations:', e.message);
    throw e;
  }
}

async function createSuperAdmin(
  db: knex.Knex,
  email: string,
  password: string
): Promise<{ userId: string; organizationId?: string; isNew: boolean }> {
  console.log('\n👤 Setting up Super Admin...');

  const existingUser = await db('users').where('email', email.toLowerCase()).first();

  if (existingUser) {
    await db('users').where('id', existingUser.id).update({
      system_role: 'SUPER_ADMIN',
      is_system_admin: true,
      system_admin_since: existingUser.system_admin_since || new Date(),
      updated_at: new Date(),
    });
    console.log(`✅ Existing user ${email} updated with Super Admin privileges.`);
    return { userId: existingUser.id, organizationId: existingUser.organization_id, isNew: false };
  }

  const systemOrgId = uuidv4();
  const systemOrg = {
    id: systemOrgId,
    name: 'CogVeri System',
    is_active: true,
    subscription_tier: 'system',
    owner_email: email.toLowerCase(),
    subscriber_email: email.toLowerCase(),
    subscriber_email_verified_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  await db('organizations').insert(systemOrg);
  console.log(`✅ Created System Organization: ${systemOrg.name}`);

  const superAdminId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, 12);

  const superAdmin = {
    id: superAdminId,
    email: email.toLowerCase(),
    password: hashedPassword,
    name: 'System Admin',
    organization_id: systemOrgId,
    org_role: 'owner',
    org_status: 'active',
    role: 'admin',
    system_role: 'SUPER_ADMIN',
    is_system_admin: true,
    system_admin_since: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: new Date(),
  };

  await db('users').insert(superAdmin);
  await db('organizations').where('id', systemOrgId).update({ owner_id: superAdminId });

  // Add admin to organization_members table (new multi-org model)
  await db('organization_members').insert({
    user_id: superAdminId,
    organization_id: systemOrgId,
    role: 'owner',
    status: 'active',
    joined_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  });

  const hasRolesTable = await db.schema.hasTable('roles');
  if (hasRolesTable) {
    const superAdminRole = await db('roles').where('name', 'super_admin').first();
    if (superAdminRole) {
      await db('user_roles').insert({
        user_id: superAdminId,
        role_id: superAdminRole.id,
        assigned_at: new Date(),
      });
      await db('users').where('id', superAdminId).update({
        primary_role_id: superAdminRole.id,
      });
      console.log(`✅ Assigned 'super_admin' RBAC role.`);
    }
  }

  console.log(`✅ Created Super Admin: ${email}`);
  return { userId: superAdminId, organizationId: systemOrgId, isNew: true };
}

async function seedRateLimitRules(db: knex.Knex, systemOrgId: string): Promise<number> {
  console.log('\n⚡ Seeding rate limit rules...');

  const existingRules = await db('rate_limit_rules').count('* as count').first();
  if (existingRules && Number(existingRules.count) > 0) {
    console.log(`✅ Rate limit rules already exist (${existingRules.count} rules). Skipping.`);
    return Number(existingRules.count);
  }

  const rateLimitRules = [
    {
      organization_id: systemOrgId,
      tier: 'free',
      requests_per_minute: 30,
      requests_per_hour: 1000,
      requests_per_day: 10000,
      burst_limit: 50,
      endpoint_limits: JSON.stringify({
        'POST /api/recordings': { per_minute: 5, per_hour: 100 },
        'GET /api/recordings': { per_minute: 60, per_hour: 1000 },
        'POST /api/tasks': { per_minute: 20, per_hour: 500 },
      }),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      organization_id: systemOrgId,
      tier: 'pro',
      requests_per_minute: 300,
      requests_per_hour: 10000,
      requests_per_day: 100000,
      burst_limit: 500,
      endpoint_limits: JSON.stringify({
        'POST /api/recordings': { per_minute: 50, per_hour: 1000 },
        'GET /api/recordings': { per_minute: 300, per_hour: 10000 },
        'POST /api/tasks': { per_minute: 100, per_hour: 5000 },
      }),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      organization_id: systemOrgId,
      tier: 'enterprise',
      requests_per_minute: 1000,
      requests_per_hour: 50000,
      requests_per_day: 500000,
      burst_limit: 2000,
      endpoint_limits: JSON.stringify({
        'POST /api/recordings': { per_minute: 200, per_hour: 5000 },
        'GET /api/recordings': { per_minute: 1000, per_hour: 50000 },
        'POST /api/tasks': { per_minute: 500, per_hour: 25000 },
      }),
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  await db('rate_limit_rules').insert(rateLimitRules);
  console.log(`✅ Seeded ${rateLimitRules.length} rate limit rules (free, pro, enterprise).`);
  return rateLimitRules.length;
}

/**
 * Check system templates exist (created by migration 041)
 * This script no longer creates templates - migration 041 handles that.
 */
async function checkSystemTemplates(db: knex.Knex): Promise<number> {
  console.log('\n📋 Checking system templates (created via migration 041)...');

  const existingTemplates = await db('task_templates')
    .where('is_system_default', true)
    .count('* as count')
    .first();

  const count = Number(existingTemplates?.count) || 0;

  if (count === 0) {
    console.log('⚠️  No system templates found. Migration 041 may not have run yet.');
  } else {
    console.log(`✅ Found ${count} system templates.`);
  }

  return count;
}

// =====================
// Main Execution
// =====================

async function main() {
  const options = parseArgs();

  if (options.showHelp) {
    showHelp();
    process.exit(0);
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                  CogVeri Database Setup Script                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  const { knex: db, env, dbUser } = getDbConnection();

  console.log(`📊 Database: ${process.env.DB_NAME || 'cogveri_multitenant'}`);
  console.log(`🌐 Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5454'}`);

  try {
    await db.raw('SELECT 1');
    console.log('✅ Database connection successful.');

    let templateCount = 0;
    let rateLimitCount = 0;
    let adminResult: { userId: string; organizationId?: string; isNew: boolean } | null = null;
    const passwordWasGenerated = !process.env.SUPER_ADMIN_PASSWORD && !process.argv.includes('--admin-pass');

    if (options.reset && !options.adminOnly) {
      console.log('\n⚠️  WARNING: This will DELETE ALL DATA in the database!');
      console.log('    Proceeding in 3 seconds...');
      await new Promise((r) => setTimeout(r, 3000));

      await resetSchema(db, dbUser);
      await runMigrations(env);
    }

    adminResult = await createSuperAdmin(db, options.adminEmail, options.adminPassword);

    if (!options.skipRateLimits && !options.adminOnly && adminResult?.organizationId) {
      rateLimitCount = await seedRateLimitRules(db, adminResult.organizationId);
    }

    if (!options.skipTemplates && !options.adminOnly) {
      templateCount = await checkSystemTemplates(db);
    }

    const finalMigrations = await db('knex_migrations').count('* as count').first();
    const finalTemplates = await db('task_templates')
      .where('is_system_default', true)
      .count('* as count')
      .first();
    const finalRateLimits = await db('rate_limit_rules').count('* as count').first();

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                         Setup Complete!                          ║
╚══════════════════════════════════════════════════════════════════╝

📊 Summary:
   ✅ Migrations applied: ${finalMigrations?.count || 'N/A'}
   ✅ System templates: ${finalTemplates?.count || 0}
   ✅ Rate limit rules: ${finalRateLimits?.count || 0}
   ✅ Super Admin: ${adminResult?.isNew ? 'Created' : 'Updated'}

🔐 Login Credentials:
   Email: ${options.adminEmail}
   Password: ${passwordWasGenerated ? options.adminPassword : '[as provided]'}
   ${passwordWasGenerated ? '\n   ⚠️  SAVE THIS PASSWORD - it was auto-generated!' : ''}

🚀 You can now start the server with: npm run dev
`);

    await db.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Setup failed:', error.message);
    await db.destroy();
    process.exit(1);
  }
}

main();
