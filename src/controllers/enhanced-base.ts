/**
 * @fileoverview Enhanced BaseController with response serialization
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Response serialization, data transforms, pagination, CRUD operations, caching
 * Main APIs: EnhancedBaseController, handleRequest(), handlePaginatedRequest(), handleCreate()
 * Constraints: Requires ResponseSerializer, DataTransforms, Express middleware support
 * Patterns: Template method, middleware composition, comprehensive error mapping
 */

import { Request, Response, NextFunction } from 'express';
import { container, LOGGER } from '@container/index';
import { ResponseSerializer, SerializationOptions } from '@utils/serializers';
import { DataTransforms, TransformOptions } from '@utils/serializers/transforms';
import type { Logger } from 'winston';

/**
 * Controller options for request handling
 */
export interface ControllerOptions {
  serialization?: SerializationOptions;
  transforms?: TransformOptions;
  caching?: {
    ttl: number;
    key?: string;
    tags?: string[];
  };
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

/**
 * Enhanced BaseController with serialization support
 */
export abstract class EnhancedBaseController {
  protected logger: Logger;

  constructor() {
    this.logger = container.resolve<Logger>(LOGGER);
  }

  /**
   * Enhanced request handler with serialization support
   */
  protected async handleRequest(
    req: Request,
    res: Response,
    handler: () => Promise<any>,
    options: ControllerOptions = {}
  ): Promise<void> {
    const startTime = Date.now();
    const serializer = new ResponseSerializer(req, res);

    try {
      // Execute the handler
      const result = await handler();

      // Apply data transformations if specified
      const transformedResult = this.applyTransforms(result, options.transforms);

      // Send successful response with serialization
      serializer.success(transformedResult, {
        statusCode: 200,
        serializationOptions: options.serialization,
        meta: {
          executionTime: Date.now() - startTime,
          ...(options.caching && {
            cached: false,
            cacheExpiry: new Date(Date.now() + options.caching.ttl * 1000).toISOString()
          })
        }
      });

    } catch (error) {
      // Log the error with context
      this.logger.error('Request handler error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        controller: this.constructor.name,
        method: req.method,
        url: req.url,
        requestId: req.requestId,
        executionTime: Date.now() - startTime,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Send error response
      serializer.error(error as Error, {
        statusCode: this.getErrorStatusCode(error),
        includeStack: process.env['NODE_ENV'] === 'development'
      });
    }
  }

  /**
   * Handle paginated requests
   */
  protected async handlePaginatedRequest(
    req: Request,
    res: Response,
    handler: (pagination: { page: number; pageSize: number }) => Promise<{
      data: any[];
      totalCount: number;
    }>,
    options: ControllerOptions = {}
  ): Promise<void> {
    const serializer = new ResponseSerializer(req, res);

    try {
      // Extract pagination parameters
      const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query['pageSize'] as string) || 20));

      // Execute handler with pagination
      const { data, totalCount } = await handler({ page, pageSize });

      // Apply transformations
      const transformedData = this.applyTransforms(data, options.transforms);

      // Send paginated response
      serializer.paginated(transformedData, { page, pageSize, totalCount }, {
        statusCode: 200,
        serializationOptions: options.serialization,
        meta: {
          filters: this.extractFilters(req),
          sorting: this.extractSorting(req)
        }
      });

    } catch (error) {
      serializer.error(error as Error, {
        statusCode: this.getErrorStatusCode(error)
      });
    }
  }

  /**
   * Handle resource creation
   */
  protected async handleCreate(
    req: Request,
    res: Response,
    handler: (data: any) => Promise<any>,
    options: ControllerOptions = {}
  ): Promise<void> {
    const serializer = new ResponseSerializer(req, res);

    try {
      const result = await handler(req.body);
      const transformedResult = this.applyTransforms(result, options.transforms);

      serializer.success(transformedResult, {
        statusCode: 201,
        serializationOptions: options.serialization
      });

    } catch (error) {
      serializer.error(error as Error, {
        statusCode: this.getErrorStatusCode(error)
      });
    }
  }

  /**
   * Handle resource updates
   */
  protected async handleUpdate(
    req: Request,
    res: Response,
    handler: (id: string, data: any) => Promise<any>,
    options: ControllerOptions = {}
  ): Promise<void> {
    const serializer = new ResponseSerializer(req, res);

    try {
      const id = req.params['id'];
      if (!id) {
        return serializer.error('Resource ID is required', { statusCode: 400 });
      }

      const result = await handler(id, req.body);
      
      if (!result) {
        return serializer.notFound('Resource');
      }

      const transformedResult = this.applyTransforms(result, options.transforms);

      serializer.success(transformedResult, {
        statusCode: 200,
        serializationOptions: options.serialization
      });

    } catch (error) {
      serializer.error(error as Error, {
        statusCode: this.getErrorStatusCode(error)
      });
    }
  }

  /**
   * Handle resource deletion
   */
  protected async handleDelete(
    req: Request,
    res: Response,
    handler: (id: string) => Promise<boolean>,
    _options: ControllerOptions = {}
  ): Promise<void> {
    const serializer = new ResponseSerializer(req, res);

    try {
      const id = req.params['id'];
      if (!id) {
        return serializer.error('Resource ID is required', { statusCode: 400 });
      }

      const deleted = await handler(id);
      
      if (!deleted) {
        return serializer.notFound('Resource');
      }

      serializer.success({ deleted: true }, { statusCode: 200 });

    } catch (error) {
      serializer.error(error as Error, {
        statusCode: this.getErrorStatusCode(error)
      });
    }
  }

  /**
   * Handle resource retrieval by ID
   */
  protected async handleGetById(
    req: Request,
    res: Response,
    handler: (id: string) => Promise<any>,
    options: ControllerOptions = {}
  ): Promise<void> {
    const serializer = new ResponseSerializer(req, res);

    try {
      const id = req.params['id'];
      if (!id) {
        return serializer.error('Resource ID is required', { statusCode: 400 });
      }

      const result = await handler(id);
      
      if (!result) {
        return serializer.notFound('Resource');
      }

      const transformedResult = this.applyTransforms(result, options.transforms);

      serializer.success(transformedResult, {
        statusCode: 200,
        serializationOptions: options.serialization
      });

    } catch (error) {
      serializer.error(error as Error, {
        statusCode: this.getErrorStatusCode(error)
      });
    }
  }

  /**
   * Apply data transformations
   */
  private applyTransforms(data: any, transforms?: TransformOptions): any {
    if (!transforms || !data) {
      return data;
    }

    let transformed = data;

    // Apply date transformations
    if (transforms.dateFormat) {
      transformed = DataTransforms.transformDates(
        transformed,
        ['createdAt', 'updatedAt', 'publishDate', 'lastChecked'],
        transforms.dateFormat,
        transforms.timezone
      );
    }

    // Apply URL sanitization
    if (transforms.urlSanitization) {
      transformed = DataTransforms.sanitizeUrls(transformed);
    }

    // Remove nulls if requested
    if (!transforms.includeNulls) {
      transformed = DataTransforms.removeNulls(transformed);
    }

    // Convert to camelCase if requested
    if (transforms.camelCaseKeys) {
      transformed = DataTransforms.toCamelCase(transformed);
    }

    return transformed;
  }

  /**
   * Extract filter parameters from request
   */
  private extractFilters(req: Request): Record<string, any> {
    const filters: Record<string, any> = {};
    const filterKeys = ['category', 'type', 'status', 'author', 'source', 'tag'];

    filterKeys.forEach(key => {
      if (req.query[key]) {
        filters[key] = req.query[key];
      }
    });

    // Date range filters
    if (req.query['startDate'] || req.query['endDate']) {
      filters['dateRange'] = {
        start: req.query['startDate'],
        end: req.query['endDate']
      };
    }

    // Search query
    if (req.query['q'] || req.query['search']) {
      filters['search'] = req.query['q'] || req.query['search'];
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }

  /**
   * Extract sorting parameters from request
   */
  private extractSorting(req: Request): { field: string; direction: 'asc' | 'desc' } | undefined {
    const sortBy = req.query['sortBy'] as string;
    const sortOrder = req.query['sortOrder'] as string;

    if (sortBy) {
      return {
        field: sortBy,
        direction: sortOrder === 'desc' ? 'desc' : 'asc'
      };
    }

    return undefined;
  }

  /**
   * Determine appropriate HTTP status code for error
   */
  private getErrorStatusCode(error: any): number {
    if (error.name === 'ValidationError') return 422;
    if (error.name === 'NotFoundError') return 404;
    if (error.name === 'UnauthorizedError') return 401;
    if (error.name === 'ForbiddenError') return 403;
    if (error.name === 'ConflictError') return 409;
    if (error.name === 'RateLimitError') return 429;
    if (error.statusCode) return error.statusCode;
    
    return 500;
  }

  /**
   * Middleware factory for consistent request handling
   */
  protected withErrorHandling(
    handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
    _options: ControllerOptions = {}
  ) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await handler(req, res, next);
      } catch (error) {
        const serializer = new ResponseSerializer(req, res);
        serializer.error(error as Error, {
          statusCode: this.getErrorStatusCode(error)
        });
      }
    };
  }

  /**
   * Add caching headers to response
   */
  protected addCacheHeaders(
    res: Response,
    options: {
      maxAge: number;
      mustRevalidate?: boolean;
      private?: boolean;
      etag?: string;
    }
  ): void {
    const { maxAge, mustRevalidate = false, private: isPrivate = false, etag } = options;

    let cacheControl = isPrivate ? 'private' : 'public';
    cacheControl += `, max-age=${maxAge}`;
    
    if (mustRevalidate) {
      cacheControl += ', must-revalidate';
    }

    res.setHeader('Cache-Control', cacheControl);

    if (etag) {
      res.setHeader('ETag', etag);
    }
  }

  /**
   * Generate ETag for response data
   */
  protected generateETag(data: any): string {
    const crypto = require('crypto');
    const dataString = JSON.stringify(data);
    return crypto.createHash('md5').update(dataString).digest('hex');
  }
}