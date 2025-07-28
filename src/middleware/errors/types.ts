/**
 * @fileoverview Custom error types for the AI Content Curator Agent
 * @lastmodified 2025-07-28T00:42:00Z
 *
 * Features: Base AppError class, domain-specific error types, error interfaces, severity levels
 * Main APIs: AppError, ValidationError, AuthError, NotFoundError, RateLimitError, etc.
 * Constraints: None, pure error class definitions
 * Patterns: Error inheritance, status code mapping, operational vs programming errors
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;

  public readonly isOperational: boolean;

  public readonly category: string;

  public readonly context?: Record<string, unknown>;

  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number,
    category: string,
    isOperational = true,
    context?: Record<string, unknown>
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.category = category;
    this.context = context;
    this.timestamp = new Date();

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation errors (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, 'validation', true, context);
  }
}

/**
 * Authentication errors (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 401, 'authentication', true, context);
  }
}

/**
 * Authorization errors (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 403, 'authorization', true, context);
  }
}

/**
 * Resource not found errors (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, context?: Record<string, unknown>) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'not_found', true, context);
  }
}

/**
 * Resource conflict errors (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 409, 'conflict', true, context);
  }
}

/**
 * Rate limiting errors (429)
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number, context?: Record<string, unknown>) {
    super(message, 429, 'rate_limit', true, context);
    this.retryAfter = retryAfter;
  }
}

/**
 * Database errors (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 500, 'database', true, context);
  }
}

/**
 * External service errors (502/503)
 */
export class ExternalServiceError extends AppError {
  public readonly serviceName: string;

  public readonly retryable: boolean;

  constructor(
    serviceName: string,
    message: string,
    retryable = true,
    context?: Record<string, unknown>
  ) {
    const statusCode = retryable ? 503 : 502;
    super(message, statusCode, 'external_service', true, context);
    this.serviceName = serviceName;
    this.retryable = retryable;
  }
}

/**
 * Configuration errors (500)
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 500, 'configuration', false, context);
  }
}

/**
 * Business logic errors (422)
 */
export class BusinessLogicError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 422, 'business_logic', true, context);
  }
}

/**
 * Content processing errors (422)
 */
export class ContentProcessingError extends AppError {
  public readonly contentId?: string;

  public readonly stage: string;

  constructor(
    stage: string,
    message: string,
    contentId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 422, 'content_processing', true, context);
    this.stage = stage;
    this.contentId = contentId;
  }
}

/**
 * Vector database errors (503)
 */
export class VectorDatabaseError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 503, 'vector_database', true, context);
  }
}

/**
 * Cache errors (503)
 */
export class CacheError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 503, 'cache', true, context);
  }
}

/**
 * Timeout errors (408)
 */
export class TimeoutError extends AppError {
  public readonly timeoutMs: number;

  public readonly operation: string;

  constructor(operation: string, timeoutMs: number, context?: Record<string, unknown>) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 408, 'timeout', true, context);
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error response format
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    category: string;
    timestamp: string;
    requestId?: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
}

/**
 * Error context for logging and debugging
 */
export interface ErrorContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  userAgent?: string;
  ip?: string;
  correlationId?: string;
  additionalData?: Record<string, unknown>;
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error reporting interface
 */
export interface ErrorReport {
  error: AppError;
  context: ErrorContext;
  severity: ErrorSeverity;
  timestamp: Date;
  resolved: boolean;
  resolution?: string;
}
