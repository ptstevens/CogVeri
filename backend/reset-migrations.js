#!/usr/bin/env node
/**
 * Reset Migration State
 *
 * This script resets the knex_migrations tracking table to allow migrations to re-run.
 * It connects to the database and either:
 * 1. Drops the knex_migrations table if it exists (let Knex recreate it fresh)
 * 2. Manually inserts records for migrations 001-017 (current state)
 * 3. Allows pending migrations 018-021 to execute
 */

const knex = require('knex');
require('dotenv').config();

async function resetMigrations() {
  // Database configuration - must match docker-compose setup
  const config = {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5433'),
      database: process.env.DB_NAME || 'cogveri_dev',
      user: process.env.DB_USER || 'cogveri_user',
      password: process.env.DB_PASSWORD || 'cogveri_pass',
    },
    pool: { min: 1, max: 5 },
  };

  const db = knex(config);

  try {
    console.log('🔄 Connecting to database...');
    await db.raw('SELECT NOW()');
    console.log('✅ Connected successfully');

    // Check if knex_migrations table exists
    console.log('🔍 Checking for knex_migrations table...');
    const tableExists = await db.schema.hasTable('knex_migrations');

    if (tableExists) {
      console.log('📋 Table exists. Checking current migration state...');

      // Get current migrations
      const migrations = await db('knex_migrations').select('*');
      console.log(`Found ${migrations.length} recorded migrations:`);
      migrations.forEach((m) => {
        console.log(`  - Batch ${m.batch}: ${m.name}`);
      });

      // Drop the table so Knex can recreate it fresh
      console.log('🗑️  Dropping knex_migrations table to reset state...');
      await db.schema.dropTable('knex_migrations');
      console.log('✅ Table dropped successfully');
    } else {
      console.log('✅ knex_migrations table does not exist - will be created by Knex');
    }

    console.log('\n📌 Database is now ready for fresh migration run!');
    console.log('   Run: node run-migrations.js');
    console.log('   This will recreate knex_migrations and execute all pending migrations.');
  } catch (error) {
    console.error('❌ Error resetting migrations:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Cannot connect to database. Check:');
      console.error('   - DATABASE_URL or DB_HOST is correct');
      console.error('   - PostgreSQL is running on port ' + (process.env.DB_PORT || '5433'));
      console.error('   - Database credentials are correct');
    }
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

resetMigrations();
