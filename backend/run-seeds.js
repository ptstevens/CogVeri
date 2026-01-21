#!/usr/bin/env node

/**
 * Custom seed runner for database seeding
 * Seeds production-ready data for CogVeri
 */

const path = require('path');
const knex = require('knex');

async function runSeeds() {
  try {
    // Parse DATABASE_URL or use individual env variables
    const databaseUrl = process.env.DATABASE_URL;
    let config;

    if (databaseUrl) {
      const url = new URL(databaseUrl);
      config = {
        client: 'postgresql',
        connection: {
          host: url.hostname,
          port: parseInt(url.port) || 5432,
          database: url.pathname.slice(1),
          user: url.username,
          password: url.password,
        },
        pool: { min: 1, max: 5 },
      };
    } else {
      config = {
        client: 'postgresql',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'cogveri_db',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
        },
        pool: { min: 1, max: 5 },
      };
    }

    const db = knex(config);

    console.log('🌱 Starting database seeding...');
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);

    try {
      // Check if data already exists
      const existingOrgs = await db('organizations').count('id as count').first();
      if (parseInt(existingOrgs.count) > 0) {
        console.log('📋 Database already has data, skipping seed...');
        console.log('   Use WIPE_DATABASE_ON_START=true to reset and reseed');
        await db.destroy();
        process.exit(0);
      }

      // Production password hashes (bcrypt)
      const adminPasswordHash = '$2b$12$G3oCIB0/5jOXuL/kWhR.nufqrJyvDrKddlsJGYYpRS4wBEnh3UBAK';
      const stevePasswordHash = '$2b$12$QtAoE9AxGK8XZ2k/abKCS.EzgNBzAqZ1wY2UzlGMKNJz2MX6bRdtS';

      // Insert organization first
      console.log('🏢 Creating organization...');
      await db('organizations').insert({
        id: '12e89168-7afa-445c-9f90-ff23b4e37c59',
        name: 'CogVeri System',
        slug: 'cogveri-system', // URL-safe slug for storage path
        owner_id: '8292c9df-7547-4277-86fd-8ca0127c5dd0',
        billing_email: 'admin@cogveri.com',
        contact_email: 'admin@cogveri.com',
        is_active: true,
        subscription_tier: 'enterprise',
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log('   ✓ Organization created');

      // Create storage folder structure in S3/R2
      console.log('📁 Creating storage folders...');
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET) {
        console.log('   ⚠ S3 not configured (missing credentials), skipping storage folder creation');
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
          const orgSlug = 'cogveri-system';
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
          console.log(`   ✓ Storage folders created in ${bucket}`);
        } catch (s3Error) {
          console.error('   ❌ Failed to create S3 storage folders:', s3Error.message);
          if (s3Error.Code) console.error(`   Error Code: ${s3Error.Code}`);
          if (s3Error.$metadata) console.error(`   HTTP Status: ${s3Error.$metadata.httpStatusCode}`);
          console.error('   Full error:', s3Error);
          // Don't throw - continue with seed but warn admin
          console.log('   ⚠ Continuing with seed despite S3 folder creation failure...');
        }
      }

      // Insert users
      console.log('👥 Creating users...');
      await db('users').insert([
        {
          id: '8292c9df-7547-4277-86fd-8ca0127c5dd0',
          email: 'admin@cogveri.com',
          name: 'System Admin',
          password: adminPasswordHash,
          role: 'admin',
          auth_provider: 'local',
          organization_id: '12e89168-7afa-445c-9f90-ff23b4e37c59',
          org_role: 'owner',
          org_status: 'active',
          system_role: 'SUPER_ADMIN',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: '664be585-f639-4304-9871-be005ee34cac',
          email: 'cogveri.blitz180@passmail.net',
          name: 'Steve',
          password: stevePasswordHash,
          role: 'employee',
          auth_provider: 'local',
          organization_id: '12e89168-7afa-445c-9f90-ff23b4e37c59',
          invited_by: '12e89168-7afa-445c-9f90-ff23b4e37c59',
          org_role: 'admin',
          org_status: 'active',
          system_role: 'SUPER_ADMIN',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
      console.log('   ✓ 2 users created (admin@cogveri.com, cogveri.blitz180@passmail.net)');

      // Insert rate limit rules
      console.log('⚡ Creating rate limit rules...');
      await db('rate_limit_rules').insert([
        {
          id: '8f215a98-8f9f-40ef-9fb9-5bcb922cd304',
          organization_id: '12e89168-7afa-445c-9f90-ff23b4e37c59',
          tier: 'free',
          requests_per_minute: 30,
          requests_per_hour: 1000,
          requests_per_day: 10000,
          max_upload_size_mb: 50,
          endpoint_limits: JSON.stringify({
            'POST /api/tasks': { per_hour: 500, per_minute: 20 },
            'GET /api/recordings': { per_hour: 1000, per_minute: 60 },
            'POST /api/recordings': { per_hour: 100, per_minute: 5 }
          }),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: '607dc92c-e500-4240-a719-44acd7646c96',
          organization_id: '12e89168-7afa-445c-9f90-ff23b4e37c59',
          tier: 'pro',
          requests_per_minute: 300,
          requests_per_hour: 10000,
          requests_per_day: 100000,
          max_upload_size_mb: 500,
          endpoint_limits: JSON.stringify({
            'POST /api/tasks': { per_hour: 5000, per_minute: 100 },
            'GET /api/recordings': { per_hour: 10000, per_minute: 300 },
            'POST /api/recordings': { per_hour: 1000, per_minute: 50 }
          }),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: '630d5a7b-9541-4291-8f8e-0e788bcff0d8',
          organization_id: '12e89168-7afa-445c-9f90-ff23b4e37c59',
          tier: 'enterprise',
          requests_per_minute: 1000,
          requests_per_hour: 50000,
          requests_per_day: 500000,
          max_upload_size_mb: 2000,
          endpoint_limits: JSON.stringify({
            'POST /api/tasks': { per_hour: 25000, per_minute: 500 },
            'GET /api/recordings': { per_hour: 50000, per_minute: 1000 },
            'POST /api/recordings': { per_hour: 5000, per_minute: 200 }
          }),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
      console.log('   ✓ 3 rate limit tiers created (free, pro, enterprise)');

      console.log('\n✅ All seeds completed successfully!');
      console.log('   📧 admin@cogveri.com - SUPER_ADMIN');
      console.log('   📧 cogveri.blitz180@passmail.net - SUPER_ADMIN');

    } finally {
      await db.destroy();
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Seeding failed:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run seeds
runSeeds();
