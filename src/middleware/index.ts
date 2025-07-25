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
