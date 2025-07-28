/**
 * @fileoverview Error handling middleware exports
 * @lastmodified 2025-07-28T00:42:00Z
 *
 * Features: Error type exports, middleware exports, convenience re-exports
 * Main APIs: All error classes, ErrorFactory, errorHandler, asyncHandler
 * Constraints: None, pure module aggregation
 * Patterns: Barrel export pattern, error type aggregation
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
