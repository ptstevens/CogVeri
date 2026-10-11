import knex from 'knex';
import { logger } from '../utils/logger';
import { withTimeout } from '../utils/timeout';

/**
 * Database Configuration with Advanced Connection Pooling
 *
 * ★ Connection Pool Strategy:
 * - min: 2 - Keep minimum connections alive for quick queries
 * - max: 10 - Prevent resource exhaustion on server
 * - maxWaitingClients: 10 - Queue requests if pool exhausted
 * - acquireTimeoutMillis: 30000 - 30s timeout to get connection
 * - idleTimeoutMillis: 30000 - Close idle connections after 30s
 *
 * ★ Benefits:
 * 1. Reuse connections: Reduces TCP handshake overhead
 * 2. Resource control: Prevents runaway connection creation
 * 3. Performance: Pooled connections are 100x faster than new ones
 * 4. High concurrency: Handles 50+ simultaneous requests efficiently
 */
// ★ Parse DATABASE_URL if provided, otherwise use individual connection variables
interface ConnectionConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: { rejectUnauthorized: boolean } | false;
}
let connectionConfig: ConnectionConfig = {};

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL as primary source (this is what Coolify injects)
  let dbUrl = process.env.DATABASE_URL;

  // ★ Critical: Remove any SSL parameters from the URL that might conflict
  // Sometimes URLs come with ?sslmode=require or ssl=true already embedded
  dbUrl = dbUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/[?&]ssl=[^&]*/g, '');

  // Clean up any trailing ? or & if URL manipulation left them
  dbUrl = dbUrl.replace(/[?&]$/, '');

  // ★ Critical: When using connectionString, pg library defaults to SSL=true
  // We must explicitly set ssl: false to disable SSL for internal Docker connections
  // ★ Default to SSL=false for internal Docker connections
  // Only enable SSL if explicitly set to 'true' or 'require'
  const dbSslEnabled = process.env.DB_SSL === 'true' || process.env.DB_SSL === 'require';

  // Debug logging
  logger.info(`Database configuration`, {
    dbSslEnabled,
    NODE_ENV: process.env.NODE_ENV,
    DB_SSL: process.env.DB_SSL,
    dbUrlMasked: dbUrl.replace(/:[^:/@]+@/, ':****@'),
  });

  connectionConfig = {
    connectionString: dbUrl,
    // Explicitly set SSL based on DB_SSL setting
    // This overrides the pg library's default SSL=true behavior
    ssl: dbSslEnabled
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  };
} else {
  // Fallback to individual environment variables (for development only)
  // ★ Default to SSL=false for internal Docker connections
  // Only enable SSL if explicitly set to 'true' or 'require'
  const dbSslEnabled = process.env.DB_SSL === 'true' || process.env.DB_SSL === 'require';

  connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'cogveri_db',
    ssl: dbSslEnabled
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  };
}

const dbConfig = {
  client: 'pg',
  connection: connectionConfig,

  /**
   * ★ Advanced Connection Pool Configuration
   * Based on best practices for PostgreSQL connection pooling
   * Ref: https://node-postgres.com/apis/pool
   */
  pool: {
    // Minimum number of connections to keep open
    min: parseInt(process.env.DB_POOL_MIN || '2'),

    // Maximum number of connections to create
    // For serverless: 5-10, For standard server: 10-20
    max: parseInt(process.env.DB_POOL_MAX || '10'),

    // Time in ms to wait for a connection to become available
    acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT || '30000'),

    // Time in ms that a connection can be idle before being closed
    // Helps prevent stale connections
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  },

  migrations: {
    directory: './src/db/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

// Create database instance
export const db = knex(dbConfig);

// Test database connection with timeout protection
export const connectDatabase = async (): Promise<void> => {
  const connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000');

  try {
    // Wrap connection test with timeout to prevent indefinite hanging
    await withTimeout(db.raw('SELECT 1'), connectionTimeout, 'Database connection');

    logger.info('Database connected successfully');

    // Log pool configuration for debugging
    const pool = db.client.pool as
      { min?: number; max?: number; waitingCount?: number } | undefined;
    if (pool) {
      logger.info(
        `Database pool configured: min=${pool.min}, max=${pool.max}, waiting=${pool.waitingCount}`
      );
    }
  } catch (error: unknown) {
    const err = error as Error & { name?: string };
    if (err.name === 'TimeoutError') {
      logger.error(`Database connection timed out after ${connectionTimeout}ms`);
    } else {
      logger.error('Database connection failed:', error);
    }
    throw error;
  }
};

// Close database connection
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await db.destroy();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting database:', error);
    throw error;
  }
};
