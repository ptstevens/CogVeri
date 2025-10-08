import knex from 'knex';
import { logger } from '../utils/logger';

// Database configuration
const dbConfig = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'relay_user',
    password: process.env.DB_PASSWORD || 'relay_password',
    database: process.env.DB_NAME || 'relay_db',
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

// Create database instance
export const db = knex(dbConfig);

// Test database connection
export const connectDatabase = async (): Promise<void> => {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed:', error);
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