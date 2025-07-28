/**
 * @fileoverview Request logging middleware for tracking HTTP requests
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Request ID generation, start/end logging, response time tracking
 * Main APIs: requestLogger() middleware function
 * Constraints: Requires UUID for request IDs, logger utilities
 * Patterns: Middleware pattern, response override, global request extension
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logRequestStart, logRequestEnd } from '@utils/logger';

// Extend Express Request interface to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Request logging middleware that generates unique request IDs and tracks request lifecycle.
 * 
 * Automatically assigns a UUID to each request for tracing and logs both request start
 * and completion with response times.
 * 
 * @param req - Express request object
 * @param res - Express response object  
 * @param next - Express next function
 * 
 * @example
 * ```typescript
 * app.use(requestLogger);
 * // All requests will now have req.requestId and be logged
 * ```
 * 
 * @since 1.0.0
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = uuidv4();
  req.requestId = requestId;

  const startTime = Date.now();

  logRequestStart(req.method, req.url, requestId);

  // Override res.end to log request completion
  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any): any {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    logRequestEnd(req.method, req.url, res.statusCode, responseTime, requestId);

    return originalEnd.call(this, chunk, encoding);
  };

  next();
};
