#!/bin/sh

# Startup script for Relay backend
# Handles migrations and starts the application
# Seeds are NOT run in production - they delete all user data!

set -e

echo "🚀 Starting Relay backend..."
echo "🔍 Debug: WIPE_DATABASE_ON_START is [${WIPE_DATABASE_ON_START}]"

# Support for automated production reset
if [ -f "RESET_DB_NOW" ] || [ "${WIPE_DATABASE_ON_START}" = "true" ]; then
    echo "🚨 RESET TRIGGER DETECTED! (File or Env Var) 🚨"
    echo "🔥 Running production reset script..."
    node run-reset-prod.js
    rm -f RESET_DB_NOW
    echo "✅ Reset complete. If you used an env var, please remove it now!"
else
    # Always run migrations (safe - Knex tracks which ones have run)
    echo "📋 Running standard database migrations..."
    node run-migrations.js
fi

# NOTE: Seeds are intentionally NOT run here because:
# 1. Seed script unconditionally deletes ALL user data (tasks, recordings, reviews)
# 2. Containers are ephemeral - marker files don't survive redeployments
# 3. Seeds should only run in development or when explicitly triggered
# 4. Production data must never be wiped automatically
#
# To seed the database manually, run: node run-seeds.js

# Start the application
echo "🎯 Starting application server..."
node dist/index.js
