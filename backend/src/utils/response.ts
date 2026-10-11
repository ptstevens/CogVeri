import { Response } from 'express';

/**
 * Standardized API Response Utilities
 *
 * All API responses should follow this structure for consistency:
 * - Success: { success: true, data, message?, meta? }
 * - Error: { success: false, error, code?, details? }
 * - Paginated: { success: true, data, pagination: { page, limit, total, hasMore } }
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  totalPages?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  details?: any;
  pagination?: PaginationMeta;
}

/**
 * Send a standardized error response
 */
export const sendErrorResponse = (
  res: Response,
  statusCode: number,
  message: string,
  details?: any,
  code?: string
): Response => {
  const response: ApiResponse = {
    success: false,
    error: message,
    ...(code && { code }),
    ...(details && { details }),
  };
  return res.status(statusCode).json(response);
};

/**
 * Send a standardized success response
 */
export const sendSuccessResponse = <T = any>(
  res: Response,
  data?: T,
  message?: string
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    ...(data !== undefined && { data }),
    ...(message && { message }),
  };
  return res.json(response);
};

/**
 * Send a paginated response with consistent pagination structure
 */
export const sendPaginatedResponse = <T = any>(
  res: Response,
  data: T[],
  options: {
    page: number;
    limit: number;
    total: number;
  },
  message?: string
): Response => {
  const { page, limit, total } = options;
  const totalPages = Math.ceil(total / limit);
  const hasMore = page < totalPages;

  const response: ApiResponse<T[]> = {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      hasMore,
      totalPages,
    },
    ...(message && { message }),
  };
  return res.json(response);
};

/**
 * Send a created response (201)
 */
export const sendCreatedResponse = <T = any>(
  res: Response,
  data: T,
  message?: string
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
  };
  return res.status(201).json(response);
};

/**
 * Send a no content response (204)
 */
export const sendNoContentResponse = (res: Response): Response => {
  return res.status(204).send();
};
