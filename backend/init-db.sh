#!/bin/bash
# PostgreSQL initialization script
# This script sets up additional permissions for the database
# It runs automatically when the PostgreSQL container starts

set -e

echo "🔄 Initializing PostgreSQL database..."

# Enable UUID extension
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Enable UUID extension if not already enabled
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  -- Ensure the postgres user has full access
  GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
  GRANT ALL PRIVILEGES ON SCHEMA public TO $POSTGRES_USER;
EOSQL

echo "✅ PostgreSQL initialization complete!"
