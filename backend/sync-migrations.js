#!/usr/bin/env node
/**
 * Sync Migration State
 *
 * Records migrations 001-017 as already executed since the database
 * schema already exists from previous runs. This allows migrations 018-021
 * (the new SaaS features) to execute properly.
 */

const knex = require('knex');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function syncMigrations() {
  // Database configuration
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
    console.log('🔄 Syncing migration state...');

    // Check if knex_migrations table exists
    const tableExists = await db.schema.hasTable('knex_migrations');

    if (!tableExists) {
      console.log('📋 Creating knex_migrations table...');
      await db.schema.createTable('knex_migrations', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.integer('batch');
        table.timestamp('migration_time').defaultTo(db.fn.now());
      });
    }

    // Get list of compiled migration files (001-017, existing migrations)
    const migrationsDir = path.join(__dirname, 'dist', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.js'))
      .sort();

    console.log(`📂 Found ${files.length} migration files in dist/migrations:`);
    files.forEach((f) => console.log(`   - ${f}`));

    // Record migrations 001-017 as already executed (batch 1)
    // Keep 018-021 unrecorded so they'll be picked up as pending
    const existingMigrations = files.filter((f) => {
      const num = parseInt(f.split('_')[0]);
      return num >= 1 && num <= 17;
    });

    console.log(`\n✏️  Recording ${existingMigrations.length} migrations as executed (batch 1)...`);

    for (const migration of existingMigrations) {
      const exists = await db('knex_migrations').where('name', migration).first();

      if (!exists) {
        await db('knex_migrations').insert({
          name: migration,
          batch: 1,
        });
        console.log(`   ✓ Recorded: ${migration}`);
      } else {
        console.log(`   ✓ Already recorded: ${migration}`);
      }
    }

    console.log('\n✅ Migration sync complete!');
    console.log('   Migrations 001-017: ✓ Recorded as executed');
    console.log('   Migrations 018-021: ⏳ Ready to execute as pending');
    console.log('\n📌 Next: Run "node run-migrations.js" to execute new migrations');
  } catch (error) {
    console.error('❌ Error syncing migrations:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

syncMigrations();
