/**
 * @fileoverview Authentication middleware for JWT token validation
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: JWT auth, API key validation, role-based access, optional auth, HTTPS enforcement
 * Main APIs: authenticateJWT(), authenticateAPIKey(), requireRole(), devAuthBypass()
 * Constraints: Requires JWT_SECRET, container DI, OAuth/API key services
 * Patterns: All throw 401/403 errors, user context injection, token extraction
 */

import { Request, Response, NextFunction } from 'express';
import { container } from '@container/setup';
import { TOKENS } from '@container/tokens';
import { OAuthService } from '@services/auth/oauth';
import { ApiKeyService } from '@services/auth/api-key';
import { AuthenticatedRequest } from './index';
import logger from '@utils/logger';
import { config } from '@config/index';

/**
 * JWT authentication middleware
 * Validates JWT tokens and adds user context to request
 */
export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        error: 'Authorization header required',
        code: 'MISSING_AUTH_HEADER'
      });
      return;
    }

    const token = extractBearerToken(authHeader);
    if (!token) {
      res.status(401).json({
        error: 'Invalid authorization format. Use: Bearer <token>',
        code: 'INVALID_AUTH_FORMAT'
      });
      return;
    }

    const oauthService = container.get<OAuthService>(TOKENS.OAuthService);
    const user = await oauthService.verifyAccessToken(token);

    // Add user to request context
    req.user = {
      id: user.id,
      email: user.email
    };

    // Log successful authentication
    logger.info('User authenticated via JWT', {
      userId: user.id,
      email: user.email,
      endpoint: req.path
    });

    next();
  } catch (error) {
    logger.warn('JWT authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: req.path,
      ip: req.ip
    });

    res.status(401).json({
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
};

/**
 * Optional JWT authentication middleware
 * Adds user context if valid token is provided, but doesn't require it
 */
export const optionalAuthenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      next();
      return;
    }

    const token = extractBearerToken(authHeader);
    if (!token) {
      next();
      return;
    }

    const oauthService = container.get<OAuthService>(TOKENS.OAuthService);
    const user = await oauthService.verifyAccessToken(token);

    req.user = {
      id: user.id,
      email: user.email
    };

    logger.debug('Optional authentication successful', {
      userId: user.id,
      endpoint: req.path
    });
  } catch (error) {
    // Silently continue without authentication for optional middleware
    logger.debug('Optional authentication failed, continuing without auth', {
      endpoint: req.path
    });
  }

  next();
};

/**
 * API key authentication middleware
 * Validates API keys for service-to-service communication
 */
export const authenticateAPIKey = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        error: 'API key required',
        code: 'MISSING_API_KEY'
      });
      return;
    }

    // Validate API key (implement API key service)
    const isValid = await validateAPIKey(apiKey);
    
    if (!isValid) {
      res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
      return;
    }

    logger.info('API key authentication successful', {
      keyPrefix: apiKey.substring(0, 8) + '...',
      endpoint: req.path
    });

    next();
  } catch (error) {
    logger.error('API key authentication error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: req.path
    });

    res.status(500).json({
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Role-based access control middleware
 * Requires specific user roles or permissions
 */
export const requireRole = (requiredRoles: string[]) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    try {
      // Get user roles (implement user role service)
      const userRoles = await getUserRoles(req.user.id);
      
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        logger.warn('Insufficient permissions', {
          userId: req.user.id,
          requiredRoles,
          userRoles,
          endpoint: req.path
        });

        res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: requiredRoles
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Role check error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user.id
      });

      res.status(500).json({
        error: 'Authorization service error',
        code: 'AUTHZ_SERVICE_ERROR'
      });
    }
  };
};

/**
 * Rate limiting by user ID
 * Applies different rate limits based on user authentication
 */
export const userRateLimit = (limits: { authenticated: number; anonymous: number }) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const limit = req.user ? limits.authenticated : limits.anonymous;
    
    // Store limit in request for rate limiting middleware to use
    (req as any).rateLimit = { max: limit };
    
    next();
  };
};

/**
 * Development-only authentication bypass
 * Allows bypassing authentication in development environment
 */
export const devAuthBypass = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (config.nodeEnv === 'development' && req.headers['x-dev-bypass'] === 'true') {
    req.user = {
      id: 'dev-user-id',
      email: 'dev@example.com'
    };
    
    logger.warn('Development authentication bypass used', {
      endpoint: req.path,
      ip: req.ip
    });
  }
  
  next();
};

/**
 * Helper functions
 */
function extractBearerToken(authHeader: string): string | null {
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  return parts[1];
}

async function validateAPIKey(apiKey: string): Promise<boolean> {
  try {
    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    const result = await apiKeyService.validateApiKey(apiKey);
    return result.isValid;
  } catch (error) {
    logger.error('API key validation service error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

async function getUserRoles(userId: string): Promise<string[]> {
  // TODO: Implement user role fetching
  // This should fetch user roles from database
  // For now, return empty array
  return [];
}

/**
 * Middleware to ensure HTTPS in production
 */
export const requireHTTPS = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (config.nodeEnv === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    logger.warn('HTTP request in production, redirecting to HTTPS', {
      url: req.url,
      ip: req.ip
    });
    
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  
  next();
};