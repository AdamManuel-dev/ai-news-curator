/**
 * @fileoverview Error factory for creating common application errors
 *
 * Provides convenience methods for creating specific error types with
 * consistent messaging and context formatting.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import {
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  BusinessLogicError,
  ContentProcessingError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  TimeoutError,
  VectorDatabaseError,
  CacheError,
} from './types';

/**
 * Error factory class for creating application-specific errors
 */
export class ErrorFactory {
  /**
   * Content-related errors
   */
  static content = {
    notFound: (contentId: string) => new NotFoundError('Content', contentId, { contentId }),

    alreadyExists: (url: string) =>
      new ConflictError('Content with this URL already exists', { url }),

    invalidFormat: (format: string, expectedFormats: string[]) =>
      new ValidationError('Invalid content format', {
        provided: format,
        expected: expectedFormats,
      }),

    processingFailed: (stage: string, contentId?: string, details?: Record<string, unknown>) =>
      new ContentProcessingError(
        stage,
        `Content processing failed at ${stage}`,
        contentId,
        details
      ),

    qualityTooLow: (score: number, threshold: number) =>
      new BusinessLogicError('Content quality below threshold', {
        score,
        threshold,
        message: 'Content was rejected due to low quality score',
      }),

    embeddingFailed: (contentId: string, error: string) =>
      new ContentProcessingError('embedding', 'Failed to generate content embeddings', contentId, {
        originalError: error,
      }),
  };

  /**
   * User-related errors
   */
  static user = {
    notFound: (userId: string) => new NotFoundError('User', userId, { userId }),

    invalidCredentials: () => new AuthenticationError('Invalid email or password'),

    accountLocked: (userId: string, unlockTime: Date) =>
      new AuthenticationError('Account is temporarily locked', {
        userId,
        unlockTime: unlockTime.toISOString(),
      }),

    insufficientPermissions: (requiredPermission: string, userPermissions: string[]) =>
      new AuthorizationError('Insufficient permissions', {
        required: requiredPermission,
        current: userPermissions,
      }),

    sessionExpired: () => new AuthenticationError('Session has expired, please log in again'),
  };

  /**
   * Tag-related errors
   */
  static tag = {
    notFound: (tagId: string) => new NotFoundError('Tag', tagId, { tagId }),

    alreadyExists: (tagName: string) =>
      new ConflictError('Tag with this name already exists', { tagName }),

    invalidCategory: (category: string, validCategories: string[]) =>
      new ValidationError('Invalid tag category', {
        provided: category,
        valid: validCategories,
      }),

    assignmentFailed: (contentId: string, tagId: string, reason: string) =>
      new ContentProcessingError('tagging', 'Failed to assign tag to content', contentId, {
        tagId,
        reason,
      }),
  };

  /**
   * Source-related errors
   */
  static source = {
    notFound: (sourceId: string) => new NotFoundError('Source', sourceId, { sourceId }),

    unreachable: (sourceUrl: string, error: string) =>
      new ExternalServiceError('content-source', `Source is unreachable: ${sourceUrl}`, true, {
        sourceUrl,
        originalError: error,
      }),

    invalidConfiguration: (sourceId: string, configErrors: string[]) =>
      new ValidationError('Invalid source configuration', {
        sourceId,
        configErrors,
      }),

    rateLimited: (sourceId: string, retryAfter: number) =>
      new RateLimitError(`Source rate limit exceeded: ${sourceId}`, retryAfter, { sourceId }),
  };

  /**
   * Database-related errors
   */
  static database = {
    connectionFailed: (error: string) =>
      new DatabaseError('Database connection failed', { originalError: error }),

    queryFailed: (query: string, error: string) =>
      new DatabaseError('Database query failed', {
        query: query.substring(0, 100),
        originalError: error,
      }),

    constraintViolation: (constraint: string, details: Record<string, unknown>) =>
      new DatabaseError('Database constraint violation', { constraint, ...details }),

    migrationFailed: (migration: string, error: string) =>
      new DatabaseError('Database migration failed', { migration, originalError: error }),
  };

  /**
   * External service errors
   */
  static external = {
    openaiError: (error: string, retryable = true) =>
      new ExternalServiceError('OpenAI', `OpenAI API error: ${error}`, retryable),

    anthropicError: (error: string, retryable = true) =>
      new ExternalServiceError('Anthropic', `Anthropic API error: ${error}`, retryable),

    pineconeError: (error: string) => new VectorDatabaseError(`Pinecone error: ${error}`),

    rssError: (feedUrl: string, error: string) =>
      new ExternalServiceError('RSS Feed', `RSS feed error: ${feedUrl}`, true, {
        feedUrl,
        originalError: error,
      }),

    apiTimeout: (serviceName: string, timeoutMs: number) =>
      new TimeoutError(`${serviceName} API`, timeoutMs),
  };

  /**
   * Cache-related errors
   */
  static cache = {
    connectionFailed: (error: string) =>
      new CacheError('Cache connection failed', { originalError: error }),

    setFailed: (key: string, error: string) =>
      new CacheError('Failed to set cache value', { key, originalError: error }),

    getFailed: (key: string, error: string) =>
      new CacheError('Failed to get cache value', { key, originalError: error }),
  };

  /**
   * Validation errors
   */
  static validation = {
    required: (field: string) => new ValidationError(`${field} is required`),

    invalidFormat: (field: string, format: string, example?: string) =>
      new ValidationError(`${field} has invalid format`, {
        field,
        expectedFormat: format,
        example,
      }),

    outOfRange: (field: string, min: number, max: number, value: number) =>
      new ValidationError(`${field} is out of range`, {
        field,
        min,
        max,
        provided: value,
      }),

    tooLong: (field: string, maxLength: number, actualLength: number) =>
      new ValidationError(`${field} is too long`, {
        field,
        maxLength,
        actualLength,
      }),

    invalidEnum: (field: string, validValues: string[], provided: string) =>
      new ValidationError(`${field} has invalid value`, {
        field,
        validValues,
        provided,
      }),
  };

  /**
   * Rate limiting errors
   */
  static rateLimit = {
    apiLimitExceeded: (limit: number, window: string, retryAfter: number) =>
      new RateLimitError(`API rate limit exceeded: ${limit} requests per ${window}`, retryAfter, {
        limit,
        window,
      }),

    userLimitExceeded: (userId: string, limit: number, retryAfter: number) =>
      new RateLimitError(`User rate limit exceeded: ${limit} requests per hour`, retryAfter, {
        userId,
        limit,
      }),

    ipLimitExceeded: (ip: string, limit: number, retryAfter: number) =>
      new RateLimitError(`IP rate limit exceeded: ${limit} requests per hour`, retryAfter, {
        ip,
        limit,
      }),
  };

  /**
   * Business logic errors
   */
  static business = {
    invalidOperation: (operation: string, reason: string, context?: Record<string, unknown>) =>
      new BusinessLogicError(`Invalid operation: ${operation}. ${reason}`, {
        operation,
        reason,
        ...context,
      }),

    preconditionFailed: (condition: string, details?: Record<string, unknown>) =>
      new BusinessLogicError(`Precondition failed: ${condition}`, details),

    conflictingState: (resource: string, currentState: string, requiredState: string) =>
      new BusinessLogicError(`${resource} is in conflicting state`, {
        resource,
        currentState,
        requiredState,
      }),
  };
}

/**
 * Convenience function to create errors with consistent formatting
 */
export function createError(
  type: 'validation' | 'notFound' | 'conflict' | 'database' | 'external' | 'business',
  message: string,
  context?: Record<string, unknown>
) {
  switch (type) {
    case 'validation':
      return new ValidationError(message, context);
    case 'notFound':
      return new NotFoundError(message, undefined, context);
    case 'conflict':
      return new ConflictError(message, context);
    case 'database':
      return new DatabaseError(message, context);
    case 'external':
      return new ExternalServiceError('unknown', message, true, context);
    case 'business':
      return new BusinessLogicError(message, context);
    default:
      return new ValidationError(message, context);
  }
}
