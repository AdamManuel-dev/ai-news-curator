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
