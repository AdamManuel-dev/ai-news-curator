import { Pool } from 'pg';
import { RBACService } from '../rbac';
import { Logger } from 'winston';

describe('RBACService', () => {
  let rbacService: RBACService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    rbacService = new RBACService(mockPool, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserPermissions', () => {
    it('should return user permissions with roles and effective permissions', async () => {
      const userId = 'user-123';
      const mockResult = {
        rows: [{
          roles: [{ id: 'role-1', name: 'admin', description: 'Admin role' }],
          permissions: [{ id: 'perm-1', name: 'content:read', resource: 'content', action: 'read' }],
          effective_permissions: ['content:read', 'content:write']
        }]
      };

      mockClient.query.mockResolvedValue(mockResult);

      const result = await rbacService.getUserPermissions(userId);

      expect(result).toEqual({
        roles: [{ id: 'role-1', name: 'admin', description: 'Admin role' }],
        permissions: [{ id: 'perm-1', name: 'content:read', resource: 'content', action: 'read' }],
        effectivePermissions: ['content:read', 'content:write']
      });

      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [userId]);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return empty permissions when user has no roles', async () => {
      const userId = 'user-123';
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await rbacService.getUserPermissions(userId);

      expect(result).toEqual({
        roles: [],
        permissions: [],
        effectivePermissions: []
      });
    });

    it('should handle database errors', async () => {
      const userId = 'user-123';
      const error = new Error('Database error');
      mockClient.query.mockRejectedValue(error);

      await expect(rbacService.getUserPermissions(userId)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting user permissions', { userId, error });
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has permission', async () => {
      const userId = 'user-123';
      const permission = 'content:read';

      // Mock getUserPermissions
      jest.spyOn(rbacService, 'getUserPermissions').mockResolvedValue({
        roles: [],
        permissions: [],
        effectivePermissions: ['content:read', 'content:write']
      });

      const result = await rbacService.hasPermission(userId, permission);

      expect(result).toBe(true);
    });

    it('should return false when user does not have permission', async () => {
      const userId = 'user-123';
      const permission = 'admin:manage';

      jest.spyOn(rbacService, 'getUserPermissions').mockResolvedValue({
        roles: [],
        permissions: [],
        effectivePermissions: ['content:read']
      });

      const result = await rbacService.hasPermission(userId, permission);

      expect(result).toBe(false);
    });

    it('should return false and log error on exception', async () => {
      const userId = 'user-123';
      const permission = 'content:read';
      const error = new Error('Database error');

      jest.spyOn(rbacService, 'getUserPermissions').mockRejectedValue(error);

      const result = await rbacService.hasPermission(userId, permission);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error checking user permission', { userId, permission, error });
    });
  });

  describe('hasRole', () => {
    it('should return true when user has role', async () => {
      const userId = 'user-123';
      const roleName = 'admin';
      
      mockClient.query.mockResolvedValue({ rows: [{ has_role: true }] });

      const result = await rbacService.hasRole(userId, roleName);

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [userId, roleName]);
    });

    it('should return false when user does not have role', async () => {
      const userId = 'user-123';
      const roleName = 'admin';
      
      mockClient.query.mockResolvedValue({ rows: [{ has_role: false }] });

      const result = await rbacService.hasRole(userId, roleName);

      expect(result).toBe(false);
    });
  });

  describe('assignRole', () => {
    it('should assign role to user successfully', async () => {
      const userId = 'user-123';
      const roleId = 'role-456';
      const assignedBy = 'admin-789';

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      await rbacService.assignRole(userId, roleId, assignedBy);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_roles'),
        [userId, roleId, assignedBy, undefined]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockLogger.info).toHaveBeenCalledWith('Role assigned to user', { userId, roleId, assignedBy });
    });

    it('should rollback transaction on error', async () => {
      const userId = 'user-123';
      const roleId = 'role-456';
      const error = new Error('Database error');

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(error); // INSERT fails

      await expect(rbacService.assignRole(userId, roleId)).rejects.toThrow(error);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockLogger.error).toHaveBeenCalledWith('Error assigning role to user', { userId, roleId, error });
    });
  });

  describe('revokeRole', () => {
    it('should revoke role from user successfully', async () => {
      const userId = 'user-123';
      const roleId = 'role-456';

      mockClient.query.mockResolvedValue(undefined);

      await rbacService.revokeRole(userId, roleId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_roles'),
        [userId, roleId]
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Role revoked from user', { userId, roleId });
    });
  });

  describe('grantPermission', () => {
    it('should grant permission to user successfully', async () => {
      const userId = 'user-123';
      const permissionId = 'perm-456';
      const grantedBy = 'admin-789';

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      await rbacService.grantPermission(userId, permissionId, grantedBy);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_permissions'),
        [userId, permissionId, grantedBy, undefined]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockLogger.info).toHaveBeenCalledWith('Permission granted to user', { userId, permissionId, grantedBy });
    });
  });

  describe('getAllRoles', () => {
    it('should return all active roles', async () => {
      const mockRoles = [
        { id: 'role-1', name: 'admin', description: 'Admin role', isSystemRole: true, isActive: true },
        { id: 'role-2', name: 'user', description: 'User role', isSystemRole: true, isActive: true }
      ];

      mockClient.query.mockResolvedValue({ rows: mockRoles });

      const result = await rbacService.getAllRoles();

      expect(result).toEqual(mockRoles);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    });
  });

  describe('getAllPermissions', () => {
    it('should return all permissions', async () => {
      const mockPermissions = [
        { id: 'perm-1', name: 'content:read', resource: 'content', action: 'read' },
        { id: 'perm-2', name: 'content:write', resource: 'content', action: 'write' }
      ];

      mockClient.query.mockResolvedValue({ rows: mockPermissions });

      const result = await rbacService.getAllPermissions();

      expect(result).toEqual(mockPermissions);
    });
  });

  describe('cleanupExpiredAssignments', () => {
    it('should cleanup expired role and permission assignments', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rowCount: 5 }) // UPDATE user_roles
        .mockResolvedValueOnce({ rowCount: 3 }) // UPDATE user_permissions
        .mockResolvedValueOnce(undefined); // COMMIT

      await rbacService.cleanupExpiredAssignments();

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_roles')
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_permissions')
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      expect(mockLogger.info).toHaveBeenCalledWith('Cleanup expired assignments completed', {
        expiredRoles: 5,
        expiredPermissions: 3
      });
    });

    it('should rollback on error', async () => {
      const error = new Error('Database error');
      
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(error); // UPDATE fails

      await expect(rbacService.cleanupExpiredAssignments()).rejects.toThrow(error);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockLogger.error).toHaveBeenCalledWith('Error cleaning up expired assignments', { error });
    });
  });
});