/**
 * Search Service
 * Provides full-text search across tasks, recordings, and users
 * using PostgreSQL's native full-text search capabilities.
 *
 * SECURITY: All queries use parameterized statements to prevent SQL injection.
 */

import { db } from '../config/database';
import { logger } from '../utils/logger';

export type SearchEntityType = 'task' | 'recording' | 'user' | 'all';

export interface SearchResult {
  entityType: 'task' | 'recording' | 'user';
  entityId: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  query: string;
  entityTypes?: SearchEntityType[];
  limit?: number;
  offset?: number;
  orderBy?: 'relevance' | 'date';
  dateFrom?: Date;
  dateTo?: Date;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  took: number;
}

/**
 * Maximum search results per query (prevents DoS)
 */
const MAX_SEARCH_LIMIT = 100;
const DEFAULT_SEARCH_LIMIT = 20;

class SearchService {
  /**
   * Perform a global search across all entity types
   * Uses UNION ALL with parameterized queries for security
   */
  async search(organizationId: string, options: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();
    const {
      query,
      entityTypes = ['all'],
      limit = DEFAULT_SEARCH_LIMIT,
      offset = 0,
      orderBy = 'relevance',
      dateFrom,
      dateTo,
    } = options;

    // Validate and sanitize limit
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);

    if (!query || query.trim().length < 2) {
      return {
        results: [],
        total: 0,
        query,
        took: Date.now() - startTime,
      };
    }

    try {
      // Prepare the search query for PostgreSQL (sanitizes input)
      const searchQuery = this.prepareSearchQuery(query);

      if (!searchQuery) {
        return {
          results: [],
          total: 0,
          query,
          took: Date.now() - startTime,
        };
      }

      // Determine which entity types to include
      const includeAll = entityTypes.includes('all');
      const includeTasks = includeAll || entityTypes.includes('task');
      const includeRecordings = includeAll || entityTypes.includes('recording');
      const includeUsers = includeAll || entityTypes.includes('user');

      // Build parameterized queries for each entity type
      const unionParts: string[] = [];
      const allParams: any[] = [];

      if (includeTasks) {
        unionParts.push(this.getTaskSearchSQL());
        // Each task search SQL has 3 parameter placeholders for searchQuery
        allParams.push(searchQuery, searchQuery, searchQuery);
      }

      if (includeRecordings) {
        unionParts.push(this.getRecordingSearchSQL());
        // Each recording search SQL has 3 parameter placeholders for searchQuery
        allParams.push(searchQuery, searchQuery, searchQuery);
      }

      if (includeUsers) {
        unionParts.push(this.getUserSearchSQL());
        // Each user search SQL has 2 parameter placeholders for searchQuery
        allParams.push(searchQuery, searchQuery);
      }

      if (unionParts.length === 0) {
        return {
          results: [],
          total: 0,
          query,
          took: Date.now() - startTime,
        };
      }

      // Build the complete SQL with proper parameter placeholders
      const unionSQL = unionParts.join(' UNION ALL ');

      // Build WHERE clause conditions
      const whereConditions = ['organization_id = ?'];
      const whereParams: (string | Date)[] = [organizationId];

      if (dateFrom) {
        whereConditions.push('created_at >= ?');
        whereParams.push(dateFrom);
      }

      if (dateTo) {
        whereConditions.push('created_at <= ?');
        whereParams.push(dateTo);
      }

      // Order by clause (safe - not user controlled)
      const orderClause = orderBy === 'relevance' ? 'relevance_score DESC' : 'created_at DESC';

      // Execute main search query with all parameters properly bound
      const mainSQL = `
        WITH search_results AS (
          ${unionSQL}
        )
        SELECT
          entity_type,
          entity_id,
          title,
          snippet,
          relevance_score,
          created_at,
          metadata
        FROM search_results
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY ${orderClause}
        LIMIT ?
        OFFSET ?
      `;

      const mainParams = [...allParams, ...whereParams, safeLimit, offset];
      const results = await db.raw(mainSQL, mainParams);

      // Execute count query
      const countSQL = `
        WITH search_results AS (
          ${unionSQL}
        )
        SELECT COUNT(*)::int as total
        FROM search_results
        WHERE ${whereConditions.join(' AND ')}
      `;

      const countParams = [...allParams, ...whereParams];
      const countResult = await db.raw(countSQL, countParams);

      const searchResults: SearchResult[] = results.rows.map((row: any) => ({
        entityType: row.entity_type,
        entityId: row.entity_id,
        title: row.title,
        snippet: row.snippet,
        relevanceScore: parseFloat(row.relevance_score) || 0,
        createdAt: row.created_at,
        metadata: row.metadata
          ? typeof row.metadata === 'string'
            ? JSON.parse(row.metadata)
            : row.metadata
          : undefined,
      }));

      const took = Date.now() - startTime;

      logger.info('Search completed', {
        query: query.substring(0, 50), // Truncate for logging
        organizationId,
        resultCount: searchResults.length,
        totalCount: countResult.rows[0]?.total || 0,
        took,
      });

      return {
        results: searchResults,
        total: countResult.rows[0]?.total || 0,
        query,
        took,
      };
    } catch (error) {
      logger.error('Search failed', { error, query: query.substring(0, 50), organizationId });
      throw error;
    }
  }

  /**
   * Search within tasks only
   * Uses Knex query builder with proper parameterization
   */
  async searchTasks(
    organizationId: string,
    query: string,
    options: {
      limit?: number;
      offset?: number;
      status?: string;
      priority?: string;
    } = {}
  ): Promise<{ results: any[]; total: number }> {
    const { limit = DEFAULT_SEARCH_LIMIT, offset = 0, status, priority } = options;
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const searchQuery = this.prepareSearchQuery(query);

    if (!searchQuery) {
      return { results: [], total: 0 };
    }

    let baseQuery = db('tasks')
      .select(
        'tasks.*',
        db.raw(`ts_rank(search_vector, websearch_to_tsquery('english', ?)) as relevance_score`, [
          searchQuery,
        ]),
        db.raw(
          `ts_headline('english', COALESCE(description, ''), websearch_to_tsquery('english', ?), 'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') as snippet`,
          [searchQuery]
        )
      )
      .where('organization_id', organizationId)
      .whereRaw(`search_vector @@ websearch_to_tsquery('english', ?)`, [searchQuery]);

    if (status) {
      baseQuery = baseQuery.where('status', status);
    }

    if (priority) {
      baseQuery = baseQuery.where('priority', priority);
    }

    const results = await baseQuery
      .orderBy('relevance_score', 'desc')
      .limit(safeLimit)
      .offset(offset);

    // Build count query separately
    let countQuery = db('tasks')
      .count('* as total')
      .where('organization_id', organizationId)
      .whereRaw(`search_vector @@ websearch_to_tsquery('english', ?)`, [searchQuery]);

    if (status) {
      countQuery = countQuery.where('status', status);
    }
    if (priority) {
      countQuery = countQuery.where('priority', priority);
    }

    const countResult = await countQuery;
    const total = (countResult[0] as { total?: string | number })?.total ?? 0;

    return { results, total: Number(total) };
  }

  /**
   * Search within recordings (transcripts)
   * Uses Knex query builder with proper parameterization
   */
  async searchRecordings(
    organizationId: string,
    query: string,
    options: {
      limit?: number;
      offset?: number;
      taskId?: string;
    } = {}
  ): Promise<{ results: any[]; total: number }> {
    const { limit = DEFAULT_SEARCH_LIMIT, offset = 0, taskId } = options;
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const searchQuery = this.prepareSearchQuery(query);

    if (!searchQuery) {
      return { results: [], total: 0 };
    }

    let baseQuery = db('recordings')
      .select(
        'recordings.*',
        db.raw(
          `ts_rank(transcript_tsvector, websearch_to_tsquery('english', ?)) as relevance_score`,
          [searchQuery]
        ),
        db.raw(
          `ts_headline('english', COALESCE(transcript_text, ''), websearch_to_tsquery('english', ?), 'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') as snippet`,
          [searchQuery]
        )
      )
      .where('organization_id', organizationId)
      .where('transcription_status', 'completed')
      .whereRaw(`transcript_tsvector @@ websearch_to_tsquery('english', ?)`, [searchQuery]);

    if (taskId) {
      baseQuery = baseQuery.where('task_id', taskId);
    }

    const results = await baseQuery
      .orderBy('relevance_score', 'desc')
      .limit(safeLimit)
      .offset(offset);

    let countQuery = db('recordings')
      .count('* as total')
      .where('organization_id', organizationId)
      .where('transcription_status', 'completed')
      .whereRaw(`transcript_tsvector @@ websearch_to_tsquery('english', ?)`, [searchQuery]);

    if (taskId) {
      countQuery = countQuery.where('task_id', taskId);
    }

    const countResult = await countQuery;
    const total = (countResult[0] as { total?: string | number })?.total ?? 0;

    return { results, total: Number(total) };
  }

  /**
   * Search for transcript segments containing a phrase
   * Uses parameterized ILIKE for safe pattern matching
   */
  async searchTranscriptSegments(
    recordingId: string,
    organizationId: string,
    query: string,
    options: { limit?: number } = {}
  ): Promise<any[]> {
    const { limit = 50 } = options;
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);

    // Verify recording belongs to organization
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      return [];
    }

    // Sanitize query for LIKE pattern (escape special LIKE characters)
    const sanitizedQuery = this.sanitizeForLike(query);

    // Search segments with parameterized ILIKE
    const segments = await db('transcription_segments')
      .where('recording_id', recordingId)
      .whereRaw('LOWER(text) LIKE LOWER(?)', [`%${sanitizedQuery}%`])
      .orderBy('segment_index')
      .limit(safeLimit);

    return segments;
  }

  /**
   * Get search suggestions (autocomplete)
   * Uses parameterized queries for prefix search
   */
  async getSuggestions(
    organizationId: string,
    prefix: string,
    limit: number = 5
  ): Promise<string[]> {
    if (!prefix || prefix.length < 2) {
      return [];
    }

    const safeLimit = Math.min(Math.max(1, limit), 20);

    // Prepare prefix for tsquery (sanitized)
    const sanitizedPrefix = this.prepareSearchQuery(prefix);
    if (!sanitizedPrefix) {
      return [];
    }

    const searchPrefix = `${sanitizedPrefix}:*`;

    // Get task title suggestions with parameterized query
    const taskSuggestions = await db('tasks')
      .distinct('title')
      .where('organization_id', organizationId)
      .whereRaw(`search_vector @@ to_tsquery('english', ?)`, [searchPrefix])
      .limit(safeLimit);

    return taskSuggestions.map((t: any) => t.title);
  }

  /**
   * Refresh the global search index materialized view
   */
  async refreshSearchIndex(): Promise<void> {
    try {
      await db.raw('SELECT refresh_global_search_index()');
      logger.info('Global search index refreshed');
    } catch (error) {
      logger.error('Failed to refresh search index', { error });
      throw error;
    }
  }

  /**
   * Prepare a search query for PostgreSQL tsquery
   * Sanitizes input to prevent injection and ensure valid tsquery syntax
   */
  private prepareSearchQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return '';
    }

    // Clean and prepare the query:
    // 1. Trim whitespace
    // 2. Remove characters that could break tsquery or enable injection
    // 3. Only allow alphanumeric, spaces, and hyphens
    // 4. Filter out very short words
    const cleaned = query
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .split(/\s+/)
      .filter((word) => word.length >= 2)
      .slice(0, 10) // Limit to 10 words to prevent abuse
      .join(' ');

    return cleaned;
  }

  /**
   * Sanitize a string for use in LIKE patterns
   * Escapes special LIKE characters: %, _, \
   */
  private sanitizeForLike(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/%/g, '\\%') // Escape percent
      .replace(/_/g, '\\_'); // Escape underscore
  }

  /**
   * Get parameterized SQL for task search
   * Uses ? placeholders for safe parameter binding
   * Parameters needed: searchQuery (x3)
   */
  private getTaskSearchSQL(): string {
    return `
      SELECT
        'task' as entity_type,
        id::text as entity_id,
        organization_id,
        title,
        ts_headline('english', COALESCE(description, ''), websearch_to_tsquery('english', ?), 'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') as snippet,
        ts_rank(search_vector, websearch_to_tsquery('english', ?)) as relevance_score,
        created_at,
        jsonb_build_object('status', status, 'priority', priority, 'task_type', type)::text as metadata
      FROM tasks
      WHERE search_vector @@ websearch_to_tsquery('english', ?)
        AND status != 'archived'
    `;
  }

  /**
   * Get parameterized SQL for recording search
   * Uses ? placeholders for safe parameter binding
   * Parameters needed: searchQuery (x3)
   */
  private getRecordingSearchSQL(): string {
    return `
      SELECT
        'recording' as entity_type,
        r.id::text as entity_id,
        r.organization_id,
        COALESCE(t.title, 'Recording') as title,
        ts_headline('english', COALESCE(r.transcript_text, ''), websearch_to_tsquery('english', ?), 'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') as snippet,
        ts_rank(r.transcript_tsvector, websearch_to_tsquery('english', ?)) as relevance_score,
        r.created_at,
        jsonb_build_object('task_id', r.task_id, 'duration', r.duration_seconds, 'language', r.transcript_language)::text as metadata
      FROM recordings r
      LEFT JOIN tasks t ON r.task_id = t.id
      WHERE r.transcript_tsvector @@ websearch_to_tsquery('english', ?)
        AND r.transcription_status = 'completed'
        AND r.status != 'deleted'
    `;
  }

  /**
   * Get parameterized SQL for user search
   * Uses ? placeholders for safe parameter binding
   * Parameters needed: searchQuery (x2)
   */
  private getUserSearchSQL(): string {
    return `
      SELECT
        'user' as entity_type,
        id::text as entity_id,
        organization_id,
        name as title,
        email as snippet,
        ts_rank(search_vector, websearch_to_tsquery('english', ?)) as relevance_score,
        created_at,
        jsonb_build_object('email', email)::text as metadata
      FROM users
      WHERE search_vector @@ websearch_to_tsquery('english', ?)
        AND is_active = true
    `;
  }
}

export const searchService = new SearchService();
export default searchService;
