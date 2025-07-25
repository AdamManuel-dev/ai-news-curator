/**
 * @fileoverview Error handling middleware exports
 *
 * Central module for error handling functionality including custom error types,
 * error factories, and Express middleware for comprehensive error management.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

// Error types
export * from './types';

// Error handler middleware
export * from './handler';

// Error factory
export * from './factory';

// Convenience re-exports for commonly used errors
export {
  AppError,
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

export { ErrorFactory, createError } from './factory';

export { errorHandler, asyncHandler, notFoundHandler, initializeErrorHandlers } from './handler';
