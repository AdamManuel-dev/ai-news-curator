/**
 * @fileoverview HTTP caching middleware for Express
 * 
 * Provides HTTP-level caching functionality including ETag generation,
 * conditional requests, cache headers, and response caching middleware.
 * 
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { CacheService } from '@services/cache';
import { CacheManager } from '@services/cache-manager';
import logger from '@utils/logger';

// Cache middleware configuration
export interface CacheMiddlewareConfig {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
  varyBy?: string[];
  includeQuery?: boolean;
  includeHeaders?: string[];
}

// HTTP cache headers configuration
export interface CacheHeadersConfig {
  maxAge?: number;
  sMaxAge?: number;
  mustRevalidate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  private?: boolean;
  public?: boolean;
  immutable?: boolean;
  staleWhileRevalidate?: number;
}

/**
 * HTTP caching middleware factory
 */
export class CacheMiddleware {
  private cacheManager: CacheManager;

  constructor(cacheService: CacheService) {
    this.cacheManager = new CacheManager(cacheService);
  }

  /**
   * Response caching middleware
   */
  cache(config: CacheMiddlewareConfig = {}) {
    const {
      ttl = 300, // 5 minutes default
      keyGenerator = this.defaultKeyGenerator,
      condition = this.defaultCondition,
      varyBy = [],
      includeQuery = true,
      includeHeaders = [],
    } = config;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Skip caching if condition not met
      if (!condition(req, res)) {
        return next();
      }

      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }

      try {
        const cacheKey = this.generateCacheKey(req, {
          keyGenerator,
          varyBy,
          includeQuery,
          includeHeaders,
        });

        // Try to get cached response
        const cached = await this.cacheManager.get<{
          data: any;
          headers: Record<string, string>;
          statusCode: number;
        }>(cacheKey);

        if (cached) {
          logger.debug('Serving cached response', { cacheKey, path: req.path });
          
          // Set cached headers
          Object.entries(cached.headers).forEach(([key, value]) => {
            res.set(key, value);
          });
          
          // Add cache hit header
          res.set('X-Cache', 'HIT');
          res.set('X-Cache-Key', cacheKey);
          
          res.status(cached.statusCode).json(cached.data);
          return;
        }

        // Cache miss - intercept response
        const originalSend = res.json;
        const originalStatus = res.status;
        let statusCode = 200;

        // Override status method to capture status code
        res.status = function(code: number) {
          statusCode = code;
          return originalStatus.call(this, code);
        };

        // Override json method to capture and cache response
        const self = this;
        res.json = function(data: any) {
          // Only cache successful responses
          if (statusCode >= 200 && statusCode < 300) {
            const responseData = {
              data,
              headers: res.getHeaders(),
              statusCode,
            };

            // Cache the response asynchronously
            setImmediate(async () => {
              try {
                await self.cacheManager.set(cacheKey, responseData, ttl);
                logger.debug('Response cached', { cacheKey, statusCode, path: req.path });
              } catch (error) {
                logger.error('Failed to cache response', { 
                  cacheKey, 
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            });
          }

          // Add cache miss header
          res.set('X-Cache', 'MISS');
          res.set('X-Cache-Key', cacheKey);

          return originalSend.call(res, data);
        };

        next();
      } catch (error) {
        logger.error('Cache middleware error', { 
          error: error instanceof Error ? error.message : String(error),
          path: req.path 
        });
        next();
      }
    };
  }

  /**
   * ETag middleware for conditional requests
   */
  etag(options: { weak?: boolean } = {}) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const originalSend = res.json;

      res.json = function(data: any) {
        const content = JSON.stringify(data);
        const etag = CacheMiddleware.generateETag(content, options.weak);
        
        this.set('ETag', etag);

        // Handle conditional requests
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
          return this.status(304).end();
        }

        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Cache headers middleware
   */
  headers(config: CacheHeadersConfig) {
    return (_req: Request, res: Response, next: NextFunction): void => {
      const cacheControl: string[] = [];

      if (config.private) {
        cacheControl.push('private');
      } else if (config.public) {
        cacheControl.push('public');
      }

      if (config.maxAge !== undefined) {
        cacheControl.push(`max-age=${config.maxAge}`);
      }

      if (config.sMaxAge !== undefined) {
        cacheControl.push(`s-maxage=${config.sMaxAge}`);
      }

      if (config.mustRevalidate) {
        cacheControl.push('must-revalidate');
      }

      if (config.noCache) {
        cacheControl.push('no-cache');
      }

      if (config.noStore) {
        cacheControl.push('no-store');
      }

      if (config.immutable) {
        cacheControl.push('immutable');
      }

      if (config.staleWhileRevalidate !== undefined) {
        cacheControl.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
      }

      if (cacheControl.length > 0) {
        res.set('Cache-Control', cacheControl.join(', '));
      }

      next();
    };
  }

  /**
   * Cache invalidation middleware
   */
  invalidate(patterns: string[] | ((req: Request) => string[])) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const originalSend = res.json;

      const self = this;
      res.json = function(data: any) {
        // Invalidate cache after successful response
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setImmediate(async () => {
            let invalidationPatterns: string[] = [];
            try {
              invalidationPatterns = Array.isArray(patterns) 
                ? patterns 
                : patterns(req);

              for (const pattern of invalidationPatterns) {
                await self.cacheManager.invalidatePattern({ 
                  pattern, 
                  reason: `API ${req.method} ${req.path}` 
                });
              }
            } catch (error) {
              logger.error('Cache invalidation failed', { 
                patterns: invalidationPatterns,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          });
        }

        return originalSend.call(res, data);
      };

      next();
    };
  }

  /**
   * Conditional caching based on user roles/permissions
   */
  conditionalCache(config: CacheMiddlewareConfig & {
    userSpecific?: boolean;
    roleBasedTtl?: Record<string, number>;
  }) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const user = (req as any).user;
      
      // Modify TTL based on user role
      if (config.roleBasedTtl && user?.role) {
        config.ttl = config.roleBasedTtl[user.role] || config.ttl;
      }

      // Modify key generator for user-specific caching
      if (config.userSpecific && user?.id) {
        const originalKeyGenerator = config.keyGenerator || this.defaultKeyGenerator;
        config.keyGenerator = (req: Request) => {
          const baseKey = originalKeyGenerator(req);
          return `${baseKey}:user:${user.id}`;
        };
      }

      const middleware = this.cache(config);
      await middleware(req, res, next);
    };
  }

  // Private helper methods
  private defaultKeyGenerator(req: Request): string {
    return `http:${req.method}:${req.path}`;
  }

  private defaultCondition(req: Request, _res: Response): boolean {
    return req.method === 'GET';
  }

  private generateCacheKey(req: Request, options: {
    keyGenerator: (req: Request) => string;
    varyBy: string[];
    includeQuery: boolean;
    includeHeaders: string[];
  }): string {
    let key = options.keyGenerator(req);

    // Include query parameters
    if (options.includeQuery && Object.keys(req.query).length > 0) {
      const sortedQuery = Object.keys(req.query)
        .sort()
        .map(k => `${k}=${req.query[k]}`)
        .join('&');
      key += `:query:${crypto.createHash('md5').update(sortedQuery).digest('hex')}`;
    }

    // Include specified headers
    if (options.includeHeaders.length > 0) {
      const headerValues = options.includeHeaders
        .map(header => req.headers[header.toLowerCase()] || '')
        .join('|');
      key += `:headers:${crypto.createHash('md5').update(headerValues).digest('hex')}`;
    }

    // Include vary-by parameters
    if (options.varyBy.length > 0) {
      const varyValues = options.varyBy
        .map(param => (req as any)[param] || '')
        .join('|');
      key += `:vary:${crypto.createHash('md5').update(varyValues).digest('hex')}`;
    }

    return key;
  }

  private static generateETag(content: string, weak = false): string {
    const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
    return weak ? `W/"${hash}"` : `"${hash}"`;
  }
}

/**
 * Utility functions for common caching patterns
 */
export class CachePatterns {
  
  /**
   * Short-term cache for frequently changing data
   */
  static shortTerm(ttl = 300): CacheMiddlewareConfig {
    return {
      ttl,
      condition: (req) => req.method === 'GET',
    };
  }

  /**
   * Long-term cache for stable data
   */
  static longTerm(ttl = 3600): CacheMiddlewareConfig {
    return {
      ttl,
      condition: (req) => req.method === 'GET',
    };
  }

  /**
   * User-specific caching
   */
  static userSpecific(ttl = 600): CacheMiddlewareConfig {
    return {
      ttl,
      keyGenerator: (req) => {
        const user = (req as any).user;
        return `user:${user?.id || 'anonymous'}:${req.path}`;
      },
      condition: (req) => req.method === 'GET',
    };
  }

  /**
   * API endpoint caching with query parameters
   */
  static apiEndpoint(ttl = 300): CacheMiddlewareConfig {
    return {
      ttl,
      includeQuery: true,
      condition: (req) => req.method === 'GET',
    };
  }

  /**
   * Content-based caching with ETags
   */
  static contentBased(ttl = 1800): CacheMiddlewareConfig {
    return {
      ttl,
      includeHeaders: ['accept', 'accept-language'],
      condition: (req) => req.method === 'GET',
    };
  }
}

/**
 * Cache headers presets
 */
export class CacheHeaders {
  
  static shortCache(maxAge = 300): CacheHeadersConfig {
    return {
      public: true,
      maxAge,
      staleWhileRevalidate: maxAge * 2,
    };
  }

  static longCache(maxAge = 3600): CacheHeadersConfig {
    return {
      public: true,
      maxAge,
      immutable: true,
    };
  }

  static noCache(): CacheHeadersConfig {
    return {
      noCache: true,
      mustRevalidate: true,
    };
  }

  static privateCache(maxAge = 300): CacheHeadersConfig {
    return {
      private: true,
      maxAge,
    };
  }

  static cdnCache(maxAge = 3600, sMaxAge = 86400): CacheHeadersConfig {
    return {
      public: true,
      maxAge,
      sMaxAge,
      staleWhileRevalidate: 3600,
    };
  }
}