import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Defense-in-depth middleware: Block all debug routes in production
 * This is a secondary safety measure in case the route mounting check is bypassed
 */
router.use((req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Attempted access to debug endpoint in production', {
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

/**
 * Debug endpoint to check environment configuration
 * WARNING: This endpoint is ONLY available in development environments
 */
router.get('/config', (_req: Request, res: Response) => {
  const config = {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasJwtRefreshSecret: !!process.env.JWT_REFRESH_SECRET,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlFormat: process.env.DATABASE_URL
      ? `${process.env.DATABASE_URL.split('@')[0]?.split('://')[0]}://***:***@${process.env.DATABASE_URL.split('@')[1]?.split('/')[0]}/***`
      : 'NOT SET',
    corsOrigin: process.env.CORS_ORIGIN || 'NOT SET',
    timestamp: new Date().toISOString(),
  };

  logger.info('Debug config check:', config);

  res.json({
    status: 'ok',
    config,
    warnings: [
      ...(!process.env.JWT_SECRET ? ['Missing JWT_SECRET'] : []),
      ...(!process.env.DATABASE_URL ? ['Missing DATABASE_URL'] : []),
      ...(!process.env.CORS_ORIGIN ? ['Missing CORS_ORIGIN'] : []),
    ],
  });
});

/**
 * Test database connection
 */
router.get('/db', async (_req: Request, res: Response) => {
  try {
    const { db } = await import('../config/database');

    // Try a simple query
    const result = await db.raw('SELECT NOW() as current_time');

    res.json({
      status: 'ok',
      database: 'connected',
      currentTime: result.rows[0].current_time,
    });
  } catch (error: any) {
    logger.error('Database test failed:', error);

    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message,
    });
  }
});

/**
 * Test user table exists
 */
router.get('/db/tables', async (_req: Request, res: Response) => {
  try {
    const { db } = await import('../config/database');

    // Check if users table exists
    const tables = await db.raw(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    res.json({
      status: 'ok',
      tables: tables.rows.map((r: any) => r.table_name),
    });
  } catch (error: any) {
    logger.error('Table check failed:', error);

    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

export default router;
