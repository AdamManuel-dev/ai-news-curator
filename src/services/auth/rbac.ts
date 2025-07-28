/**
 * @fileoverview Role-Based Access Control (RBAC) service for authorization management
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Role/permission assignment, access checking, expiration handling, cleanup
 * Main APIs: getUserPermissions(), hasPermission(), assignRole(), grantPermission()
 * Constraints: Requires PostgreSQL connection pool, dependency injection
 * Patterns: Transaction-safe operations, temporal permissions, inversify decorators
 */

import { Pool } from 'pg';
import { injectable, inject } from 'inversify';
import { TOKENS } from '../../container/tokens';
import { Logger } from 'winston';

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
  isSystemPermission: boolean;
  createdAt: Date;
}

export interface UserRole {
  userId: string;
  roleId: string;
  assignedAt: Date;
  assignedBy?: string;
  expiresAt?: Date;
  isActive: boolean;
}

export interface UserPermission {
  userId: string;
  permissionId: string;
  grantedAt: Date;
  grantedBy?: string;
  expiresAt?: Date;
  isActive: boolean;
}

export interface UserPermissions {
  roles: Role[];
  permissions: Permission[];
  effectivePermissions: string[];
}

@injectable()
export class RBACService {
  constructor(
    @inject(TOKENS.Database) private pool: Pool,
    @inject(TOKENS.Logger) private logger: Logger
  ) {}

  async getUserPermissions(userId: string): Promise<UserPermissions> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        WITH user_roles AS (
          SELECT r.* FROM roles r
          JOIN user_roles ur ON r.id = ur.role_id
          WHERE ur.user_id = $1 
            AND ur.is_active = true
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            AND r.is_active = true
        ),
        user_direct_permissions AS (
          SELECT p.* FROM permissions p
          JOIN user_permissions up ON p.id = up.permission_id
          WHERE up.user_id = $1 
            AND up.is_active = true
            AND (up.expires_at IS NULL OR up.expires_at > NOW())
        ),
        role_permissions AS (
          SELECT DISTINCT p.* FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          JOIN user_roles ur ON rp.role_id = ur.id
        ),
        all_permissions AS (
          SELECT * FROM user_direct_permissions
          UNION
          SELECT * FROM role_permissions
        )
        SELECT 
          (SELECT json_agg(row_to_json(ur)) FROM user_roles ur) as roles,
          (SELECT json_agg(row_to_json(ap)) FROM all_permissions ap) as permissions,
          (SELECT array_agg(DISTINCT ap.name) FROM all_permissions ap) as effective_permissions
      `;
      
      const result = await client.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return {
          roles: [],
          permissions: [],
          effectivePermissions: []
        };
      }
      
      const row = result.rows[0];
      return {
        roles: row.roles || [],
        permissions: row.permissions || [],
        effectivePermissions: row.effective_permissions || []
      };
    } catch (error) {
      this.logger.error('Error getting user permissions', { userId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      return userPermissions.effectivePermissions.includes(permission);
    } catch (error) {
      this.logger.error('Error checking user permission', { userId, permission, error });
      return false;
    }
  }

  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT EXISTS(
          SELECT 1 FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = $1 
            AND r.name = $2
            AND ur.is_active = true
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            AND r.is_active = true
        ) as has_role
      `;
      
      const result = await client.query(query, [userId, roleName]);
      return result.rows[0].has_role;
    } catch (error) {
      this.logger.error('Error checking user role', { userId, roleName, error });
      return false;
    } finally {
      client.release();
    }
  }

  async assignRole(userId: string, roleId: string, assignedBy?: string, expiresAt?: Date): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, role_id) 
        DO UPDATE SET 
          is_active = true,
          assigned_at = NOW(),
          assigned_by = EXCLUDED.assigned_by,
          expires_at = EXCLUDED.expires_at
      `;
      
      await client.query(query, [userId, roleId, assignedBy, expiresAt]);
      await client.query('COMMIT');
      
      this.logger.info('Role assigned to user', { userId, roleId, assignedBy });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error assigning role to user', { userId, roleId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeRole(userId: string, roleId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE user_roles 
        SET is_active = false
        WHERE user_id = $1 AND role_id = $2
      `;
      
      await client.query(query, [userId, roleId]);
      this.logger.info('Role revoked from user', { userId, roleId });
    } catch (error) {
      this.logger.error('Error revoking role from user', { userId, roleId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async grantPermission(userId: string, permissionId: string, grantedBy?: string, expiresAt?: Date): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const query = `
        INSERT INTO user_permissions (user_id, permission_id, granted_by, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, permission_id) 
        DO UPDATE SET 
          is_active = true,
          granted_at = NOW(),
          granted_by = EXCLUDED.granted_by,
          expires_at = EXCLUDED.expires_at
      `;
      
      await client.query(query, [userId, permissionId, grantedBy, expiresAt]);
      await client.query('COMMIT');
      
      this.logger.info('Permission granted to user', { userId, permissionId, grantedBy });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error granting permission to user', { userId, permissionId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async revokePermission(userId: string, permissionId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE user_permissions 
        SET is_active = false
        WHERE user_id = $1 AND permission_id = $2
      `;
      
      await client.query(query, [userId, permissionId]);
      this.logger.info('Permission revoked from user', { userId, permissionId });
    } catch (error) {
      this.logger.error('Error revoking permission from user', { userId, permissionId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllRoles(): Promise<Role[]> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          id,
          name,
          description,
          is_system_role as "isSystemRole",
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM roles 
        WHERE is_active = true
        ORDER BY name
      `;
      
      const result = await client.query(query);
      return result.rows;
    } catch (error) {
      this.logger.error('Error getting all roles', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllPermissions(): Promise<Permission[]> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          id,
          name,
          resource,
          action,
          description,
          is_system_permission as "isSystemPermission",
          created_at as "createdAt"
        FROM permissions 
        ORDER BY resource, action
      `;
      
      const result = await client.query(query);
      return result.rows;
    } catch (error) {
      this.logger.error('Error getting all permissions', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getRoleById(roleId: string): Promise<Role | null> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          id,
          name,
          description,
          is_system_role as "isSystemRole",
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM roles 
        WHERE id = $1
      `;
      
      const result = await client.query(query, [roleId]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error getting role by ID', { roleId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getPermissionById(permissionId: string): Promise<Permission | null> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          id,
          name,
          resource,
          action,
          description,
          is_system_permission as "isSystemPermission",
          created_at as "createdAt"
        FROM permissions 
        WHERE id = $1
      `;
      
      const result = await client.query(query, [permissionId]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error('Error getting permission by ID', { permissionId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async cleanupExpiredAssignments(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const expiredRolesQuery = `
        UPDATE user_roles 
        SET is_active = false
        WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND is_active = true
      `;
      
      const expiredPermissionsQuery = `
        UPDATE user_permissions 
        SET is_active = false
        WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND is_active = true
      `;
      
      const rolesResult = await client.query(expiredRolesQuery);
      const permissionsResult = await client.query(expiredPermissionsQuery);
      
      await client.query('COMMIT');
      
      this.logger.info('Cleanup expired assignments completed', { 
        expiredRoles: rolesResult.rowCount,
        expiredPermissions: permissionsResult.rowCount
      });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Error cleaning up expired assignments', { error });
      throw error;
    } finally {
      client.release();
    }
  }
}