import { Request, Response, NextFunction } from 'express';
import { container } from '../../container/setup';
import { TOKENS } from '../../container/tokens';
import { RBACService } from '../../services/auth/rbac';
import { Logger } from 'winston';
import { ApiError } from '../errors/types';
import {
  requirePermission,
  requireRole,
  requireAnyPermission,
  requireAllPermissions,
  loadUserPermissions,
  RBACRequest
} from '../rbac';

// Mock the container
jest.mock('../../container/setup', () => ({
  container: {
    get: jest.fn(),
  },
}));

describe('RBAC Middleware', () => {
  let mockRBACService: jest.Mocked<RBACService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockReq: Partial<RBACRequest>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockRBACService = {
      hasPermission: jest.fn(),
      hasRole: jest.fn(),
      getUserPermissions: jest.fn(),
    } as any;

    mockLogger = {
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as any;

    mockReq = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
      },
      path: '/test',
      method: 'GET',
    };

    mockRes = {};
    mockNext = jest.fn();

    (container.get as jest.Mock).mockImplementation((token) => {
      if (token === TOKENS.RBACService) return mockRBACService;
      if (token === TOKENS.Logger) return mockLogger;
      return undefined;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requirePermission', () => {
    it('should allow access when user has required permission', async () => {
      const permission = 'content:read';
      mockRBACService.hasPermission.mockResolvedValue(true);

      const middleware = requirePermission(permission);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', permission);
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockLogger.debug).toHaveBeenCalledWith('Permission granted', {
        userId: 'user-123',
        permission,
        endpoint: '/test',
        method: 'GET'
      });
    });

    it('should deny access when user lacks permission', async () => {
      const permission = 'admin:manage';
      mockRBACService.hasPermission.mockResolvedValue(false);

      const middleware = requirePermission(permission);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', permission);
      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      expect(mockLogger.warn).toHaveBeenCalledWith('Permission denied', {
        userId: 'user-123',
        permission,
        endpoint: '/test',
        method: 'GET'
      });

      const error = mockNext.mock.calls[0][0] as ApiError;
      expect(error.message).toBe(`Permission denied: ${permission}`);
      expect(error.statusCode).toBe(403);
    });

    it('should deny access when user is not authenticated', async () => {
      mockReq.user = undefined;
      const permission = 'content:read';

      const middleware = requirePermission(permission);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.hasPermission).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));

      const error = mockNext.mock.calls[0][0] as ApiError;
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
    });

    it('should handle service errors gracefully', async () => {
      const permission = 'content:read';
      const error = new Error('Database error');
      mockRBACService.hasPermission.mockRejectedValue(error);

      const middleware = requirePermission(permission);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith('Error in permission check middleware', { permission, error });
      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));

      const apiError = mockNext.mock.calls[0][0] as ApiError;
      expect(apiError.message).toBe('Permission check failed');
      expect(apiError.statusCode).toBe(500);
    });
  });

  describe('requireRole', () => {
    it('should allow access when user has required role', async () => {
      const roleName = 'admin';
      mockRBACService.hasRole.mockResolvedValue(true);

      const middleware = requireRole(roleName);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.hasRole).toHaveBeenCalledWith('user-123', roleName);
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockLogger.debug).toHaveBeenCalledWith('Role requirement satisfied', {
        userId: 'user-123',
        role: roleName,
        endpoint: '/test',
        method: 'GET'
      });
    });

    it('should deny access when user lacks role', async () => {
      const roleName = 'admin';
      mockRBACService.hasRole.mockResolvedValue(false);

      const middleware = requireRole(roleName);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.hasRole).toHaveBeenCalledWith('user-123', roleName);
      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      expect(mockLogger.warn).toHaveBeenCalledWith('Role requirement not met', {
        userId: 'user-123',
        role: roleName,
        endpoint: '/test',
        method: 'GET'
      });

      const error = mockNext.mock.calls[0][0] as ApiError;
      expect(error.message).toBe(`Role required: ${roleName}`);
      expect(error.statusCode).toBe(403);
    });
  });

  describe('requireAnyPermission', () => {
    it('should allow access when user has any of the required permissions', async () => {
      const permissions = ['content:read', 'content:write', 'admin:manage'];
      mockRBACService.hasPermission
        .mockResolvedValueOnce(false) // content:read
        .mockResolvedValueOnce(true); // content:write

      const middleware = requireAnyPermission(permissions);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'content:read');
      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'content:write');
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockLogger.debug).toHaveBeenCalledWith('Permission granted (any)', {
        userId: 'user-123',
        permission: 'content:write',
        permissions,
        endpoint: '/test',
        method: 'GET'
      });
    });

    it('should deny access when user has none of the required permissions', async () => {
      const permissions = ['admin:manage', 'system:admin'];
      mockRBACService.hasPermission.mockResolvedValue(false);

      const middleware = requireAnyPermission(permissions);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'admin:manage');
      expect(mockRBACService.hasPermission).toHaveBeenCalledWith('user-123', 'system:admin');
      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));

      const error = mockNext.mock.calls[0][0] as ApiError;
      expect(error.message).toBe('One of these permissions required: admin:manage, system:admin');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('requireAllPermissions', () => {
    it('should allow access when user has all required permissions', async () => {
      const permissions = ['content:read', 'content:write'];
      const mockUserPermissions = {
        roles: [],
        permissions: [],
        effectivePermissions: ['content:read', 'content:write', 'content:delete']
      };

      mockRBACService.getUserPermissions.mockResolvedValue(mockUserPermissions);

      const middleware = requireAllPermissions(permissions);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.getUserPermissions).toHaveBeenCalledWith('user-123');
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockLogger.debug).toHaveBeenCalledWith('All permissions granted', {
        userId: 'user-123',
        permissions,
        endpoint: '/test',
        method: 'GET'
      });
    });

    it('should deny access when user is missing some permissions', async () => {
      const permissions = ['content:read', 'content:write', 'admin:manage'];
      const mockUserPermissions = {
        roles: [],
        permissions: [],
        effectivePermissions: ['content:read', 'content:write']
      };

      mockRBACService.getUserPermissions.mockResolvedValue(mockUserPermissions);

      const middleware = requireAllPermissions(permissions);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      expect(mockLogger.warn).toHaveBeenCalledWith('Missing required permissions', {
        userId: 'user-123',
        missingPermissions: ['admin:manage'],
        requiredPermissions: permissions,
        endpoint: '/test',
        method: 'GET'
      });

      const error = mockNext.mock.calls[0][0] as ApiError;
      expect(error.message).toBe('Missing permissions: admin:manage');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('loadUserPermissions', () => {
    it('should load user permissions and roles into request object', async () => {
      const mockUserPermissions = {
        roles: [{ id: 'role-1', name: 'admin' }, { id: 'role-2', name: 'user' }],
        permissions: [],
        effectivePermissions: ['content:read', 'content:write', 'admin:manage']
      };

      mockRBACService.getUserPermissions.mockResolvedValue(mockUserPermissions as any);

      await loadUserPermissions(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.getUserPermissions).toHaveBeenCalledWith('user-123');
      expect(mockReq.userPermissions).toEqual(['content:read', 'content:write', 'admin:manage']);
      expect(mockReq.userRoles).toEqual(['admin', 'user']);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should skip loading when user is not authenticated', async () => {
      mockReq.user = undefined;

      await loadUserPermissions(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRBACService.getUserPermissions).not.toHaveBeenCalled();
      expect(mockReq.userPermissions).toBeUndefined();
      expect(mockReq.userRoles).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue on error and log it', async () => {
      const error = new Error('Database error');
      mockRBACService.getUserPermissions.mockRejectedValue(error);

      await loadUserPermissions(mockReq as Request, mockRes as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith('Error loading user permissions', { error });
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});