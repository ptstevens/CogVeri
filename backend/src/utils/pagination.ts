/**
 * Pagination Utility
 *
 * Provides standardized pagination handling for API endpoints.
 * Supports both offset-based and cursor-based pagination.
 *
 * @example
 * // In controller - offset-based pagination
 * const params = parsePaginationParams(req.query);
 * const { data, total } = await someService.getItems(params);
 * res.json(createPaginatedResponse(data, total, params));
 *
 * @example
 * // In controller - cursor-based pagination
 * const params = parsePaginationParams(req.query, { useCursor: true });
 * const { data, nextCursor } = await someService.getItems(params);
 * res.json(createCursorPaginatedResponse(data, nextCursor, params));
 */

// ============================================================================
// Constants
// ============================================================================

/** Default number of items per page */
export const DEFAULT_PAGE = 1;

/** Default number of items per page */
export const DEFAULT_LIMIT = 20;

/** Maximum allowed items per page to prevent abuse */
export const MAX_LIMIT = 100;

/** Minimum allowed items per page */
export const MIN_LIMIT = 1;

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Parsed pagination parameters for offset-based pagination
 */
export interface OffsetPaginationParams {
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Offset for database queries (calculated from page and limit) */
  offset: number;
  /** Sort field name */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Parsed pagination parameters for cursor-based pagination
 */
export interface CursorPaginationParams {
  /** Number of items to fetch */
  limit: number;
  /** Cursor for fetching next page (typically an ID or timestamp) */
  cursor?: string;
  /** Sort field name */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Union type for all pagination parameters
 */
export type PaginationParams = OffsetPaginationParams | CursorPaginationParams;

/**
 * Options for parsing pagination parameters
 */
export interface ParsePaginationOptions {
  /** Use cursor-based pagination instead of offset-based */
  useCursor?: boolean;
  /** Default limit if not provided */
  defaultLimit?: number;
  /** Maximum allowed limit */
  maxLimit?: number;
  /** Default sort field */
  defaultSortBy?: string;
  /** Default sort order */
  defaultSortOrder?: 'asc' | 'desc';
  /** Allowed sort fields (for validation) */
  allowedSortFields?: string[];
}

/**
 * Pagination metadata for offset-based responses
 */
export interface OffsetPaginationMeta {
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNext: boolean;
  /** Whether there is a previous page */
  hasPrev: boolean;
}

/**
 * Pagination metadata for cursor-based responses
 */
export interface CursorPaginationMeta {
  /** Number of items per page */
  limit: number;
  /** Cursor for fetching next page (null if no more pages) */
  nextCursor: string | null;
  /** Whether there are more items */
  hasNext: boolean;
}

/**
 * Standardized paginated response format for offset-based pagination
 */
export interface PaginatedResponse<T> {
  /** Response data array */
  data: T[];
  /** Pagination metadata */
  pagination: OffsetPaginationMeta;
}

/**
 * Standardized paginated response format for cursor-based pagination
 */
export interface CursorPaginatedResponse<T> {
  /** Response data array */
  data: T[];
  /** Pagination metadata */
  pagination: CursorPaginationMeta;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if params are offset-based
 */
export function isOffsetPagination(params: PaginationParams): params is OffsetPaginationParams {
  return 'page' in params && 'offset' in params;
}

/**
 * Type guard to check if params are cursor-based
 */
export function isCursorPagination(params: PaginationParams): params is CursorPaginationParams {
  return !('page' in params) && !('offset' in params);
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse and validate offset-based pagination parameters from query string
 *
 * @param query - Express request query object
 * @param options - Parsing options
 * @returns Validated pagination parameters
 *
 * @example
 * // GET /api/tasks?page=2&limit=10&sortBy=created_at&sortOrder=desc
 * const params = parseOffsetPaginationParams(req.query);
 * // { page: 2, limit: 10, offset: 10, sortBy: 'created_at', sortOrder: 'desc' }
 */
export function parseOffsetPaginationParams(
  query: Record<string, unknown>,
  options: Omit<ParsePaginationOptions, 'useCursor'> = {}
): OffsetPaginationParams {
  const {
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
    defaultSortBy,
    defaultSortOrder = 'desc',
    allowedSortFields,
  } = options;

  // Parse page (1-indexed, defaults to 1)
  let page = DEFAULT_PAGE;
  if (query.page !== undefined) {
    const parsedPage = parseInt(String(query.page), 10);
    if (!isNaN(parsedPage) && parsedPage >= 1) {
      page = parsedPage;
    }
  }

  // Parse limit with bounds checking
  let limit = defaultLimit;
  if (query.limit !== undefined) {
    const parsedLimit = parseInt(String(query.limit), 10);
    if (!isNaN(parsedLimit)) {
      limit = Math.max(MIN_LIMIT, Math.min(parsedLimit, maxLimit));
    }
  }

  // Calculate offset
  const offset = (page - 1) * limit;

  // Parse sort parameters
  let sortBy = defaultSortBy;
  if (query.sortBy !== undefined && typeof query.sortBy === 'string') {
    // Validate against allowed fields if provided
    if (!allowedSortFields || allowedSortFields.includes(query.sortBy)) {
      sortBy = query.sortBy;
    }
  }

  let sortOrder: 'asc' | 'desc' = defaultSortOrder;
  if (query.sortOrder !== undefined) {
    const order = String(query.sortOrder).toLowerCase();
    if (order === 'asc' || order === 'desc') {
      sortOrder = order;
    }
  }

  return {
    page,
    limit,
    offset,
    ...(sortBy && { sortBy }),
    sortOrder,
  };
}

/**
 * Parse and validate cursor-based pagination parameters from query string
 *
 * @param query - Express request query object
 * @param options - Parsing options
 * @returns Validated pagination parameters
 *
 * @example
 * // GET /api/tasks?limit=10&cursor=abc123
 * const params = parseCursorPaginationParams(req.query);
 * // { limit: 10, cursor: 'abc123' }
 */
export function parseCursorPaginationParams(
  query: Record<string, unknown>,
  options: Omit<ParsePaginationOptions, 'useCursor'> = {}
): CursorPaginationParams {
  const {
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
    defaultSortBy,
    defaultSortOrder = 'desc',
    allowedSortFields,
  } = options;

  // Parse limit with bounds checking
  let limit = defaultLimit;
  if (query.limit !== undefined) {
    const parsedLimit = parseInt(String(query.limit), 10);
    if (!isNaN(parsedLimit)) {
      limit = Math.max(MIN_LIMIT, Math.min(parsedLimit, maxLimit));
    }
  }

  // Parse cursor (string, optional)
  let cursor: string | undefined;
  if (
    query.cursor !== undefined &&
    typeof query.cursor === 'string' &&
    query.cursor.trim() !== ''
  ) {
    cursor = query.cursor.trim();
  }

  // Parse sort parameters
  let sortBy = defaultSortBy;
  if (query.sortBy !== undefined && typeof query.sortBy === 'string') {
    // Validate against allowed fields if provided
    if (!allowedSortFields || allowedSortFields.includes(query.sortBy)) {
      sortBy = query.sortBy;
    }
  }

  let sortOrder: 'asc' | 'desc' = defaultSortOrder;
  if (query.sortOrder !== undefined) {
    const order = String(query.sortOrder).toLowerCase();
    if (order === 'asc' || order === 'desc') {
      sortOrder = order;
    }
  }

  return {
    limit,
    ...(cursor && { cursor }),
    ...(sortBy && { sortBy }),
    sortOrder,
  };
}

/**
 * Parse pagination parameters from query string
 * Automatically selects offset or cursor-based parsing based on options
 *
 * @param query - Express request query object
 * @param options - Parsing options
 * @returns Validated pagination parameters
 *
 * @example
 * // Offset-based (default)
 * const params = parsePaginationParams(req.query);
 *
 * @example
 * // Cursor-based
 * const params = parsePaginationParams(req.query, { useCursor: true });
 */
export function parsePaginationParams(
  query: Record<string, unknown>,
  options: ParsePaginationOptions = {}
): PaginationParams {
  const { useCursor = false, ...restOptions } = options;

  if (useCursor) {
    return parseCursorPaginationParams(query, restOptions);
  }

  return parseOffsetPaginationParams(query, restOptions);
}

// ============================================================================
// Response Creation Functions
// ============================================================================

/**
 * Create a standardized offset-based paginated response
 *
 * @param data - Array of items to return
 * @param total - Total number of items (for all pages)
 * @param params - Pagination parameters used for the query
 * @returns Standardized paginated response object
 *
 * @example
 * const params = parsePaginationParams(req.query);
 * const { data, total } = await taskService.getTasks(params);
 * res.json(createPaginatedResponse(data, total, params));
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: OffsetPaginationParams
): PaginatedResponse<T> {
  const { page, limit } = params;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Create a standardized cursor-based paginated response
 *
 * @param data - Array of items to return
 * @param nextCursor - Cursor for fetching next page (null if no more pages)
 * @param params - Pagination parameters used for the query
 * @returns Standardized paginated response object
 *
 * @example
 * const params = parsePaginationParams(req.query, { useCursor: true });
 * const { data, nextCursor } = await taskService.getTasks(params);
 * res.json(createCursorPaginatedResponse(data, nextCursor, params));
 */
export function createCursorPaginatedResponse<T>(
  data: T[],
  nextCursor: string | null,
  params: CursorPaginationParams
): CursorPaginatedResponse<T> {
  return {
    data,
    pagination: {
      limit: params.limit,
      nextCursor,
      hasNext: nextCursor !== null,
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate the total number of pages
 *
 * @param total - Total number of items
 * @param limit - Items per page
 * @returns Total number of pages
 */
export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

/**
 * Check if there is a next page (offset-based)
 *
 * @param page - Current page number
 * @param totalPages - Total number of pages
 * @returns Whether there is a next page
 */
export function hasNextPage(page: number, totalPages: number): boolean {
  return page < totalPages;
}

/**
 * Check if there is a previous page (offset-based)
 *
 * @param page - Current page number
 * @returns Whether there is a previous page
 */
export function hasPrevPage(page: number): boolean {
  return page > 1;
}

/**
 * Generate a cursor from an item (typically using ID or timestamp)
 * This is a simple base64 encoding - customize for your needs
 *
 * @param item - Item to generate cursor from
 * @param field - Field to use for cursor (default: 'id')
 * @returns Encoded cursor string
 */
export function generateCursor<T extends Record<string, unknown>>(
  item: T,
  field: keyof T = 'id' as keyof T
): string {
  const value = item[field];
  if (value === undefined || value === null) {
    throw new Error(`Cannot generate cursor: field "${String(field)}" is undefined or null`);
  }
  return Buffer.from(String(value)).toString('base64');
}

/**
 * Decode a cursor back to its original value
 *
 * @param cursor - Encoded cursor string
 * @returns Decoded cursor value
 */
export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64').toString('utf-8');
}

/**
 * Get the last item from an array (useful for generating next cursor)
 *
 * @param items - Array of items
 * @returns Last item or undefined if array is empty
 */
export function getLastItem<T>(items: T[]): T | undefined {
  return items.length > 0 ? items[items.length - 1] : undefined;
}

/**
 * Determine if there are more items by fetching one extra and checking
 * This is a common pattern for cursor-based pagination
 *
 * @param items - Array of fetched items (should include the extra item)
 * @param limit - Requested limit
 * @returns Object with trimmed data and hasMore flag
 */
export function checkHasMore<T>(items: T[], limit: number): { data: T[]; hasMore: boolean } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  return { data, hasMore };
}
