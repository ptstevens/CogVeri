#!/usr/bin/env node

/**
 * Custom migration runner that bypasses Knex CLI module loading issues
 * Runs migrations programmatically using Knex instance
 *
 * IMPORTANT: This runner normalizes migration names to handle .ts/.js extension mismatch.
 * Development uses .ts files, but production uses compiled .js files.
 * We normalize all migration tracking to use .js extension for consistency.
 */

const path = require('path');
const fs = require('fs');
const knex = require('knex');

async function runMigrations() {
  try {
    // Parse DATABASE_URL or use individual env variables
    const databaseUrl = process.env.DATABASE_URL;
    const migrationsDir = path.join(__dirname, 'dist', 'migrations');
    let config;

    if (databaseUrl) {
      // Parse DATABASE_URL format: postgresql://user:password@host:port/database
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
        migrations: {
          directory: migrationsDir,
          tableName: 'knex_migrations',
          extension: 'js',
        },
        pool: { min: 1, max: 5 },
      };
    } else {
      // Fallback to individual env variables
      config = {
        client: 'postgresql',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'cogveri_db',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
        },
        migrations: {
          directory: migrationsDir,
          tableName: 'knex_migrations',
          extension: 'js',
        },
        pool: { min: 1, max: 5 },
      };
    }

    const db = knex(config);

    console.log('🔄 Starting migrations...');
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📁 Migrations directory: ${migrationsDir}`);

    try {
      // List migration files in directory for debugging
      if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js') && !f.endsWith('.map'));
        console.log(`📋 Found ${files.length} migration files in directory`);

        // Show last 5 migrations for context
        const lastFive = files.slice(-5);
        console.log(`   Latest migrations: ${lastFive.join(', ')}`);
      } else {
        console.error(`❌ Migrations directory does not exist: ${migrationsDir}`);
        process.exit(1);
      }

      // Check if knex_migrations table exists (it won't on a fresh database)
      const tableExists = await db.schema.hasTable('knex_migrations');

      if (tableExists) {
        // CRITICAL FIX: Normalize .ts extensions to .js in knex_migrations table
        // This handles the mismatch between development (.ts) and production (.js)
        console.log('\n🔧 Checking for .ts/.js extension mismatch...');
        const tsEntries = await db('knex_migrations')
          .where('name', 'like', '%.ts')
          .select('id', 'name');

        if (tsEntries.length > 0) {
          console.log(`   Found ${tsEntries.length} migrations with .ts extension, normalizing to .js...`);
          for (const entry of tsEntries) {
            const newName = entry.name.replace(/\.ts$/, '.js');
            await db('knex_migrations')
              .where('id', entry.id)
              .update({ name: newName });
            console.log(`   ✓ ${entry.name} → ${newName}`);
          }
          console.log(`   ✅ Normalized ${tsEntries.length} migration entries`);
        } else {
          console.log('   ✅ No extension mismatch found');
        }

        // Check current migration status
        const currentMigrations = await db('knex_migrations').select('name').orderBy('id', 'desc').limit(5);
        console.log(`\n📊 Last 5 applied migrations:`);
        currentMigrations.forEach(m => console.log(`   • ${m.name}`));
      } else {
        console.log('\n📦 Fresh database detected - knex_migrations table will be created');
      }

      // Run all pending migrations
      console.log('\n🚀 Running pending migrations...');
      const [batch, log] = await db.migrate.latest();

      if (log.length > 0) {
        console.log(`✅ Successfully ran ${log.length} migration(s) in batch ${batch}`);
        log.forEach(migration => {
          console.log(`   ✓ ${migration}`);
        });
      } else {
        console.log('✅ No pending migrations to run');
      }

    } finally {
      await db.destroy();
    }

    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run migrations
runMigrations();
