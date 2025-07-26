import { Router } from 'express';
import { container } from '../container/setup';
import { TOKENS } from '../container/tokens';
import { RBACService } from '../services/auth/rbac';
import { Logger } from 'winston';
import { ApiError } from '../middleware/errors/types';
import { authenticateJWT, requireAdmin, requirePermission, requireAnyPermission } from '../middleware';
import { RBACRequest } from '../middleware/rbac';

const router = Router();

// Apply authentication to all role management routes
router.use(authenticateJWT);

// Get current user's permissions and roles
router.get('/me', async (req: RBACRequest, res, next) => {
  try {
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    if (!req.user?.id) {
      return next(new ApiError('Authentication required', 401));
    }

    const userPermissions = await rbacService.getUserPermissions(req.user.id);
    
    res.json({
      success: true,
      data: {
        userId: req.user.id,
        roles: userPermissions.roles,
        permissions: userPermissions.permissions,
        effectivePermissions: userPermissions.effectivePermissions
      }
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error getting user permissions', { userId: req.user?.id, error });
    next(new ApiError('Failed to get user permissions', 500));
  }
});

// Get all roles (admin only)
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    const roles = await rbacService.getAllRoles();
    
    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error getting all roles', { error });
    next(new ApiError('Failed to get roles', 500));
  }
});

// Get all permissions (admin only)
router.get('/permissions', requireAdmin, async (req, res, next) => {
  try {
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    const permissions = await rbacService.getAllPermissions();
    
    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error getting all permissions', { error });
    next(new ApiError('Failed to get permissions', 500));
  }
});

// Get specific role by ID
router.get('/:roleId', requireAnyPermission(['users:manage', 'system:admin']), async (req, res, next) => {
  try {
    const { roleId } = req.params;
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    const role = await rbacService.getRoleById(roleId);
    
    if (!role) {
      return next(new ApiError('Role not found', 404));
    }
    
    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error getting role by ID', { roleId: req.params.roleId, error });
    next(new ApiError('Failed to get role', 500));
  }
});

// Assign role to user (admin only)
router.post('/assign', requireAdmin, async (req: RBACRequest, res, next) => {
  try {
    const { userId, roleId, expiresAt } = req.body;
    
    if (!userId || !roleId) {
      return next(new ApiError('userId and roleId are required', 400));
    }
    
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    // Validate role exists
    const role = await rbacService.getRoleById(roleId);
    if (!role) {
      return next(new ApiError('Role not found', 404));
    }
    
    const expirationDate = expiresAt ? new Date(expiresAt) : undefined;
    
    await rbacService.assignRole(userId, roleId, req.user?.id, expirationDate);
    
    res.json({
      success: true,
      message: `Role ${role.name} assigned to user ${userId}`
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error assigning role', { body: req.body, error });
    next(new ApiError('Failed to assign role', 500));
  }
});

// Revoke role from user (admin only)
router.post('/revoke', requireAdmin, async (req: RBACRequest, res, next) => {
  try {
    const { userId, roleId } = req.body;
    
    if (!userId || !roleId) {
      return next(new ApiError('userId and roleId are required', 400));
    }
    
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    await rbacService.revokeRole(userId, roleId);
    
    res.json({
      success: true,
      message: `Role revoked from user ${userId}`
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error revoking role', { body: req.body, error });
    next(new ApiError('Failed to revoke role', 500));
  }
});

// Grant permission to user (admin only)
router.post('/grant-permission', requireAdmin, async (req: RBACRequest, res, next) => {
  try {
    const { userId, permissionId, expiresAt } = req.body;
    
    if (!userId || !permissionId) {
      return next(new ApiError('userId and permissionId are required', 400));
    }
    
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    // Validate permission exists
    const permission = await rbacService.getPermissionById(permissionId);
    if (!permission) {
      return next(new ApiError('Permission not found', 404));
    }
    
    const expirationDate = expiresAt ? new Date(expiresAt) : undefined;
    
    await rbacService.grantPermission(userId, permissionId, req.user?.id, expirationDate);
    
    res.json({
      success: true,
      message: `Permission ${permission.name} granted to user ${userId}`
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error granting permission', { body: req.body, error });
    next(new ApiError('Failed to grant permission', 500));
  }
});

// Revoke permission from user (admin only)
router.post('/revoke-permission', requireAdmin, async (req: RBACRequest, res, next) => {
  try {
    const { userId, permissionId } = req.body;
    
    if (!userId || !permissionId) {
      return next(new ApiError('userId and permissionId are required', 400));
    }
    
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    await rbacService.revokePermission(userId, permissionId);
    
    res.json({
      success: true,
      message: `Permission revoked from user ${userId}`
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error revoking permission', { body: req.body, error });
    next(new ApiError('Failed to revoke permission', 500));
  }
});

// Check if user has specific permission
router.get('/check/:userId/permission/:permission', requireAnyPermission(['users:read', 'system:admin']), async (req, res, next) => {
  try {
    const { userId, permission } = req.params;
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    const hasPermission = await rbacService.hasPermission(userId, permission);
    
    res.json({
      success: true,
      data: {
        userId,
        permission,
        hasPermission
      }
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error checking user permission', { 
      userId: req.params.userId, 
      permission: req.params.permission, 
      error 
    });
    next(new ApiError('Failed to check permission', 500));
  }
});

// Check if user has specific role
router.get('/check/:userId/role/:roleName', requireAnyPermission(['users:read', 'system:admin']), async (req, res, next) => {
  try {
    const { userId, roleName } = req.params;
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    const hasRole = await rbacService.hasRole(userId, roleName);
    
    res.json({
      success: true,
      data: {
        userId,
        roleName,
        hasRole
      }
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error checking user role', { 
      userId: req.params.userId, 
      roleName: req.params.roleName, 
      error 
    });
    next(new ApiError('Failed to check role', 500));
  }
});

// Cleanup expired assignments (admin only)
router.post('/cleanup', requireAdmin, async (req, res, next) => {
  try {
    const rbacService = container.get<RBACService>(TOKENS.RBAC_SERVICE);
    
    await rbacService.cleanupExpiredAssignments();
    
    res.json({
      success: true,
      message: 'Expired role and permission assignments cleaned up'
    });
  } catch (error) {
    const logger = container.get<Logger>(TOKENS.LOGGER);
    logger.error('Error cleaning up expired assignments', { error });
    next(new ApiError('Failed to cleanup expired assignments', 500));
  }
});

export default router;