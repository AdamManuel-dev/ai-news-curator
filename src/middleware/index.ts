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
