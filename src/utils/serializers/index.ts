/**
 * @fileoverview Response serialization utilities
 * 
 * Provides comprehensive response serialization with support for:
 * - Standardized API response formats
 * - Data transformation and filtering
 * - Pagination and metadata
 * - Field inclusion/exclusion
 * - Nested resource serialization
 * - Performance optimization through selective serialization
 * 
 * @module utils/serializers
 */

import { Request, Response } from 'express';
import logger from '@utils/logger';

/**
 * Standard API response format
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string | ErrorDetails;
  meta?: ResponseMeta;
  requestId?: string;
  timestamp: string;
}

/**
 * Detailed error information
 */
export interface ErrorDetails {
  message: string;
  code?: string;
  details?: Record<string, any>;
  stack?: string;
}

/**
 * Response metadata
 */
export interface ResponseMeta {
  pagination?: PaginationMeta;
  filters?: Record<string, any>;
  sorting?: SortingMeta;
  version?: string;
  executionTime?: number;
  cached?: boolean;
  cacheExpiry?: string;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  nextPage?: number;
  previousPage?: number;
}

/**
 * Sorting metadata
 */
export interface SortingMeta {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Serialization options
 */
export interface SerializationOptions {
  includeFields?: string[];
  excludeFields?: string[];
  includeRelations?: string[];
  maxDepth?: number;
  timezone?: string;
  locale?: string;
  format?: 'compact' | 'detailed';
  transform?: (data: any) => any;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
  totalCount: number;
}

/**
 * Main response serializer class
 */
export class ResponseSerializer {
  private startTime: number;
  private req: Request;
  private res: Response;

  constructor(req: Request, res: Response) {
    this.req = req;
    this.res = res;
    this.startTime = Date.now();
  }

  /**
   * Send successful response with data
   */
  success<T>(
    data: T,
    options: {
      statusCode?: number;
      meta?: Partial<ResponseMeta>;
      serializationOptions?: SerializationOptions;
    } = {}
  ): void {
    const {
      statusCode = 200,
      meta = {},
      serializationOptions = {}
    } = options;

    try {
      // Serialize the data
      const serializedData = this.serializeData(data, serializationOptions);

      // Build response metadata
      const responseMeta: ResponseMeta = {
        ...meta,
        executionTime: Date.now() - this.startTime,
        version: this.getApiVersion(),
        ...meta
      };

      const response: ApiResponse<T> = {
        success: true,
        data: serializedData,
        meta: responseMeta,
        requestId: this.req.requestId,
        timestamp: new Date().toISOString()
      };

      this.res.status(statusCode).json(this.cleanResponse(response));

      // Log successful response
      logger.debug('Successful API response', {
        statusCode,
        executionTime: responseMeta.executionTime,
        requestId: this.req.requestId,
        endpoint: `${this.req.method} ${this.req.path}`,
        dataSize: JSON.stringify(serializedData).length
      });

    } catch (error) {
      logger.error('Response serialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: this.req.requestId
      });

      // Fall back to basic response
      this.res.status(500).json({
        success: false,
        error: 'Response serialization failed',
        requestId: this.req.requestId,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send paginated response
   */
  paginated<T>(
    data: T[],
    pagination: PaginationOptions,
    options: {
      statusCode?: number;
      meta?: Partial<ResponseMeta>;
      serializationOptions?: SerializationOptions;
    } = {}
  ): void {
    const { page, pageSize, totalCount } = pagination;
    const totalPages = Math.ceil(totalCount / pageSize);

    const paginationMeta: PaginationMeta = {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      nextPage: page < totalPages ? page + 1 : undefined,
      previousPage: page > 1 ? page - 1 : undefined
    };

    this.success(data, {
      ...options,
      meta: {
        ...options.meta,
        pagination: paginationMeta
      }
    });
  }

  /**
   * Send error response
   */
  error(
    error: string | Error | ErrorDetails,
    options: {
      statusCode?: number;
      details?: Record<string, any>;
      includeStack?: boolean;
    } = {}
  ): void {
    const {
      statusCode = 400,
      details = {},
      includeStack = process.env['NODE_ENV'] === 'development'
    } = options;

    let errorResponse: ErrorDetails;

    if (typeof error === 'string') {
      errorResponse = {
        message: error,
        details
      };
    } else if (error instanceof Error) {
      errorResponse = {
        message: error.message,
        code: error.constructor.name,
        details,
        stack: includeStack ? error.stack : undefined
      };
    } else {
      errorResponse = {
        ...error,
        details: { ...error.details, ...details }
      };
    }

    const response: ApiResponse = {
      success: false,
      error: errorResponse,
      meta: {
        executionTime: Date.now() - this.startTime,
        version: this.getApiVersion()
      },
      requestId: this.req.requestId,
      timestamp: new Date().toISOString()
    };

    this.res.status(statusCode).json(this.cleanResponse(response));

    // Log error response
    logger.error('API error response', {
      statusCode,
      error: errorResponse.message,
      code: errorResponse.code,
      requestId: this.req.requestId,
      endpoint: `${this.req.method} ${this.req.path}`,
      userAgent: this.req.get('User-Agent'),
      ip: this.req.ip
    });
  }

  /**
   * Send validation error response
   */
  validationError(
    errors: Record<string, string[]>,
    message: string = 'Validation failed'
  ): void {
    this.error({
      message,
      code: 'ValidationError',
      details: { errors }
    }, {
      statusCode: 422
    });
  }

  /**
   * Send not found response
   */
  notFound(resource: string = 'Resource'): void {
    this.error(`${resource} not found`, {
      statusCode: 404
    });
  }

  /**
   * Send unauthorized response
   */
  unauthorized(message: string = 'Unauthorized'): void {
    this.error(message, {
      statusCode: 401
    });
  }

  /**
   * Send forbidden response
   */
  forbidden(message: string = 'Forbidden'): void {
    this.error(message, {
      statusCode: 403
    });
  }

  /**
   * Send rate limit exceeded response
   */
  rateLimitExceeded(retryAfter?: number): void {
    const headers: Record<string, string> = {};
    if (retryAfter) {
      headers['Retry-After'] = retryAfter.toString();
      Object.entries(headers).forEach(([key, value]) => {
        this.res.setHeader(key, value);
      });
    }

    this.error('Rate limit exceeded', {
      statusCode: 429,
      details: retryAfter ? { retryAfter } : {}
    });
  }

  /**
   * Serialize data based on options
   */
  private serializeData<T>(data: T, options: SerializationOptions): T {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const {
      includeFields,
      excludeFields,
      maxDepth = 3,
      transform,
      format = 'detailed'
    } = options;

    let serialized = data;

    // Apply transformation if provided
    if (transform) {
      serialized = transform(serialized);
    }

    // Apply field filtering
    if (includeFields || excludeFields) {
      serialized = this.filterFields(serialized, includeFields, excludeFields);
    }

    // Apply format-specific transformations
    if (format === 'compact') {
      serialized = this.compactFormat(serialized);
    }

    // Handle array data
    if (Array.isArray(serialized)) {
      return serialized.map(item => 
        this.serializeData(item, { ...options, maxDepth: maxDepth - 1 })
      ) as T;
    }

    return serialized;
  }

  /**
   * Filter fields based on include/exclude options
   */
  private filterFields<T>(
    data: T,
    includeFields?: string[],
    excludeFields?: string[]
  ): T {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const result: any = Array.isArray(data) ? [] : {};

    if (Array.isArray(data)) {
      return data.map(item => 
        this.filterFields(item, includeFields, excludeFields)
      ) as T;
    }

    Object.entries(data as any).forEach(([key, value]) => {
      // Check include fields
      if (includeFields && !includeFields.includes(key)) {
        return;
      }

      // Check exclude fields
      if (excludeFields && excludeFields.includes(key)) {
        return;
      }

      result[key] = value;
    });

    return result;
  }

  /**
   * Apply compact formatting
   */
  private compactFormat<T>(data: T): T {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Remove null and undefined values
    const cleaned: any = Array.isArray(data) ? [] : {};

    if (Array.isArray(data)) {
      return data.map(item => this.compactFormat(item)) as T;
    }

    Object.entries(data as any).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object') {
          const compactValue = this.compactFormat(value);
          if (Array.isArray(compactValue) ? compactValue.length > 0 : Object.keys(compactValue).length > 0) {
            cleaned[key] = compactValue;
          }
        } else {
          cleaned[key] = value;
        }
      }
    });

    return cleaned;
  }

  /**
   * Get API version from request headers or default
   */
  private getApiVersion(): string {
    return this.req.get('API-Version') || 
           this.req.get('Accept')?.match(/application\/vnd\.api\+json;version=(\d+)/)?.[1] || 
           'v1';
  }

  /**
   * Clean up response by removing undefined values
   */
  private cleanResponse(response: ApiResponse): ApiResponse {
    return JSON.parse(JSON.stringify(response));
  }
}

/**
 * Helper function to create response serializer
 */
export function createSerializer(req: Request, res: Response): ResponseSerializer {
  return new ResponseSerializer(req, res);
}

/**
 * Express middleware to add serializer to request
 */
export function serializerMiddleware(req: Request, res: Response, next: Function): void {
  // Add serializer instance to response object for easy access
  (res as any).serializer = new ResponseSerializer(req, res);
  next();
}

// Type augmentation for Express Response
declare global {
  namespace Express {
    interface Response {
      serializer?: ResponseSerializer;
    }
  }
}