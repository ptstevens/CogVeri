import { Request, Response, NextFunction } from 'express';
import metricsService from '../services/metrics.service';
import { logger } from '../utils/logger';

// Store the start time and original status method
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
      rawBody?: Buffer;
    }
    interface Response {
      rawSend?: any;
    }
  }
}

/**
 * Middleware to record API metrics for all requests
 * Tracks: endpoint, method, status code, response time, request/response sizes, errors
 * Non-blocking: Errors in metrics recording don't affect the API request
 */
export const metricsRecordingMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Record start time
  req.startTime = Date.now();

  // Calculate request size
  let requestSize = 0;
  if (req.body) {
    try {
      requestSize = JSON.stringify(req.body).length;
    } catch (_error) {
      requestSize = 0;
    }
  }

  // Override the send method to capture response data
  const originalSend = res.send;
  let responseSize = 0;
  let responseBody: any = null;

  res.send = function (data: any) {
    // Calculate response size
    if (data) {
      try {
        responseSize = typeof data === 'string' ? data.length : JSON.stringify(data).length;
        responseBody = data;
      } catch (_error) {
        responseSize = 0;
      }
    }

    // Record metrics after response is sent
    setImmediate(async () => {
      try {
        const responseTime = Date.now() - (req.startTime || Date.now());
        const endpoint = `${req.method} ${req.baseUrl}${req.path}`;
        const organizationId = (req as any).user?.organizationId;
        const userId = (req as any).user?.id;
        const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

        // Determine if there was an error
        const isError = res.statusCode >= 400;
        let errorMessage: string | undefined;

        if (isError && responseBody) {
          try {
            if (typeof responseBody === 'string') {
              const parsed = JSON.parse(responseBody);
              errorMessage = parsed.error || parsed.message || responseBody;
            } else if (typeof responseBody === 'object') {
              errorMessage = responseBody.error || responseBody.message;
            }
          } catch (_parseError) {
            errorMessage = responseBody;
          }
        }

        // Record the metric (non-blocking, so we don't await)
        metricsService
          .recordApiMetric({
            organizationId,
            userId,
            endpoint,
            method: req.method,
            statusCode: res.statusCode,
            responseTimeMs: responseTime,
            requestSizeBytes: requestSize,
            responseSizeBytes: responseSize,
            ipAddress,
            error: isError,
            errorMessage: errorMessage || undefined,
          })
          .catch((error) => {
            logger.error('Error recording API metric:', error);
            // Non-blocking: Errors don't affect response
          });
      } catch (error) {
        logger.error('Unexpected error in metrics middleware:', error);
        // Non-blocking: Continue regardless
      }
    });

    // Call original send
    return originalSend.call(this, data);
  };

  next();
};

export default metricsRecordingMiddleware;
