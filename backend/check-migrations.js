#!/usr/bin/env node

/**
 * Check migration status and run only pending migrations
 */

const path = require('path');
const knex = require('knex');

async function checkMigrations() {
  try {
    // Load compiled knexfile
    const allConfigs = require('./knexfile.js');
    const knexConfig = allConfigs.default || allConfigs;
    const config = knexConfig.staging;

    if (!config.connection) {
      config.connection = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5433'),
        database: process.env.DB_NAME || 'cogveri_db|cogveri_user|cogveri_password',
        user: process.env.DB_USER || 'cogveri_db|cogveri_user|cogveri_password',
        password: process.env.DB_PASSWORD || 'cogveri_db|cogveri_user|cogveri_password',
      };
    }

    const db = knex(config);

    try {
      // Run pending migrations
      console.log('🔄 Running pending migrations...\n');
      const [batchNo, migrations] = await db.migrate.latest();

      if (migrations && migrations.length > 0) {
        console.log(`✅ Successfully ran ${migrations.length} migration(s):`);
        migrations.forEach((migration) => {
          console.log(`   ✓ ${migration}`);
        });
        console.log(`\n📊 Migration batch: ${batchNo}`);
      } else {
        console.log('✅ Database is up to date - all migrations completed');
      }
    } finally {
      await db.destroy();
    }
  } catch (error) {
    console.error('❌ Error:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }
}

checkMigrations();
