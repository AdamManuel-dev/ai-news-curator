/**
 * @fileoverview Tests for API key rotation functionality
 * @lastmodified 2025-01-27T22:30:00Z
 * 
 * Features: API key rotation, expiring key detection, automated rotation, cleanup operations
 * Main APIs: rotateApiKey(), rotateExpiringKeys(), cleanup()
 * Constraints: Requires test database, mock Redis, transaction support
 * Patterns: Setup/teardown, mock dependencies, comprehensive test scenarios
 */

import { ApiKeyService, CreateApiKeyParams } from '../api-key';
import { DatabaseConnection } from '@database/connection';
import { config } from '@config/index';

// Mock dependencies
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock config
jest.mock('@config/index', () => ({
  config: {
    jwtSecret: 'test-secret',
    apiKeyRotationDays: 90
  }
}));

describe('ApiKeyService - Rotation', () => {
  let apiKeyService: ApiKeyService;
  let mockDb: jest.Mocked<DatabaseConnection>;
  let mockQuery: jest.MockedFunction<any>;

  beforeEach(() => {
    mockQuery = jest.fn();
    mockDb = {
      query: mockQuery,
      connect: jest.fn(),
      disconnect: jest.fn()
    } as any;

    apiKeyService = new ApiKeyService(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rotateApiKey', () => {
    const mockOldKey = {
      id: 'old-key-id',
      key_hash: 'old-hash',
      name: 'Test Key',
      user_id: 'user-123',
      permissions: ['read', 'write'],
      rate_limit: 1000,
      is_active: true,
      last_used_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
      created_at: new Date()
    };

    const mockNewKey = {
      id: 'new-key-id',
      key_hash: 'new-hash',
      name: 'Test Key (Rotated)',
      user_id: 'user-123',
      permissions: ['read', 'write'],
      rate_limit: 1000,
      is_active: true,
      last_used_at: null,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      created_at: new Date()
    };

    it('should successfully rotate an API key', async () => {
      // Setup mocks
      mockQuery
        .mockResolvedValueOnce({ result: 'BEGIN' }) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [mockOldKey] }) // SELECT existing key
        .mockResolvedValueOnce({ rows: [mockNewKey] }) // INSERT new key
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE old key
        .mockResolvedValueOnce({ result: 'COMMIT' }); // COMMIT transaction

      const result = await apiKeyService.rotateApiKey('old-key-id', 'user-123', 90);

      expect(result).toEqual({
        oldKey: mockOldKey,
        newKey: mockNewKey,
        rawKey: expect.stringMatching(/^aic_[a-f0-9]{64}$/)
      });

      // Verify transaction management
      expect(mockQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockQuery).toHaveBeenCalledWith('COMMIT');

      // Verify key lookup
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM api_keys'),
        ['old-key-id', 'user-123']
      );

      // Verify new key creation
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.arrayContaining([
          expect.any(String), // key_hash
          'Test Key (Rotated)',
          'user-123',
          JSON.stringify(['read', 'write']),
          1000,
          expect.any(Date),
          expect.stringContaining('Rotated from key old-key-id')
        ])
      );

      // Verify old key deactivation
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys SET is_active = FALSE'),
        ['old-key-id']
      );
    });

    it('should rollback transaction on error', async () => {
      mockQuery
        .mockResolvedValueOnce({ result: 'BEGIN' }) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [mockOldKey] }) // SELECT existing key
        .mockRejectedValueOnce(new Error('Database error')); // INSERT fails

      await expect(
        apiKeyService.rotateApiKey('old-key-id', 'user-123', 90)
      ).rejects.toThrow('Database error');

      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw error if key not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ result: 'BEGIN' }) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }); // No key found

      await expect(
        apiKeyService.rotateApiKey('nonexistent-key', 'user-123', 90)
      ).rejects.toThrow('API key not found or access denied');

      expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should work without userId restriction', async () => {
      mockQuery
        .mockResolvedValueOnce({ result: 'BEGIN' })
        .mockResolvedValueOnce({ rows: [mockOldKey] })
        .mockResolvedValueOnce({ rows: [mockNewKey] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ result: 'COMMIT' });

      await apiKeyService.rotateApiKey('old-key-id', undefined, 90);

      // Verify query without user restriction
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/SELECT \* FROM api_keys.*WHERE id = \$1 AND is_active = TRUE$/),
        ['old-key-id']
      );
    });
  });

  describe('rotateExpiringKeys', () => {
    const mockExpiringKeys = [
      {
        id: 'key-1',
        name: 'Expiring Key 1',
        user_id: 'user-1',
        email: 'user1@example.com',
        permissions: ['read'],
        rate_limit: 1000,
        expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
      },
      {
        id: 'key-2',
        name: 'Expiring Key 2',
        user_id: 'user-2',
        email: 'user2@example.com',
        permissions: ['read', 'write'],
        rate_limit: 2000,
        expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days
      }
    ];

    it('should find and notify about expiring keys without rotation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockExpiringKeys });

      const result = await apiKeyService.rotateExpiringKeys(7, false);

      expect(result).toEqual({
        rotated: 0,
        notified: ['user1@example.com', 'user2@example.com'],
        rotationResults: []
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT ak.*, u.email FROM api_keys ak'),
        []
      );
    });

    it('should automatically rotate expiring keys when enabled', async () => {
      // Mock expiring keys query
      mockQuery.mockResolvedValueOnce({ rows: mockExpiringKeys });

      // Mock successful rotations for both keys
      const rotateApiKeySpy = jest.spyOn(apiKeyService, 'rotateApiKey')
        .mockResolvedValueOnce({
          oldKey: mockExpiringKeys[0] as any,
          newKey: { id: 'new-key-1' } as any,
          rawKey: 'new-raw-key-1'
        })
        .mockResolvedValueOnce({
          oldKey: mockExpiringKeys[1] as any,
          newKey: { id: 'new-key-2' } as any,
          rawKey: 'new-raw-key-2'
        });

      const result = await apiKeyService.rotateExpiringKeys(7, true);

      expect(result).toEqual({
        rotated: 2,
        notified: ['user1@example.com', 'user2@example.com'],
        rotationResults: [
          { keyId: 'key-1', success: true, newKeyId: 'new-key-1' },
          { keyId: 'key-2', success: true, newKeyId: 'new-key-2' }
        ]
      });

      expect(rotateApiKeySpy).toHaveBeenCalledTimes(2);
      expect(rotateApiKeySpy).toHaveBeenCalledWith('key-1', undefined, 90);
      expect(rotateApiKeySpy).toHaveBeenCalledWith('key-2', undefined, 90);

      rotateApiKeySpy.mockRestore();
    });

    it('should handle partial rotation failures', async () => {
      mockQuery.mockResolvedValueOnce({ rows: mockExpiringKeys });

      const rotateApiKeySpy = jest.spyOn(apiKeyService, 'rotateApiKey')
        .mockResolvedValueOnce({
          oldKey: mockExpiringKeys[0] as any,
          newKey: { id: 'new-key-1' } as any,
          rawKey: 'new-raw-key-1'
        })
        .mockRejectedValueOnce(new Error('Rotation failed'));

      const result = await apiKeyService.rotateExpiringKeys(7, true);

      expect(result).toEqual({
        rotated: 1,
        notified: ['user1@example.com', 'user2@example.com'],
        rotationResults: [
          { keyId: 'key-1', success: true, newKeyId: 'new-key-1' },
          { keyId: 'key-2', success: false, error: 'Rotation failed' }
        ]
      });

      rotateApiKeySpy.mockRestore();
    });

    it('should handle no expiring keys', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await apiKeyService.rotateExpiringKeys(7, true);

      expect(result).toEqual({
        rotated: 0,
        notified: [],
        rotationResults: []
      });
    });

    it('should use custom days before expiry', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await apiKeyService.rotateExpiringKeys(14, false);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '14 days'"),
        []
      );
    });
  });

  describe('cleanup', () => {
    it('should successfully clean up expired keys and old logs', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 5 }) // Deleted expired keys
        .mockResolvedValueOnce({ rowCount: 100 }); // Deleted old logs

      const result = await apiKeyService.cleanup(90);

      expect(result).toEqual({
        deletedKeys: 5,
        deletedLogs: 100
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM api_keys'),
        []
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM api_key_logs'),
        []
      );
    });

    it('should use custom retention days', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 });

      await apiKeyService.cleanup(30);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '30 days'"),
        []
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await apiKeyService.cleanup(90);

      expect(result).toEqual({
        deletedKeys: 0,
        deletedLogs: 0
      });
    });

    it('should handle null rowCount', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: null })
        .mockResolvedValueOnce({ rowCount: undefined });

      const result = await apiKeyService.cleanup(90);

      expect(result).toEqual({
        deletedKeys: 0,
        deletedLogs: 0
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle end-to-end rotation workflow', async () => {
      // Find expiring keys
      const expiringKey = {
        id: 'expiring-key',
        name: 'About to Expire',
        user_id: 'user-123',
        email: 'user@example.com',
        permissions: ['read'],
        rate_limit: 1000,
        expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days
      };

      const newKey = {
        id: 'rotated-key',
        name: 'About to Expire (Rotated)',
        user_id: 'user-123',
        permissions: ['read'],
        rate_limit: 1000,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
      };

      // Mock the full workflow
      mockQuery
        .mockResolvedValueOnce({ rows: [expiringKey] }) // Find expiring keys
        .mockResolvedValueOnce({ result: 'BEGIN' }) // Start rotation transaction
        .mockResolvedValueOnce({ rows: [expiringKey] }) // Find key for rotation
        .mockResolvedValueOnce({ rows: [newKey] }) // Create new key
        .mockResolvedValueOnce({ rowCount: 1 }) // Deactivate old key
        .mockResolvedValueOnce({ result: 'COMMIT' }); // Commit transaction

      const result = await apiKeyService.rotateExpiringKeys(7, true);

      expect(result.rotated).toBe(1);
      expect(result.notified).toContain('user@example.com');
      expect(result.rotationResults[0].success).toBe(true);
      expect(result.rotationResults[0].newKeyId).toBe('rotated-key');
    });
  });
});