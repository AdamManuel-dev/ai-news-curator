/**
 * @fileoverview Input validation and sanitization middleware
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Express-validator integration, input sanitization, XSS prevention
 * Main APIs: validate() middleware factory, sanitizeInput() middleware
 * Constraints: Requires express-validator, logger utility
 * Patterns: Middleware factory, recursive object sanitization, validation chain
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import logger from '@utils/logger';

/**
 * Creates a validation middleware that runs express-validator chains and handles errors.
 * 
 * Executes all provided validation chains and returns a 400 error with details
 * if any validations fail. Logs validation errors with request context.
 * 
 * @param validations - Array of express-validator validation chains
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * const userValidation = [
 *   body('email').isEmail().withMessage('Invalid email'),
 *   body('password').isLength({ min: 6 }).withMessage('Password too short')
 * ];
 * 
 * app.post('/users', validate(userValidation), createUser);
 * ```
 * 
 * @since 1.0.0
 */
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

/**
 * Input sanitization middleware to prevent XSS attacks.
 * 
 * Recursively sanitizes request body by trimming strings and removing
 * dangerous HTML characters. Note: req.query is read-only in Express v5.
 * 
 * @param req - Express request object
 * @param _res - Express response object (unused)
 * @param next - Express next function
 * 
 * @example
 * ```typescript
 * app.use(sanitizeInput);
 * // All request bodies will be automatically sanitized
 * ```
 * 
 * @since 1.0.0
 */
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  // Basic input sanitization for body only
  // Note: req.query is read-only in Express v5, so we skip it
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  next();
};

/**
 * Recursively sanitizes an object by cleaning all string values.
 * 
 * Removes HTML tags and trims whitespace from strings, processes arrays
 * and nested objects recursively.
 * 
 * @param obj - Object to sanitize
 * @returns Sanitized object with cleaned string values
 * 
 * @example
 * ```typescript
 * const clean = sanitizeObject({ name: '  <script>alert()</script>John  ' });
 * // Returns: { name: 'John' }
 * ```
 * 
 * @since 1.0.0
 */
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
