/**
 * Search API Routes
 * Provides full-text search across the application.
 */

import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import searchService from '../services/search.service';
import { getAsyncContext } from '../middleware/asyncContext';
import { logger } from '../utils/logger';
import { BadRequestError, UnauthorizedError } from '../utils/AppError';

const router = Router();

/**
 * GET /api/search
 * Global search across all entity types
 */
router.get(
  '/',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response) => {
    try {
      const {
        q: query,
        types,
        limit = '20',
        offset = '0',
        orderBy = 'relevance',
        dateFrom,
        dateTo,
      } = req.query;

      if (!query || typeof query !== 'string') {
        throw new BadRequestError('Search query (q) is required');
      }

      // Use org_id from enhanced auth (which also sets RLS context)
      const organizationId = req.user?.org_id || getAsyncContext()?.organization_id;

      if (!organizationId) {
        throw new UnauthorizedError('Organization context required');
      }

      const entityTypes = types
        ? (types as string).split(',').map(t => t.trim() as any)
        : ['all'];

      const results = await searchService.search(organizationId, {
        query,
        entityTypes,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        orderBy: orderBy as 'relevance' | 'date',
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      });

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Search error:', error);
      throw error;
    }
  }
);

/**
 * GET /api/search/tasks
 * Search within tasks
 */
router.get(
  '/tasks',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { q: query, limit = '20', offset = '0', status, priority } = req.query;

      if (!query || typeof query !== 'string') {
        throw new BadRequestError('Search query (q) is required');
      }

      const organizationId = req.user?.org_id || getAsyncContext()?.organization_id;

      if (!organizationId) {
        throw new UnauthorizedError('Organization context required');
      }

      const results = await searchService.searchTasks(organizationId, query, {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        status: status as string | undefined,
        priority: priority as string | undefined,
      });

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Task search error:', error);
      throw error;
    }
  }
);

/**
 * GET /api/search/recordings
 * Search within recordings (transcripts)
 */
router.get(
  '/recordings',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { q: query, limit = '20', offset = '0', taskId } = req.query;

      if (!query || typeof query !== 'string') {
        throw new BadRequestError('Search query (q) is required');
      }

      const organizationId = req.user?.org_id || getAsyncContext()?.organization_id;

      if (!organizationId) {
        throw new UnauthorizedError('Organization context required');
      }

      const results = await searchService.searchRecordings(organizationId, query, {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        taskId: taskId as string | undefined,
      });

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Recording search error:', error);
      throw error;
    }
  }
);

/**
 * GET /api/search/recordings/:recordingId/segments
 * Search within transcript segments
 */
router.get(
  '/recordings/:recordingId/segments',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { recordingId } = req.params;
      const { q: query, limit = '50' } = req.query;

      if (!query || typeof query !== 'string') {
        throw new BadRequestError('Search query (q) is required');
      }

      const organizationId = req.user?.org_id || getAsyncContext()?.organization_id;

      if (!organizationId) {
        throw new UnauthorizedError('Organization context required');
      }

      const segments = await searchService.searchTranscriptSegments(
        recordingId!,
        organizationId,
        query,
        { limit: parseInt(limit as string, 10) }
      );

      res.json({
        success: true,
        data: segments,
      });
    } catch (error) {
      logger.error('Segment search error:', error);
      throw error;
    }
  }
);

/**
 * GET /api/search/suggestions
 * Get search suggestions (autocomplete)
 */
router.get(
  '/suggestions',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { q: prefix, limit = '5' } = req.query;

      if (!prefix || typeof prefix !== 'string') {
        res.json({
          success: true,
          data: [],
        });
        return;
      }

      const organizationId = req.user?.org_id || getAsyncContext()?.organization_id;

      if (!organizationId) {
        throw new UnauthorizedError('Organization context required');
      }

      const suggestions = await searchService.getSuggestions(
        organizationId,
        prefix,
        parseInt(limit as string, 10)
      );

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      logger.error('Suggestions error:', error);
      throw error;
    }
  }
);

/**
 * POST /api/search/refresh-index
 * Refresh the search index (admin only)
 */
router.post(
  '/refresh-index',
  enhancedAuthenticate,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      // Check if user is admin
      if (!req.user?.is_system_admin) {
        throw new UnauthorizedError('Admin access required');
      }

      await searchService.refreshSearchIndex();

      res.json({
        success: true,
        message: 'Search index refreshed',
      });
    } catch (error) {
      logger.error('Refresh index error:', error);
      throw error;
    }
  }
);

export default router;
