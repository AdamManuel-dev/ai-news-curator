import { Request, Response, NextFunction } from 'express';
import { logError } from '@utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logError(error, {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId: req.requestId,
  });

  // Don't expose internal error details in production
  const isDevelopment = process.env['NODE_ENV'] === 'development';

  res.status(500).json({
    error: 'Internal Server Error',
    requestId: req.requestId,
    ...(isDevelopment && {
      message: error.message,
      stack: error.stack,
    }),
  });
};

// Not found handler
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`,
    requestId: req.requestId,
  });
};

// Export middleware from other files
export { requestLogger } from './requestLogger';
export { validate, sanitizeInput } from './validation';
