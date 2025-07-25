/**
 * @fileoverview API key management service for service-to-service authentication.
 * 
 * Provides secure API key generation, validation, and management with features
 * like rate limiting, permissions, expiration, and usage tracking.
 * 
 * @module services/auth/api-key
 */

import crypto from 'crypto';
import { DatabaseConnection } from '@database/connection';
import { config } from '@config/index';
import logger from '@utils/logger';
import { ApiKey } from './types';

/**
 * API key creation parameters
 */
export interface CreateApiKeyParams {
  name: string;
  userId: string;
  permissions?: string[];
  rateLimit?: number;
  expiresAt?: Date;
  description?: string;
}

/**
 * API key validation result
 */
export interface ApiKeyValidationResult {
  isValid: boolean;
  key?: ApiKey;
  reason?: string;
}

/**
 * API key usage statistics
 */
export interface ApiKeyUsage {
  keyId: string;
  totalRequests: number;
  requestsToday: number;
  requestsThisHour: number;
  lastUsedAt?: Date;
  averageRequestsPerDay: number;
}

/**
 * API key service for managing service authentication
 */
export class ApiKeyService {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Generate a new API key
   */
  async createApiKey(params: CreateApiKeyParams): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const { name, userId, permissions = [], rateLimit = 1000, expiresAt, description } = params;

    // Generate cryptographically secure API key
    const rawKey = this.generateSecureApiKey();
    const keyHash = this.hashApiKey(rawKey);

    try {
      const result = await this.db.query(`
        INSERT INTO api_keys (key_hash, name, user_id, permissions, rate_limit, expires_at, description, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `, [
        keyHash,
        name,
        userId,
        JSON.stringify(permissions),
        rateLimit,
        expiresAt,
        description
      ]);

      const apiKey = this.mapRowToApiKey(result.rows[0]);

      logger.info('API key created', {
        keyId: apiKey.id,
        userId,
        name,
        permissions: permissions.length,
        rateLimit,
        expiresAt: expiresAt?.toISOString()
      });

      return { apiKey, rawKey };
    } catch (error) {
      logger.error('Failed to create API key', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        name
      });
      throw error;
    }
  }

  /**
   * Validate an API key
   */
  async validateApiKey(rawKey: string): Promise<ApiKeyValidationResult> {
    if (!rawKey || rawKey.length < 32) {
      return { isValid: false, reason: 'Invalid key format' };
    }

    const keyHash = this.hashApiKey(rawKey);

    try {
      const result = await this.db.query(`
        SELECT ak.*, u.email as user_email, u.is_active as user_active
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = $1 AND ak.is_active = TRUE
      `, [keyHash]);

      if (result.rows.length === 0) {
        return { isValid: false, reason: 'Key not found' };
      }

      const keyData = result.rows[0];
      const key = this.mapRowToApiKey(keyData);

      // Check if user is active
      if (!keyData.user_active) {
        return { isValid: false, reason: 'User account inactive' };
      }

      // Check expiration
      if (key.expires_at && new Date() > key.expires_at) {
        return { isValid: false, reason: 'Key expired' };
      }

      // Update last used timestamp
      await this.updateLastUsed(key.id);

      return { isValid: true, key };
    } catch (error) {
      logger.error('API key validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        keyPrefix: rawKey.substring(0, 8) + '...'
      });
      return { isValid: false, reason: 'Validation error' };
    }
  }

  /**
   * List API keys for a user
   */
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    try {
      const result = await this.db.query(`
        SELECT * FROM api_keys 
        WHERE user_id = $1 AND is_active = TRUE
        ORDER BY created_at DESC
      `, [userId]);

      return result.rows.map(row => this.mapRowToApiKey(row));
    } catch (error) {
      logger.error('Failed to fetch user API keys', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      throw error;
    }
  }

  /**
   * Update API key properties
   */
  async updateApiKey(keyId: string, updates: Partial<Pick<ApiKey, 'name' | 'permissions' | 'rate_limit' | 'is_active'>>): Promise<ApiKey> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.permissions !== undefined) {
      updateFields.push(`permissions = $${paramIndex++}`);
      values.push(JSON.stringify(updates.permissions));
    }

    if (updates.rate_limit !== undefined) {
      updateFields.push(`rate_limit = $${paramIndex++}`);
      values.push(updates.rate_limit);
    }

    if (updates.is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(updates.is_active);
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(keyId);

    try {
      const result = await this.db.query(`
        UPDATE api_keys 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error('API key not found');
      }

      const updatedKey = this.mapRowToApiKey(result.rows[0]);

      logger.info('API key updated', {
        keyId,
        updates: Object.keys(updates)
      });

      return updatedKey;
    } catch (error) {
      logger.error('Failed to update API key', {
        error: error instanceof Error ? error.message : 'Unknown error',
        keyId,
        updates
      });
      throw error;
    }
  }

  /**
   * Revoke an API key (soft delete)
   */
  async revokeApiKey(keyId: string, userId?: string): Promise<void> {
    try {
      const whereClause = userId 
        ? 'WHERE id = $1 AND user_id = $2'
        : 'WHERE id = $1';
      
      const params = userId ? [keyId, userId] : [keyId];

      const result = await this.db.query(`
        UPDATE api_keys 
        SET is_active = FALSE, updated_at = NOW()
        ${whereClause}
      `, params);

      if (result.rowCount === 0) {
        throw new Error('API key not found or access denied');
      }

      logger.info('API key revoked', { keyId, userId });
    } catch (error) {
      logger.error('Failed to revoke API key', {
        error: error instanceof Error ? error.message : 'Unknown error',
        keyId,
        userId
      });
      throw error;
    }
  }

  /**
   * Get API key usage statistics
   */
  async getApiKeyUsage(keyId: string, days = 30): Promise<ApiKeyUsage> {
    try {
      const result = await this.db.query(`
        SELECT 
          ak.id as key_id,
          ak.last_used_at,
          COUNT(CASE WHEN akl.created_at >= NOW() - INTERVAL '${days} days' THEN 1 END) as total_requests,
          COUNT(CASE WHEN akl.created_at >= CURRENT_DATE THEN 1 END) as requests_today,
          COUNT(CASE WHEN akl.created_at >= NOW() - INTERVAL '1 hour' THEN 1 END) as requests_this_hour
        FROM api_keys ak
        LEFT JOIN api_key_logs akl ON ak.id = akl.key_id
        WHERE ak.id = $1
        GROUP BY ak.id, ak.last_used_at
      `, [keyId]);

      if (result.rows.length === 0) {
        throw new Error('API key not found');
      }

      const row = result.rows[0];
      const totalRequests = parseInt(row.total_requests) || 0;
      const averageRequestsPerDay = days > 0 ? totalRequests / days : 0;

      return {
        keyId,
        totalRequests,
        requestsToday: parseInt(row.requests_today) || 0,
        requestsThisHour: parseInt(row.requests_this_hour) || 0,
        lastUsedAt: row.last_used_at,
        averageRequestsPerDay: Math.round(averageRequestsPerDay * 100) / 100
      };
    } catch (error) {
      logger.error('Failed to get API key usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        keyId
      });
      throw error;
    }
  }

  /**
   * Log API key usage (for rate limiting and analytics)
   */
  async logApiKeyUsage(keyId: string, endpoint: string, statusCode: number, responseTime?: number): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO api_key_logs (key_id, endpoint, status_code, response_time, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [keyId, endpoint, statusCode, responseTime]);
    } catch (error) {
      // Log silently - don't fail requests due to logging issues
      logger.debug('Failed to log API key usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        keyId,
        endpoint
      });
    }
  }

  /**
   * Check rate limit for API key
   */
  async checkRateLimit(keyId: string, windowMinutes = 60): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    try {
      const result = await this.db.query(`
        SELECT 
          ak.rate_limit,
          COUNT(akl.id) as recent_requests
        FROM api_keys ak
        LEFT JOIN api_key_logs akl ON ak.id = akl.key_id 
          AND akl.created_at >= NOW() - INTERVAL '${windowMinutes} minutes'
        WHERE ak.id = $1
        GROUP BY ak.id, ak.rate_limit
      `, [keyId]);

      if (result.rows.length === 0) {
        throw new Error('API key not found');
      }

      const { rate_limit, recent_requests } = result.rows[0];
      const requestCount = parseInt(recent_requests) || 0;
      const remaining = Math.max(0, rate_limit - requestCount);
      const resetTime = new Date(Date.now() + windowMinutes * 60 * 1000);

      return {
        allowed: requestCount < rate_limit,
        remaining,
        resetTime
      };
    } catch (error) {
      logger.error('Rate limit check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        keyId
      });
      // Allow request on error to avoid false blocks
      return {
        allowed: true,
        remaining: 100,
        resetTime: new Date(Date.now() + windowMinutes * 60 * 1000)
      };
    }
  }

  /**
   * Rotate API keys approaching expiration
   */
  async rotateExpiringKeys(daysBeforeExpiry = 7): Promise<{ rotated: number; notified: string[] }> {
    const rotated = 0;
    const notified: string[] = [];

    try {
      // Find keys expiring soon
      const result = await this.db.query(`
        SELECT ak.*, u.email
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.expires_at IS NOT NULL 
          AND ak.expires_at <= NOW() + INTERVAL '${daysBeforeExpiry} days'
          AND ak.expires_at > NOW()
          AND ak.is_active = TRUE
      `);

      for (const row of result.rows) {
        notified.push(row.email);
        logger.warn('API key expiring soon', {
          keyId: row.id,
          keyName: row.name,
          userEmail: row.email,
          expiresAt: row.expires_at
        });
      }

      logger.info('API key rotation check completed', {
        keysExpiringSoon: result.rows.length,
        rotated,
        notified: notified.length
      });

      return { rotated, notified };
    } catch (error) {
      logger.error('API key rotation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { rotated: 0, notified: [] };
    }
  }

  /**
   * Clean up expired API keys and old logs
   */
  async cleanup(retentionDays = 90): Promise<{ deletedKeys: number; deletedLogs: number }> {
    try {
      // Delete expired keys
      const expiredKeysResult = await this.db.query(`
        DELETE FROM api_keys 
        WHERE expires_at IS NOT NULL 
          AND expires_at < NOW() - INTERVAL '${retentionDays} days'
          AND is_active = FALSE
      `);

      // Delete old logs
      const oldLogsResult = await this.db.query(`
        DELETE FROM api_key_logs 
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `);

      const deletedKeys = expiredKeysResult.rowCount || 0;
      const deletedLogs = oldLogsResult.rowCount || 0;

      logger.info('API key cleanup completed', {
        deletedKeys,
        deletedLogs,
        retentionDays
      });

      return { deletedKeys, deletedLogs };
    } catch (error) {
      logger.error('API key cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { deletedKeys: 0, deletedLogs: 0 };
    }
  }

  /**
   * Private helper methods
   */
  private generateSecureApiKey(): string {
    const prefix = 'aic'; // AI Content Curator
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}_${randomBytes}`;
  }

  private hashApiKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey + config.jwtSecret).digest('hex');
  }

  private async updateLastUsed(keyId: string): Promise<void> {
    try {
      await this.db.query(`
        UPDATE api_keys 
        SET last_used_at = NOW() 
        WHERE id = $1
      `, [keyId]);
    } catch (error) {
      // Log but don't fail the request
      logger.debug('Failed to update last used timestamp', { keyId });
    }
  }

  private mapRowToApiKey(row: any): ApiKey {
    return {
      id: row.id,
      key_hash: row.key_hash,
      name: row.name,
      user_id: row.user_id,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
      rate_limit: row.rate_limit,
      is_active: row.is_active,
      last_used_at: row.last_used_at,
      expires_at: row.expires_at,
      created_at: row.created_at
    };
  }
}