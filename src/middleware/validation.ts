import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import logger from '@utils/logger';

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Log validation errors
    logger.warn('Validation failed', {
      url: req.url,
      method: req.method,
      errors: errors.array(),
      requestId: req.requestId,
    });

    res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  };
};

export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  // Basic input sanitization for body only
  // Note: req.query is read-only in Express v5, so we skip it
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  next();
};

const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return obj.trim().replace(/[<>]/g, '');
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
};
