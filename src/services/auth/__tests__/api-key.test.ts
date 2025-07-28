/**
 * @fileoverview Unit tests for API key service with CRUD operations and rate limiting
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: API key creation, validation, management, rate limiting, usage tracking
 * Main APIs: createApiKey(), validateApiKey(), updateApiKey(), revokeApiKey(), checkRateLimit()
 * Constraints: Requires database connection mock, JWT secret, hashing utilities
 * Patterns: Mock database queries, test key generation, validate permission systems
 */

import { ApiKeyService, CreateApiKeyParams } from '../api-key';
import { DatabaseConnection } from '@database/connection';

// Mock dependencies
jest.mock('@config/index');
jest.mock('@utils/logger');
jest.mock('@database/connection');

const mockConfig = {
  jwtSecret: 'test-secret'
};

// Mock config
jest.mock('@config/index', () => ({
  config: mockConfig
}));

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let mockDb: jest.Mocked<DatabaseConnection>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    service = new ApiKeyService(mockDb);
    jest.clearAllMocks();
  });

  describe('createApiKey', () => {
    const mockApiKeyData: any = {
      id: 'key-uuid',
      key_hash: 'hashed-key',
      name: 'Test API Key',
      user_id: 'user-uuid',
      permissions: '["read", "write"]',
      rate_limit: 1000,
      is_active: true,
      expires_at: null,
      created_at: new Date(),
      description: 'Test key description'
    };

    it('should create API key successfully', async () => {
      const params: CreateApiKeyParams = {
        name: 'Test API Key',
        userId: 'user-uuid',
        permissions: ['read', 'write'],
        rateLimit: 1000,
        description: 'Test key description'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockApiKeyData]
      } as any);

      const result = await service.createApiKey(params);

      expect(result.apiKey).toMatchObject({
        id: 'key-uuid',
        name: 'Test API Key',
        permissions: ['read', 'write'],
        rate_limit: 1000
      });

      expect(result.rawKey).toMatch(/^aic_[a-f0-9]{64}$/);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.arrayContaining([
          expect.any(String), // hashed key
          'Test API Key',
          'user-uuid',
          '["read","write"]',
          1000,
          undefined,
          'Test key description'
        ])
      );
    });

    it('should create API key with expiration', async () => {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const params: CreateApiKeyParams = {
        name: 'Expiring Key',
        userId: 'user-uuid',
        expiresAt
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...mockApiKeyData, expires_at: expiresAt }]
      } as any);

      const result = await service.createApiKey(params);

      expect(result.apiKey.expires_at).toEqual(expiresAt);
    });

    it('should handle database errors', async () => {
      const params: CreateApiKeyParams = {
        name: 'Test Key',
        userId: 'user-uuid'
      };

      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.createApiKey(params)).rejects.toThrow('Database error');
    });
  });

  describe('validateApiKey', () => {
    const mockApiKeyRow = {
      id: 'key-uuid',
      key_hash: 'hashed-key',
      name: 'Test Key',
      user_id: 'user-uuid',
      permissions: '["read"]',
      rate_limit: 1000,
      is_active: true,
      expires_at: null,
      created_at: new Date(),
      user_active: true
    };

    it('should validate active API key successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockApiKeyRow] } as any) // validation query
        .mockResolvedValueOnce({ rows: [] } as any); // update last used

      const result = await service.validateApiKey('aic_' + 'a'.repeat(64));

      expect(result.isValid).toBe(true);
      expect(result.key).toMatchObject({
        id: 'key-uuid',
        name: 'Test Key',
        permissions: ['read']
      });
    });

    it('should reject invalid key format', async () => {
      const result = await service.validateApiKey('invalid-key');

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Invalid key format');
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should reject non-existent key', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.validateApiKey('aic_' + 'a'.repeat(64));

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Key not found');
    });

    it('should reject key for inactive user', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...mockApiKeyRow, user_active: false }]
      } as any);

      const result = await service.validateApiKey('aic_' + 'a'.repeat(64));

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('User account inactive');
    });

    it('should reject expired key', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...mockApiKeyRow, expires_at: expiredDate }]
      } as any);

      const result = await service.validateApiKey('aic_' + 'a'.repeat(64));

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Key expired');
    });
  });

  describe('getUserApiKeys', () => {
    const mockKeys = [
      {
        id: 'key1',
        key_hash: 'hash1',
        name: 'Key 1',
        user_id: 'user-uuid',
        permissions: '["read"]',
        rate_limit: 1000,
        is_active: true,
        created_at: new Date()
      },
      {
        id: 'key2',
        key_hash: 'hash2',
        name: 'Key 2',
        user_id: 'user-uuid',
        permissions: '["write"]',
        rate_limit: 500,
        is_active: false,
        created_at: new Date()
      }
    ];

    it('should return user API keys', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: mockKeys } as any);

      const result = await service.getUserApiKeys('user-uuid');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'key1',
        name: 'Key 1',
        permissions: ['read'],
        rate_limit: 1000,
        is_active: true
      });
      expect(result[1]).toMatchObject({
        id: 'key2',
        name: 'Key 2',
        permissions: ['write'],
        rate_limit: 500,
        is_active: false
      });
    });

    it('should return empty array for user with no keys', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.getUserApiKeys('user-uuid');

      expect(result).toEqual([]);
    });
  });

  describe('updateApiKey', () => {
    const mockUpdatedKey = {
      id: 'key-uuid',
      key_hash: 'hash',
      name: 'Updated Key',
      user_id: 'user-uuid',
      permissions: '["admin"]',
      rate_limit: 2000,
      is_active: true,
      created_at: new Date()
    };

    it('should update API key successfully', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [mockUpdatedKey]
      } as any);

      const updates = {
        name: 'Updated Key',
        permissions: ['admin'],
        rate_limit: 2000
      };

      const result = await service.updateApiKey('key-uuid', updates);

      expect(result).toMatchObject({
        id: 'key-uuid',
        name: 'Updated Key',
        permissions: ['admin'],
        rate_limit: 2000
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys'),
        expect.arrayContaining([
          'Updated Key',
          '["admin"]',
          2000,
          'key-uuid'
        ])
      );
    });

    it('should throw error when no fields to update', async () => {
      await expect(service.updateApiKey('key-uuid', {}))
        .rejects.toThrow('No fields to update');
    });

    it('should throw error when key not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);

      await expect(service.updateApiKey('key-uuid', { name: 'New Name' }))
        .rejects.toThrow('API key not found');
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke API key successfully', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 } as any);

      await service.revokeApiKey('key-uuid', 'user-uuid');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys'),
        ['key-uuid', 'user-uuid']
      );
    });

    it('should throw error when key not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 } as any);

      await expect(service.revokeApiKey('key-uuid', 'user-uuid'))
        .rejects.toThrow('API key not found or access denied');
    });
  });

  describe('getApiKeyUsage', () => {
    it('should return usage statistics', async () => {
      const mockUsageData = {
        key_id: 'key-uuid',
        last_used_at: new Date(),
        total_requests: '150',
        requests_today: '25',
        requests_this_hour: '5'
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockUsageData]
      } as any);

      const result = await service.getApiKeyUsage('key-uuid', 30);

      expect(result).toEqual({
        keyId: 'key-uuid',
        totalRequests: 150,
        requestsToday: 25,
        requestsThisHour: 5,
        lastUsedAt: mockUsageData.last_used_at,
        averageRequestsPerDay: 5 // 150/30
      });
    });

    it('should handle key not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);

      await expect(service.getApiKeyUsage('key-uuid'))
        .rejects.toThrow('API key not found');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow request within rate limit', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          rate_limit: 1000,
          recent_requests: '50'
        }]
      } as any);

      const result = await service.checkRateLimit('key-uuid');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(950);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('should block request when rate limit exceeded', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          rate_limit: 1000,
          recent_requests: '1000'
        }]
      } as any);

      const result = await service.checkRateLimit('key-uuid');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.checkRateLimit('key-uuid');

      // Should allow request on error to avoid false blocks
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
    });
  });

  describe('logApiKeyUsage', () => {
    it('should log API key usage', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);

      await service.logApiKeyUsage('key-uuid', '/api/test', 200, 150);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_key_logs'),
        ['key-uuid', '/api/test', 200, 150]
      );
    });

    it('should handle logging errors silently', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Logging error'));

      // Should not throw
      await expect(service.logApiKeyUsage('key-uuid', '/api/test', 200))
        .resolves.toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should clean up expired keys and old logs', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rowCount: 5 } as any) // deleted keys
        .mockResolvedValueOnce({ rowCount: 1000 } as any); // deleted logs

      const result = await service.cleanup(90);

      expect(result).toEqual({
        deletedKeys: 5,
        deletedLogs: 1000
      });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Cleanup error'));

      const result = await service.cleanup();

      expect(result).toEqual({
        deletedKeys: 0,
        deletedLogs: 0
      });
    });
  });
});