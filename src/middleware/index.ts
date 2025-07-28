/**
 * @fileoverview Middleware exports and types
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Middleware aggregation, type definitions, request extensions
 * Main APIs: AuthenticatedRequest interface, middleware re-exports
 * Constraints: None, pure module aggregation
 * Patterns: Barrel export pattern, interface extension
 */

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

// Export middleware from other files
export { requestLogger } from './requestLogger';
export { validate, sanitizeInput } from './validation';

// Export caching middleware
export * from './cache';

// Export comprehensive error handling
export * from './errors';

// Export metrics middleware
export { metricsMiddleware, metrics, register as metricsRegistry } from './metrics';

// Export serialization middleware
export { serializerMiddleware } from '@utils/serializers';

// Export authentication middleware
export { 
  authenticateJWT, 
  optionalAuthenticateJWT, 
  authenticateAPIKey, 
  requireRole, 
  userRateLimit, 
  devAuthBypass, 
  requireHTTPS 
} from './auth';

// Export rate limiting middleware
export {
  globalRateLimit,
  strictRateLimit,
  authRateLimit,
  apiRateLimit,
  dynamicRateLimit,
  contentRateLimit,
  searchRateLimit,
  expensiveOperationRateLimit,
  rateLimitMiddleware
} from './rate-limit';

// Export RBAC middleware
export {
  requirePermission,
  requireRole,
  requireAnyPermission,
  requireAllPermissions,
  loadUserPermissions,
  requireAdmin,
  requireModerator,
  resourcePermissions
} from './rbac';
