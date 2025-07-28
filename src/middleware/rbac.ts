/**
 * @fileoverview Role-based access control (RBAC) middleware
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Permission checks, role validation, multi-permission support, resource protection
 * Main APIs: requirePermission(), requireRole(), requireAnyPermission(), requireAllPermissions()
 * Constraints: Requires authenticated user, RBAC service, dependency injection container
 * Patterns: Middleware factories, permission cascading, resource-based permissions
 */

import { Request, Response, NextFunction } from 'express';
import { container } from '../container/setup';
import { TOKENS } from '../container/tokens';
import { RBACService } from '../services/auth/rbac';
import { Logger } from 'winston';
import { AuthenticatedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errors/types';

export interface RBACRequest extends AuthenticatedRequest {
  userPermissions?: string[];
  userRoles?: string[];
}

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as RBACRequest;
      const rbacService = container.get<RBACService>(TOKENS.RBACService);
      const logger = container.get<Logger>(TOKENS.Logger);

      if (!authReq.user?.id) {
        return next(new ApiError('Authentication required', 401));
      }

      const hasPermission = await rbacService.hasPermission(authReq.user.id, permission);
      
      if (!hasPermission) {
        logger.warn('Permission denied', {
          userId: authReq.user.id,
          permission,
          endpoint: req.path,
          method: req.method
        });
        return next(new ApiError(`Permission denied: ${permission}`, 403));
      }

      logger.debug('Permission granted', {
        userId: authReq.user.id,
        permission,
        endpoint: req.path,
        method: req.method
      });

      next();
    } catch (error) {
      const logger = container.get<Logger>(TOKENS.Logger);
      logger.error('Error in permission check middleware', { permission, error });
      next(new ApiError('Permission check failed', 500));
    }
  };
};

export const requireRole = (roleName: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as RBACRequest;
      const rbacService = container.get<RBACService>(TOKENS.RBACService);
      const logger = container.get<Logger>(TOKENS.Logger);

      if (!authReq.user?.id) {
        return next(new ApiError('Authentication required', 401));
      }

      const hasRole = await rbacService.hasRole(authReq.user.id, roleName);
      
      if (!hasRole) {
        logger.warn('Role requirement not met', {
          userId: authReq.user.id,
          role: roleName,
          endpoint: req.path,
          method: req.method
        });
        return next(new ApiError(`Role required: ${roleName}`, 403));
      }

      logger.debug('Role requirement satisfied', {
        userId: authReq.user.id,
        role: roleName,
        endpoint: req.path,
        method: req.method
      });

      next();
    } catch (error) {
      const logger = container.get<Logger>(TOKENS.Logger);
      logger.error('Error in role check middleware', { roleName, error });
      next(new ApiError('Role check failed', 500));
    }
  };
};

export const requireAnyPermission = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as RBACRequest;
      const rbacService = container.get<RBACService>(TOKENS.RBACService);
      const logger = container.get<Logger>(TOKENS.Logger);

      if (!authReq.user?.id) {
        return next(new ApiError('Authentication required', 401));
      }

      for (const permission of permissions) {
        const hasPermission = await rbacService.hasPermission(authReq.user.id, permission);
        if (hasPermission) {
          logger.debug('Permission granted (any)', {
            userId: authReq.user.id,
            permission,
            permissions,
            endpoint: req.path,
            method: req.method
          });
          return next();
        }
      }

      logger.warn('No required permissions found', {
        userId: authReq.user.id,
        permissions,
        endpoint: req.path,
        method: req.method
      });

      next(new ApiError(`One of these permissions required: ${permissions.join(', ')}`, 403));
    } catch (error) {
      const logger = container.get<Logger>(TOKENS.Logger);
      logger.error('Error in any permission check middleware', { permissions, error });
      next(new ApiError('Permission check failed', 500));
    }
  };
};

export const requireAllPermissions = (permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as RBACRequest;
      const rbacService = container.get<RBACService>(TOKENS.RBACService);
      const logger = container.get<Logger>(TOKENS.Logger);

      if (!authReq.user?.id) {
        return next(new ApiError('Authentication required', 401));
      }

      const userPermissions = await rbacService.getUserPermissions(authReq.user.id);
      const missingPermissions = permissions.filter(
        permission => !userPermissions.effectivePermissions.includes(permission)
      );

      if (missingPermissions.length > 0) {
        logger.warn('Missing required permissions', {
          userId: authReq.user.id,
          missingPermissions,
          requiredPermissions: permissions,
          endpoint: req.path,
          method: req.method
        });
        return next(new ApiError(`Missing permissions: ${missingPermissions.join(', ')}`, 403));
      }

      logger.debug('All permissions granted', {
        userId: authReq.user.id,
        permissions,
        endpoint: req.path,
        method: req.method
      });

      next();
    } catch (error) {
      const logger = container.get<Logger>(TOKENS.Logger);
      logger.error('Error in all permissions check middleware', { permissions, error });
      next(new ApiError('Permission check failed', 500));
    }
  };
};

export const loadUserPermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as RBACRequest;
    
    if (!authReq.user?.id) {
      return next();
    }

    const rbacService = container.get<RBACService>(TOKENS.RBACService);
    const userPermissions = await rbacService.getUserPermissions(authReq.user.id);
    
    authReq.userPermissions = userPermissions.effectivePermissions;
    authReq.userRoles = userPermissions.roles.map(role => role.name);

    next();
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.Logger);
    logger.error('Error loading user permissions', { error });
    next();
  }
};

export const requireAdmin = requireRole('admin');
export const requireModerator = requireAnyPermission(['system:admin', 'content:manage']);

export const resourcePermissions = {
  content: {
    create: requirePermission('content:create'),
    read: requirePermission('content:read'),
    update: requirePermission('content:update'),
    delete: requirePermission('content:delete'),
    manage: requirePermission('content:manage')
  },
  users: {
    create: requirePermission('users:create'),
    read: requirePermission('users:read'),
    update: requirePermission('users:update'),
    delete: requirePermission('users:delete'),
    manage: requirePermission('users:manage')
  },
  sources: {
    create: requirePermission('sources:create'),
    read: requirePermission('sources:read'),
    update: requirePermission('sources:update'),
    delete: requirePermission('sources:delete'),
    manage: requirePermission('sources:manage')
  },
  tags: {
    create: requirePermission('tags:create'),
    read: requirePermission('tags:read'),
    update: requirePermission('tags:update'),
    delete: requirePermission('tags:delete'),
    manage: requirePermission('tags:manage')
  },
  apiKeys: {
    create: requirePermission('api_keys:create'),
    read: requirePermission('api_keys:read'),
    update: requirePermission('api_keys:update'),
    delete: requirePermission('api_keys:delete'),
    manage: requirePermission('api_keys:manage')
  },
  system: {
    health: requirePermission('system:health'),
    metrics: requirePermission('system:metrics'),
    admin: requirePermission('system:admin')
  },
  analytics: {
    read: requirePermission('analytics:read'),
    manage: requirePermission('analytics:manage')
  }
};