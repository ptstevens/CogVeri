#!/usr/bin/env node

/**
 * PRODUCTION Database Reset Script
 *
 * This script is triggered by:
 * 1. Setting WIPE_DATABASE_ON_START=true in Coolify environment
 * 2. Creating a RESET_DB_NOW file in the container
 *
 * Environment Variables:
 *   SUPER_ADMIN_EMAIL    - Admin email (default: admin@cogveri.com)
 *   SUPER_ADMIN_PASSWORD - Admin password (REQUIRED - no default for security)
 *   DATABASE_URL         - PostgreSQL connection string (REQUIRED)
 *   DB_USER              - Database user for schema permissions (default: cogveri_user)
 */

const { execSync } = require('child_process');
const knex = require('knex');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function resetProductionDatabase() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              CogVeri Production Database Reset                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  // Validate required environment variables
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@cogveri.com';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('❌ Error: SUPER_ADMIN_PASSWORD environment variable is required for production reset');
    console.error('   Set this in Coolify environment variables before triggering reset');
    process.exit(1);
  }

  const dbUser = process.env.DB_USER || 'cogveri_user';
  const env = { ...process.env, NODE_OPTIONS: '--no-warnings' };

  const scriptDb = knex({
    client: 'pg',
    connection: databaseUrl,
  });

  try {
    console.log('🚨 WARNING: THIS WILL WIPE ALL DATA IN PRODUCTION 🚨\n');
    console.log(`📊 Database: ${databaseUrl.split('@')[1]?.split('/')[1] || 'configured'}`);
    console.log(`👤 Admin: ${adminEmail}`);
    console.log('');

    // 1. Wipe everything
    // Strategy: Try DROP SCHEMA (superuser) → Fall back to DROP TABLE CASCADE (table owner)
    console.log('🔥 Wiping database...');

    try {
      // Try DROP SCHEMA first (requires superuser/owner)
      await scriptDb.raw('DROP SCHEMA public CASCADE');
      await scriptDb.raw('CREATE SCHEMA public');
      await scriptDb.raw('GRANT ALL ON SCHEMA public TO public');
      await scriptDb.raw('GRANT ALL ON SCHEMA public TO ' + dbUser);
      console.log('✅ Schema wiped and recreated (superuser mode).');
    } catch (schemaError) {
      // Fallback: Drop all tables individually (works with table owner permissions)
      console.log('⚠️  Cannot drop schema (not owner). Dropping tables individually...');

      // Get all tables owned by this user
      const tablesResult = await scriptDb.raw(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename != 'spatial_ref_sys'
        AND tablename != 'knex_migrations'
        AND tablename != 'knex_migrations_lock'
      `);

      const tables = tablesResult.rows.map(r => r.tablename);
      console.log(`   Found ${tables.length} tables to drop...`);

      if (tables.length > 0) {
        // Drop all tables with CASCADE - this handles FK dependencies automatically
        // No need for session_replication_role since CASCADE handles constraints
        let dropped = 0;
        let failed = 0;

        for (const table of tables) {
          try {
            await scriptDb.raw(`DROP TABLE IF EXISTS "${table}" CASCADE`);
            dropped++;
          } catch (dropError) {
            console.log(`   ⚠️  Cannot drop ${table}: ${dropError.message}`);
            failed++;
          }
        }

        console.log(`   Dropped ${dropped} tables${failed > 0 ? `, ${failed} failed` : ''}`);
      }

      // Also drop the migration tables so we start fresh
      try {
        await scriptDb.raw('DROP TABLE IF EXISTS knex_migrations CASCADE');
        await scriptDb.raw('DROP TABLE IF EXISTS knex_migrations_lock CASCADE');
        console.log('   Dropped migration tracking tables');
      } catch (err) {
        // Ignore - tables might not exist
      }

      console.log('✅ All tables cleared.');
    }

    // 2. Run Migrations (Recreate Schema)
    console.log('\n🏗️  Running migrations...');
    execSync('npx knex migrate:latest', { stdio: 'inherit', env });
    console.log('✅ Migrations complete.');

    // 3. Create System Organization with Enterprise tier (unlimited access for SUPER_ADMIN)
    console.log('\n🏢 Creating System Organization...');
    const orgId = uuidv4();
    const orgSlug = 'cogveri-system'; // URL-safe slug for storage path
    await scriptDb('organizations').insert({
      id: orgId,
      name: 'CogVeri System',
      slug: orgSlug,
      is_active: true,
      subscription_tier: 'enterprise',
      max_tasks: -1,           // Unlimited
      max_users: -1,           // Unlimited
      max_storage_gb: -1,      // Unlimited
      owner_email: adminEmail.toLowerCase(),
      subscriber_email: adminEmail.toLowerCase(),
      subscriber_email_verified_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    console.log(`✅ Created Organization: CogVeri System (Enterprise tier)`);

    // Create storage folder structure in S3/R2
    console.log('\n📁 Creating storage folders...');
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET) {
      console.log('⚠️ S3 not configured (missing credentials), skipping storage folder creation');
      console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'set' : 'NOT SET'}`);
      console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'set' : 'NOT SET'}`);
      console.log(`   AWS_S3_BUCKET: ${process.env.AWS_S3_BUCKET || 'NOT SET'}`);
    } else {
      try {
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Config = {
          region: process.env.AWS_REGION || 'auto',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        };
        if (process.env.AWS_ENDPOINT_URL) {
          s3Config.endpoint = process.env.AWS_ENDPOINT_URL;
          s3Config.forcePathStyle = true;
          console.log(`   Using custom endpoint: ${process.env.AWS_ENDPOINT_URL}`);
        }
        console.log(`   Bucket: ${process.env.AWS_S3_BUCKET}`);

        const s3 = new S3Client(s3Config);
        const bucket = process.env.AWS_S3_BUCKET;
        const folders = [`${orgSlug}/recordings/.keep`, `${orgSlug}/rubrics/.keep`];

        for (const key of folders) {
          console.log(`   Creating: ${key}...`);
          await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: '',
            ContentType: 'application/x-empty',
          }));
        }
        console.log(`✅ Storage folders created in ${bucket}`);
      } catch (s3Error) {
        console.error('❌ Failed to create S3 storage folders:', s3Error.message);
        if (s3Error.Code) console.error(`   Error Code: ${s3Error.Code}`);
        if (s3Error.$metadata) console.error(`   HTTP Status: ${s3Error.$metadata.httpStatusCode}`);
        console.error('   Full error:', s3Error);
        // Don't throw - continue with reset but warn admin
        console.log('⚠️ Continuing with reset despite S3 folder creation failure...');
      }
    }

    // 4. Create Super Admin User
    console.log('\n👤 Creating Super Admin...');
    const adminId = uuidv4();
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    const adminName = process.env.SUPER_ADMIN_NAME || 'System Administrator';
    await scriptDb('users').insert({
      id: adminId,
      email: adminEmail.toLowerCase(),
      password: hashedPassword,
      name: adminName,
      role: 'admin',
      system_role: 'SUPER_ADMIN',
      is_system_admin: true,
      system_admin_since: new Date(),
      organization_id: orgId,
      org_role: 'owner',
      org_status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: new Date(),
    });

    // Set the owner_id for the organization
    await scriptDb('organizations').where('id', orgId).update({ owner_id: adminId });

    // Add admin to organization_members table (new multi-org model)
    await scriptDb('organization_members').insert({
      user_id: adminId,
      organization_id: orgId,
      role: 'owner',
      status: 'active',
      joined_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    console.log(`✅ Created Super Admin: ${adminEmail}`);

    // 4b. Create secondary admin (optional - driven entirely by env vars)
    const secondaryAdminEmail = process.env.SECONDARY_ADMIN_EMAIL;
    const secondaryAdminPassword = process.env.SECONDARY_ADMIN_PASSWORD;
    const secondaryAdminName = process.env.SECONDARY_ADMIN_NAME || 'Secondary Admin';

    if (secondaryAdminEmail && secondaryAdminPassword) {
      console.log(`\n👤 Creating Secondary Admin (${secondaryAdminName})...`);
      const secondaryId = uuidv4();
      const secondaryHashedPassword = await bcrypt.hash(secondaryAdminPassword, 12);

      await scriptDb('users').insert({
        id: secondaryId,
        email: secondaryAdminEmail.toLowerCase(),
        password: secondaryHashedPassword,
        name: secondaryAdminName,
        role: 'admin',
        system_role: null,      // NOT a SYSADMIN - can be granted later by primary admin
        is_system_admin: false,
        system_admin_since: null,
        organization_id: orgId,
        org_role: 'admin',
        org_status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      });

      await scriptDb('organization_members').insert({
        user_id: secondaryId,
        organization_id: orgId,
        role: 'admin',
        status: 'active',
        joined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });
      console.log(`✅ Created Secondary Admin: ${secondaryAdminEmail} (${secondaryAdminName})`);
    } else {
      console.log('\n⏭️  No SECONDARY_ADMIN_EMAIL/PASSWORD set — skipping secondary admin creation.');
    }

    // 5. Seed Rate Limit Rules
    console.log('\n⚡ Seeding rate limit rules...');
    await scriptDb('rate_limit_rules').insert([
      {
        organization_id: orgId,
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
        organization_id: orgId,
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
        organization_id: orgId,
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
    ]);
    console.log('✅ Seeded 3 rate limit rules (free, pro, enterprise).');

    // 6. System templates are created by migration 041 - just verify they exist
    console.log('\n📋 Checking system templates (created by migration 041)...');
    const templateCount = await scriptDb('task_templates')
      .where('is_system_default', true)
      .count('* as count')
      .first();
    const count = Number(templateCount?.count) || 0;
    console.log(`✅ Found ${count} system templates (created by migration 041).`);

    // Summary
    const secondaryLine = process.env.SECONDARY_ADMIN_EMAIL
      ? `   ✅ Secondary admin created: ${process.env.SECONDARY_ADMIN_EMAIL}`
      : `   ⏭️  No secondary admin (SECONDARY_ADMIN_EMAIL not set)`;

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    Production Reset Complete!                    ║
╚══════════════════════════════════════════════════════════════════╝

📊 Summary:
   ✅ Schema reset and migrations applied
   ✅ System organization created (Enterprise tier, unlimited limits)
   ✅ Super admin created: ${adminEmail} (SYSADMIN)
${secondaryLine}
   ✅ Rate limit rules: 3 (free, pro, enterprise)
   ✅ System templates: ${count}

🔐 Login Credentials:
   Primary: ${adminEmail} — password as set in SUPER_ADMIN_PASSWORD

⚠️  IMPORTANT: Remove WIPE_DATABASE_ON_START from environment vars now!
`);

  } catch (error) {
    console.error('❌ Error resetting production database:', error);
    process.exit(1);
  } finally {
    await scriptDb.destroy();
  }
}

resetProductionDatabase();
