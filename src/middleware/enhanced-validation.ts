/**
 * @fileoverview Enhanced validation middleware with Zod schemas
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Zod validation, request/response validation, caching, sanitization, type coercion
 * Main APIs: ValidationMiddleware.validate(), validateResponse(), validate.body/params/query()
 * Constraints: Requires Zod schemas, global schema registry, validation types
 * Patterns: Middleware factory, result caching, async validation, error aggregation
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type {
  RequestValidationConfig,
  ResponseValidationConfig,
  ValidationOptions,
  ValidationErrorDetail,
  ValidationError,
  ValidatedRequest,
  ValidationContext,
  ValidationResult,
  ValidationCacheConfig,
} from '@types/validation';
import { ErrorFactory } from '@middleware/errors/types';
import { globalSchemaRegistry } from '@validation/registry';
import logger from '@utils/logger';

/**
 * Enhanced validation middleware factory
 */
export class ValidationMiddleware {
  private cache = new Map<string, ValidationResult>();
  private cacheConfig: ValidationCacheConfig = {
    enabled: false,
    maxSize: 1000,
    ttl: 5 * 60 * 1000, // 5 minutes
    keyGenerator: (req, config) => this.generateCacheKey(req, config),
  };

  constructor(cacheConfig?: Partial<ValidationCacheConfig>) {
    if (cacheConfig) {
      this.cacheConfig = { ...this.cacheConfig, ...cacheConfig };
    }
  }

  /**
   * Create validation middleware for requests
   */
  validate(config: RequestValidationConfig) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.requestId || 'unknown';
      const context: ValidationContext = {
        request: req,
        user: (req as any).user,
        userRole: (req as any).user?.role,
        customData: {},
      };

      try {
        // Skip validation if condition is met
        if (config.options?.skipValidation?.(req)) {
          return next();
        }

        // Check cache if enabled
        if (this.cacheConfig.enabled) {
          const cacheKey = this.cacheConfig.keyGenerator(req, config);
          const cached = this.getCachedResult(cacheKey);
          if (cached?.success) {
            this.applyValidatedData(req as ValidatedRequest, cached.data);
            return next();
          }
        }

        const validationResults: Array<{ location: string; result: ValidationResult }> = [];

        // Validate request body
        if (config.body) {
          const bodyResult = await this.validatePart('body', req.body, config.body, config.options);
          validationResults.push({ location: 'body', result: bodyResult });
          
          if (bodyResult.success) {
            (req as ValidatedRequest).validatedBody = bodyResult.data;
          }
        }

        // Validate path parameters
        if (config.params) {
          const paramsResult = await this.validatePart('params', req.params, config.params, config.options);
          validationResults.push({ location: 'params', result: paramsResult });
          
          if (paramsResult.success) {
            (req as ValidatedRequest).validatedParams = paramsResult.data;
          }
        }

        // Validate query parameters
        if (config.query) {
          const queryResult = await this.validatePart('query', req.query, config.query, config.options);
          validationResults.push({ location: 'query', result: queryResult });
          
          if (queryResult.success) {
            (req as ValidatedRequest).validatedQuery = queryResult.data;
          }
        }

        // Validate headers
        if (config.headers) {
          const headersResult = await this.validatePart('headers', req.headers, config.headers, config.options);
          validationResults.push({ location: 'headers', result: headersResult });
          
          if (headersResult.success) {
            (req as ValidatedRequest).validatedHeaders = headersResult.data;
          }
        }

        // Check for validation errors
        const errors = validationResults
          .filter(result => !result.result.success)
          .flatMap(result => result.result.errors || []);

        if (errors.length > 0) {
          const validationError = this.createValidationError(errors, requestId);
          const duration = Date.now() - startTime;
          
          // Log validation failure
          if (config.options?.logValidationErrors !== false) {
            logger.warn('Request validation failed', {
              url: req.url,
              method: req.method,
              errors: errors.length,
              duration,
              requestId,
            });
          }

          // Record metrics
          globalSchemaRegistry.recordValidation(false, duration);

          // Call custom error handler if provided
          if (config.options?.onValidationError) {
            config.options.onValidationError(validationError, req, res);
            return;
          }

          // Send error response
          const statusCode = 400;
          res.status(statusCode).json({
            success: false,
            error: validationError,
            requestId,
          });
          return;
        }

        // Cache successful validation if enabled
        if (this.cacheConfig.enabled) {
          const cacheKey = this.cacheConfig.keyGenerator(req, config);
          const cacheData = {
            body: (req as ValidatedRequest).validatedBody,
            params: (req as ValidatedRequest).validatedParams,
            query: (req as ValidatedRequest).validatedQuery,
            headers: (req as ValidatedRequest).validatedHeaders,
          };
          this.setCachedResult(cacheKey, { success: true, data: cacheData });
        }

        const duration = Date.now() - startTime;
        globalSchemaRegistry.recordValidation(true, duration);

        // Log successful validation
        logger.debug('Request validation successful', {
          url: req.url,
          method: req.method,
          duration,
          requestId,
        });

        next();
      } catch (error) {
        const duration = Date.now() - startTime;
        globalSchemaRegistry.recordValidation(false, duration);

        logger.error('Validation middleware error', {
          error: error instanceof Error ? error.message : String(error),
          url: req.url,
          method: req.method,
          duration,
          requestId,
        });

        next(error);
      }
    };
  }

  /**
   * Create response validation middleware
   */
  validateResponse(config: ResponseValidationConfig) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const originalJson = res.json;
      const requestId = req.requestId || 'unknown';

      res.json = function(data: any) {
        const statusCode = res.statusCode || 200;
        const schema = config[statusCode];

        if (schema) {
          try {
            const validatedData = schema.parse(data);
            return originalJson.call(this, validatedData);
          } catch (error) {
            logger.error('Response validation failed', {
              statusCode,
              error: error instanceof z.ZodError ? error.errors : String(error),
              requestId,
            });

            // In development, return validation error; in production, log and continue
            if (process.env.NODE_ENV === 'development') {
              return originalJson.call(this, {
                success: false,
                error: {
                  message: 'Response validation failed',
                  code: 'ResponseValidationError',
                  category: 'validation',
                  details: error instanceof z.ZodError ? error.errors : String(error),
                },
                requestId,
              });
            }
          }
        }

        return originalJson.call(this, data);
      };

      next();
    };
  }

  /**
   * Validate a specific part of the request
   */
  private async validatePart(
    location: string,
    data: any,
    schema: z.ZodSchema,
    options?: ValidationOptions
  ): Promise<ValidationResult> {
    try {
      // Apply preprocessing based on location
      const preprocessedData = this.preprocessData(data, location, options);
      
      // Validate using schema
      const result = await schema.parseAsync(preprocessedData);
      
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors: ValidationErrorDetail[] = error.errors.map(err => ({
          field: err.path.join('.'),
          message: options?.customErrorMessages?.[err.path.join('.')] || err.message,
          value: err.input,
          location: location as any,
          code: err.code,
        }));

        return { success: false, errors: validationErrors };
      }

      throw error;
    }
  }

  /**
   * Preprocess data based on location and options
   */
  private preprocessData(data: any, location: string, options?: ValidationOptions): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    let processed = { ...data };

    // Apply sanitization if enabled
    if (options?.sanitize !== false) {
      processed = this.sanitizeData(processed);
    }

    // Strip unknown fields based on location and options
    if (options?.stripUnknown) {
      // This will be handled by Zod's .strip() method in the schema
    }

    // Handle query parameter type coercion
    if (location === 'query') {
      processed = this.coerceQueryTypes(processed);
    }

    return processed;
  }

  /**
   * Sanitize input data
   */
  private sanitizeData(data: any): any {
    if (typeof data === 'string') {
      return data.trim().replace(/[<>]/g, '');
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          sanitized[key] = this.sanitizeData(data[key]);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Coerce query parameter types
   */
  private coerceQueryTypes(query: Record<string, any>): Record<string, any> {
    const coerced: Record<string, any> = {};

    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') {
        // Try to coerce to number
        if (/^\d+$/.test(value)) {
          coerced[key] = parseInt(value, 10);
        } else if (/^\d*\.\d+$/.test(value)) {
          coerced[key] = parseFloat(value);
        } else if (value === 'true' || value === 'false') {
          coerced[key] = value === 'true';
        } else {
          coerced[key] = value;
        }
      } else {
        coerced[key] = value;
      }
    }

    return coerced;
  }

  /**
   * Create a validation error object
   */
  private createValidationError(errors: ValidationErrorDetail[], requestId: string): ValidationError {
    return {
      message: 'Request validation failed',
      code: 'ValidationError',
      category: 'validation',
      details: {
        validationErrors: errors,
        requestId,
      },
    };
  }

  /**
   * Apply validated data to request object
   */
  private applyValidatedData(req: ValidatedRequest, data: any): void {
    if (data.body) req.validatedBody = data.body;
    if (data.params) req.validatedParams = data.params;
    if (data.query) req.validatedQuery = data.query;
    if (data.headers) req.validatedHeaders = data.headers;
  }

  /**
   * Generate cache key for validation result
   */
  private generateCacheKey(req: Request, config: RequestValidationConfig): string {
    const parts = [
      req.method,
      req.path,
      JSON.stringify(req.body || {}),
      JSON.stringify(req.query || {}),
      JSON.stringify(req.params || {}),
    ];

    return parts.join('|');
  }

  /**
   * Get cached validation result
   */
  private getCachedResult(key: string): ValidationResult | undefined {
    return this.cache.get(key);
  }

  /**
   * Set cached validation result
   */
  private setCachedResult(key: string, result: ValidationResult): void {
    // Implement LRU cache eviction
    if (this.cache.size >= this.cacheConfig.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, result);

    // Set TTL cleanup
    setTimeout(() => {
      this.cache.delete(key);
    }, this.cacheConfig.ttl);
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.cacheConfig.maxSize,
      hitRate: 0, // TODO: Implement hit rate tracking
    };
  }
}

// Global validation middleware instance
export const validationMiddleware = new ValidationMiddleware({
  enabled: true,
  maxSize: 1000,
  ttl: 5 * 60 * 1000, // 5 minutes
});

// Convenience functions for common validation patterns
export const validate = {
  /**
   * Create request validation middleware
   */
  request: (config: RequestValidationConfig) => validationMiddleware.validate(config),

  /**
   * Create response validation middleware
   */
  response: (config: ResponseValidationConfig) => validationMiddleware.validateResponse(config),

  /**
   * Validate only request body
   */
  body: (schema: z.ZodSchema, options?: ValidationOptions) => 
    validationMiddleware.validate({ body: schema, options }),

  /**
   * Validate only path parameters
   */
  params: (schema: z.ZodSchema, options?: ValidationOptions) => 
    validationMiddleware.validate({ params: schema, options }),

  /**
   * Validate only query parameters
   */
  query: (schema: z.ZodSchema, options?: ValidationOptions) => 
    validationMiddleware.validate({ query: schema, options }),

  /**
   * Validate only headers
   */
  headers: (schema: z.ZodSchema, options?: ValidationOptions) => 
    validationMiddleware.validate({ headers: schema, options }),
} as const;

// Export legacy compatibility function
export const legacyValidate = validate.request;