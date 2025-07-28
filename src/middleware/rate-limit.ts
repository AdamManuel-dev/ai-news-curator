/**
 * @fileoverview Rate limiting middleware for API protection
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Redis-backed rate limiting, tiered limits, dynamic limits, API key integration
 * Main APIs: createRateLimiter(), dynamicRateLimit(), various preset limiters
 * Constraints: Requires Redis, express-rate-limit, API key service, metrics
 * Patterns: Middleware factory, tier-based limits, custom key generation, skip conditions
 */

import rateLimit, { RateLimitRequestHandler, Options } from 'express-rate-limit';
import { Request, Response } from 'express';
import { RedisStore } from './rate-limit-redis-store';
import { container } from '@container/setup';
import { TOKENS } from '@container/tokens';
import { ApiKeyService } from '@services/auth/api-key';
import { AuthenticatedRequest } from './index';
import { metrics } from './metrics';
import logger from '@utils/logger';
import { config } from '@config/index';

/**
 * Rate limit configuration options
 */
export interface RateLimitConfig {
  windowMs?: number;
  max?: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Rate limit tiers for different user types
 */
export enum RateLimitTier {
  ANONYMOUS = 'anonymous',
  AUTHENTICATED = 'authenticated',
  PREMIUM = 'premium',
  API_KEY = 'api_key',
  ADMIN = 'admin'
}

/**
 * Default rate limit configurations by tier
 */
const RATE_LIMIT_TIERS = {
  [RateLimitTier.ANONYMOUS]: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
  },
  [RateLimitTier.AUTHENTICATED]: {
    windowMs: 15 * 60 * 1000,
    max: 1000
  },
  [RateLimitTier.PREMIUM]: {
    windowMs: 15 * 60 * 1000,
    max: 5000
  },
  [RateLimitTier.API_KEY]: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10000
  },
  [RateLimitTier.ADMIN]: {
    windowMs: 15 * 60 * 1000,
    max: 50000
  }
};

/**
 * Create rate limiter with Redis store
 */
function createRateLimiter(config: RateLimitConfig): RateLimitRequestHandler {
  const store = new RedisStore({
    windowMs: config.windowMs || 15 * 60 * 1000,
    client: container.get(TOKENS.REDIS_ADAPTER)
  });

  const options: Partial<Options> = {
    windowMs: config.windowMs || 15 * 60 * 1000,
    max: config.max || 100,
    message: config.message || 'Too many requests, please try again later.',
    standardHeaders: config.standardHeaders ?? true,
    legacyHeaders: config.legacyHeaders ?? false,
    skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
    skipFailedRequests: config.skipFailedRequests ?? false,
    store,
    
    // Custom key generator
    keyGenerator: (req: Request) => {
      const authReq = req as AuthenticatedRequest;
      
      // Use user ID if authenticated
      if (authReq.user?.id) {
        return `user:${authReq.user.id}`;
      }
      
      // Use API key if present
      const apiKey = req.headers['x-api-key'] as string;
      if (apiKey) {
        // Hash the API key for security
        const crypto = require('crypto');
        const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
        return `apikey:${hashedKey.substring(0, 16)}`;
      }
      
      // Fall back to IP address
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `ip:${ip}`;
    },

    // Custom handler for rate limit exceeded
    handler: (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: authReq.user?.id,
        endpoint: req.path,
        method: req.method,
        userAgent: req.get('user-agent')
      });

      // Increment rate limit metrics
      metrics.rateLimitExceeded.inc({
        endpoint: req.path,
        method: req.method
      });

      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: config.message || 'Too many requests, please try again later.',
        retryAfter: res.getHeader('Retry-After')
      });
    }
  };

  return rateLimit(options);
}

/**
 * Global rate limiter - applies to all routes
 */
export const globalRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.maxRequestsPerHour / 4, // Divide by 4 for 15-minute window
  message: 'Too many requests from this IP, please try again later.'
});

/**
 * Strict rate limiter - for sensitive endpoints
 */
export const strictRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: 'Too many attempts, please try again later.',
  skipSuccessfulRequests: false
});

/**
 * Authentication rate limiter - for login/register endpoints
 */
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true // Don't count successful logins
});

/**
 * API rate limiter - for API endpoints
 */
export const apiRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.maxRequestsPerHour,
  message: 'API rate limit exceeded, please upgrade your plan or try again later.'
});

/**
 * Dynamic rate limiter - adjusts limits based on user type
 */
export const dynamicRateLimit = (req: Request, res: Response, next: Function): void => {
  const authReq = req as AuthenticatedRequest;
  let tier = RateLimitTier.ANONYMOUS;
  let customMax: number | undefined;

  // Check for API key with custom rate limit
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    // Check API key rate limit asynchronously
    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    apiKeyService.validateApiKey(apiKey).then(result => {
      if (result.isValid && result.key) {
        // Use API key's custom rate limit
        customMax = result.key.rate_limit;
        tier = RateLimitTier.API_KEY;
        
        // Log API key usage
        apiKeyService.logApiKeyUsage(
          result.key.id,
          req.path,
          res.statusCode,
          Date.now() - req.startTime
        ).catch(err => {
          logger.debug('Failed to log API key usage', { error: err });
        });
      }
    }).catch(err => {
      logger.error('API key validation error in rate limiter', { error: err });
    });
  }
  // Check for authenticated user
  else if (authReq.user) {
    // TODO: Check user subscription level
    tier = RateLimitTier.AUTHENTICATED;
  }

  // Get tier configuration
  const tierConfig = RATE_LIMIT_TIERS[tier];
  const rateLimitConfig: RateLimitConfig = {
    windowMs: tierConfig.windowMs,
    max: customMax || tierConfig.max,
    message: `Rate limit exceeded for ${tier} tier`
  };

  // Create and apply rate limiter
  const limiter = createRateLimiter(rateLimitConfig);
  limiter(req, res, next);
};

/**
 * Skip rate limiting for certain conditions
 */
export const skipRateLimit = (req: Request): boolean => {
  // Skip for health checks
  if (req.path === '/health' || req.path === '/health/ready') {
    return true;
  }

  // Skip for metrics endpoint (Prometheus)
  if (req.path === '/metrics') {
    return true;
  }

  // Skip in development mode (optional)
  if (config.nodeEnv === 'development' && req.headers['x-skip-rate-limit'] === 'true') {
    logger.debug('Rate limit skipped in development', { path: req.path });
    return true;
  }

  return false;
};

/**
 * Content creation rate limiter - prevent spam
 */
export const contentRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.maxArticlesPerHour,
  message: 'Content creation rate limit exceeded, please try again later.',
  skipFailedRequests: true // Only count successful content creation
});

/**
 * Search rate limiter - prevent abuse
 */
export const searchRateLimit = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many search requests, please slow down.'
});

/**
 * Rate limiter for expensive operations
 */
export const expensiveOperationRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'This operation is resource-intensive. Please wait before trying again.',
  skipFailedRequests: false
});

/**
 * Custom rate limit middleware with skip logic
 */
export const rateLimitMiddleware = (config?: RateLimitConfig) => {
  const limiter = config ? createRateLimiter(config) : globalRateLimit;
  
  return (req: Request, res: Response, next: Function): void => {
    // Add start time for response time tracking
    req.startTime = Date.now();

    if (skipRateLimit(req)) {
      return next();
    }

    limiter(req, res, next);
  };
};

/**
 * Rate limit info endpoint - returns current limits for user
 */
export const getRateLimitInfo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tier = req.user ? RateLimitTier.AUTHENTICATED : RateLimitTier.ANONYMOUS;
    const tierConfig = RATE_LIMIT_TIERS[tier];

    // Check for API key
    const apiKey = req.headers['x-api-key'] as string;
    let apiKeyLimit = null;

    if (apiKey) {
      const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
      const result = await apiKeyService.validateApiKey(apiKey);
      
      if (result.isValid && result.key) {
        const rateLimitInfo = await apiKeyService.checkRateLimit(result.key.id);
        apiKeyLimit = {
          limit: result.key.rate_limit,
          remaining: rateLimitInfo.remaining,
          reset: rateLimitInfo.resetTime,
          window: '1 hour'
        };
      }
    }

    res.json({
      tier,
      limits: {
        requests: {
          limit: tierConfig.max,
          window: `${tierConfig.windowMs / 1000 / 60} minutes`,
          ...(apiKeyLimit && { apiKey: apiKeyLimit })
        },
        content: {
          limit: config.maxArticlesPerHour,
          window: '1 hour'
        }
      },
      headers: {
        'X-RateLimit-Limit': res.getHeader('X-RateLimit-Limit'),
        'X-RateLimit-Remaining': res.getHeader('X-RateLimit-Remaining'),
        'X-RateLimit-Reset': res.getHeader('X-RateLimit-Reset')
      }
    });
  } catch (error) {
    logger.error('Failed to get rate limit info', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Failed to retrieve rate limit information',
      code: 'RATE_LIMIT_INFO_ERROR'
    });
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
    }
  }
}