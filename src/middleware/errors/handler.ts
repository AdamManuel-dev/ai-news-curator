/**
 * @fileoverview Error handling middleware for Express applications
 * @lastmodified 2025-07-28T00:42:00Z
 *
 * Features: Error normalization, context extraction, logging, response formatting, process handlers
 * Main APIs: errorHandler(), asyncHandler(), notFoundHandler(), initializeErrorHandlers()
 * Constraints: Requires logger, config, custom error types
 * Patterns: Error normalization, severity-based logging, response formatting, global handlers
 */

import { Request, Response, NextFunction } from 'express';
import logger from '@utils/logger';
import { config } from '@config/index';
import {
  AppError,
  ErrorResponse,
  ErrorContext,
  ErrorSeverity,
  DatabaseError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  NotFoundError,
} from './types';

/**
 * Generate unique request ID for error tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract error context from request
 */
function extractErrorContext(req: Request): ErrorContext {
  return {
    requestId: (req.headers['x-request-id'] as string) || generateRequestId(),
    userId: (req as any).user?.id,
    endpoint: req.originalUrl,
    method: req.method,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    correlationId: req.headers['x-correlation-id'] as string,
    additionalData: {
      body: req.method !== 'GET' ? req.body : undefined,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      params: Object.keys(req.params).length > 0 ? req.params : undefined,
    },
  };
}

/**
 * Determine error severity based on error type and status code
 */
function determineErrorSeverity(error: AppError | Error): ErrorSeverity {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) return ErrorSeverity.HIGH;
    if (error.statusCode >= 400) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.LOW;
  }

  // Programming errors are critical
  if (!error.name.includes('AppError')) {
    return ErrorSeverity.CRITICAL;
  }

  return ErrorSeverity.HIGH;
}

/**
 * Create error response object
 */
function createErrorResponse(
  error: AppError | Error,
  context: ErrorContext,
  isDevelopment: boolean
): ErrorResponse {
  const response: ErrorResponse = {
    error: {
      message: error.message,
      code: error instanceof AppError ? error.constructor.name : 'InternalServerError',
      category: error instanceof AppError ? error.category : 'internal',
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
    },
  };

  // Add details in development or for operational errors
  if (isDevelopment || (error instanceof AppError && error.isOperational)) {
    if (error instanceof AppError && error.context) {
      response.error.details = error.context;
    }
  }

  // Add stack trace in development
  if (isDevelopment) {
    response.error.stack = error.stack;
  }

  return response;
}

/**
 * Log error with appropriate level and context
 */
function logError(error: AppError | Error, context: ErrorContext, severity: ErrorSeverity): void {
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof AppError && {
        statusCode: error.statusCode,
        category: error.category,
        isOperational: error.isOperational,
        context: error.context,
      }),
    },
    request: context,
    severity,
    timestamp: new Date().toISOString(),
  };

  switch (severity) {
    case ErrorSeverity.CRITICAL:
      logger.error('Critical error occurred', logData);
      break;
    case ErrorSeverity.HIGH:
      logger.error('High severity error', logData);
      break;
    case ErrorSeverity.MEDIUM:
      logger.warn('Medium severity error', logData);
      break;
    case ErrorSeverity.LOW:
      logger.info('Low severity error', logData);
      break;
    default:
      logger.error('Unknown severity error', logData);
  }
}

/**
 * Handle Express validation errors
 */
function handleValidationErrors(errors: any[]): AppError {
  const details = errors.map((error) => ({
    field: error.param || error.path,
    message: error.msg || error.message,
    value: error.value,
    location: error.location || 'body',
  }));

  return new ValidationError('Validation failed', { validationErrors: details });
}

/**
 * Convert unknown errors to AppError instances
 */
function normalizeError(error: unknown): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Express validation errors
  if (Array.isArray(error) && error.length > 0 && ('param' in error[0] || 'path' in error[0])) {
    return handleValidationErrors(error);
  }

  // Standard Error objects
  if (error instanceof Error) {
    // Database connection errors
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
      return new DatabaseError('Database connection failed', { originalError: error.message });
    }

    // Timeout errors
    if (error.message.includes('timeout') || error.name === 'TimeoutError') {
      return new TimeoutError('Request timeout', 30000, { originalError: error.message });
    }

    // Generic programming error
    return new AppError(
      config.nodeEnv === 'production' ? 'Internal server error' : error.message,
      500,
      'internal',
      false,
      { originalError: error.message, stack: error.stack }
    );
  }

  // Unknown error types
  return new AppError('An unexpected error occurred', 500, 'unknown', false, {
    originalError: String(error),
  });
}

/**
 * Send appropriate error response
 */
function sendErrorResponse(res: Response, error: AppError, context: ErrorContext): void {
  const isDevelopment = config.nodeEnv === 'development';
  const response = createErrorResponse(error, context, isDevelopment);

  // Set security headers
  res.removeHeader('X-Powered-By');

  // Set rate limit headers for rate limit errors
  if (error instanceof RateLimitError) {
    res.set('Retry-After', error.retryAfter.toString());
    res.set('X-RateLimit-Limit', '1000');
    res.set('X-RateLimit-Remaining', '0');
  }

  // Set request ID header for tracking
  if (context.requestId) {
    res.set('X-Request-ID', context.requestId);
  }

  res.status(error.statusCode).json(response);
}

/**
 * Main error handling middleware
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if response already sent
  if (res.headersSent) {
    return next(error);
  }

  // Normalize error to AppError
  const normalizedError = normalizeError(error);

  // Extract context
  const context = extractErrorContext(req);

  // Determine severity
  const severity = determineErrorSeverity(normalizedError);

  // Log error
  logError(normalizedError, context, severity);

  // Send response
  sendErrorResponse(res, normalizedError, context);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<void>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const error = new NotFoundError(`Route ${req.method} ${req.originalUrl}`, undefined, {
    method: req.method,
    url: req.originalUrl,
    availableRoutes: [], // TODO: Add available routes if needed
  });

  next(error);
}

/**
 * Unhandled promise rejection handler
 */
export function handleUnhandledRejection(): void {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.error('Unhandled promise rejection', {
      reason: String(reason),
      promise: promise.toString(),
      stack: reason instanceof Error ? reason.stack : undefined,
    });

    // Graceful shutdown in production
    if (config.nodeEnv === 'production') {
      logger.info('Shutting down due to unhandled promise rejection');
      process.exit(1);
    }
  });
}

/**
 * Uncaught exception handler
 */
export function handleUncaughtException(): void {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
      name: error.name,
    });

    // Always exit on uncaught exceptions
    logger.info('Shutting down due to uncaught exception');
    process.exit(1);
  });
}

/**
 * Initialize error handlers
 */
export function initializeErrorHandlers(): void {
  handleUnhandledRejection();
  handleUncaughtException();

  logger.info('Error handlers initialized');
}
