/**
 * @fileoverview Tests for migration service
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Service integration, health checks, lifecycle management
 * Main APIs: init(), runPendingMigrations(), rollbackToVersion(), healthCheck()
 * Constraints: Requires Pool and MigrationRunner mocking
 * Patterns: Tests auto-migration, validation, and error scenarios
 */

import { Pool } from 'pg';
import { MigrationService } from '@database/migration-service';
import { MigrationRunner } from '@database/migration-runner';

// Mock dependencies
jest.mock('@database/migration-runner');
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('MigrationService', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockRunner: jest.Mocked<MigrationRunner>;
  let service: MigrationService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      connect: jest.fn(),
      end: jest.fn(),
    } as any;

    mockRunner = {
      migrate: jest.fn(),
      rollback: jest.fn(),
      getStatus: jest.fn(),
      validate: jest.fn(),
    } as any;

    // Mock the MigrationRunner constructor
    (MigrationRunner as jest.MockedClass<typeof MigrationRunner>).mockImplementation(() => mockRunner);

    service = new MigrationService(mockPool, {
      autoMigrate: false,
      validateOnStartup: true,
    });
  });

  describe('Initialization', () => {
    it('should initialize with validation and no auto-migration', async () => {
      mockRunner.validate.mockResolvedValue({ valid: true, errors: [] });

      await service.init();

      expect(mockRunner.validate).toHaveBeenCalled();
      expect(mockRunner.migrate).not.toHaveBeenCalled();
    });

    it('should auto-migrate when enabled', async () => {
      service = new MigrationService(mockPool, {
        autoMigrate: true,
        validateOnStartup: true,
      });

      mockRunner.validate.mockResolvedValue({ valid: true, errors: [] });
      mockRunner.migrate.mockResolvedValue([
        { version: 1, name: 'test', success: true, executionTime: 100 },
      ]);

      await service.init();

      expect(mockRunner.validate).toHaveBeenCalled();
      expect(mockRunner.migrate).toHaveBeenCalled();
    });

    it('should fail initialization on validation errors', async () => {
      mockRunner.validate.mockResolvedValue({
        valid: false,
        errors: ['Duplicate migration versions: 1'],
      });

      await expect(service.init()).rejects.toThrow('Migration validation failed');
    });

    it('should skip validation when disabled', async () => {
      service = new MigrationService(mockPool, {
        autoMigrate: false,
        validateOnStartup: false,
      });

      await service.init();

      expect(mockRunner.validate).not.toHaveBeenCalled();
    });
  });

  describe('Migration Execution', () => {
    it('should run pending migrations successfully', async () => {
      const mockResults = [
        { version: 1, name: 'first', success: true, executionTime: 100 },
        { version: 2, name: 'second', success: true, executionTime: 150 },
      ];

      mockRunner.migrate.mockResolvedValue(mockResults);

      const results = await service.runPendingMigrations();

      expect(results).toEqual(mockResults);
      expect(mockRunner.migrate).toHaveBeenCalled();
    });

    it('should handle no pending migrations', async () => {
      mockRunner.migrate.mockResolvedValue([]);

      const results = await service.runPendingMigrations();

      expect(results).toHaveLength(0);
    });

    it('should fail when migrations have errors', async () => {
      const mockResults = [
        { version: 1, name: 'first', success: true, executionTime: 100 },
        { version: 2, name: 'second', success: false, executionTime: 50, error: 'SQL error' },
      ];

      mockRunner.migrate.mockResolvedValue(mockResults);

      await expect(service.runPendingMigrations()).rejects.toThrow('1 migration(s) failed');
    });
  });

  describe('Migration Rollback', () => {
    it('should rollback to target version successfully', async () => {
      const mockResults = [
        { version: 3, name: 'third', success: true, executionTime: 80 },
        { version: 2, name: 'second', success: true, executionTime: 90 },
      ];

      mockRunner.rollback.mockResolvedValue(mockResults);

      const results = await service.rollbackToVersion(1);

      expect(results).toEqual(mockResults);
      expect(mockRunner.rollback).toHaveBeenCalledWith(1);
    });

    it('should handle no rollbacks needed', async () => {
      mockRunner.rollback.mockResolvedValue([]);

      const results = await service.rollbackToVersion(5);

      expect(results).toHaveLength(0);
    });

    it('should fail when rollbacks have errors', async () => {
      const mockResults = [
        { version: 3, name: 'third', success: true, executionTime: 80 },
        { version: 2, name: 'second', success: false, executionTime: 40, error: 'Rollback failed' },
      ];

      mockRunner.rollback.mockResolvedValue(mockResults);

      await expect(service.rollbackToVersion(1)).rejects.toThrow('1 rollback(s) failed');
    });
  });

  describe('Status Information', () => {
    it('should provide migration status with up-to-date flag', async () => {
      const mockStatus = {
        appliedMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        pendingMigrations: [],
        totalAvailable: 1,
      };

      mockRunner.getStatus.mockResolvedValue(mockStatus);

      const status = await service.getStatus();

      expect(status.isUpToDate).toBe(true);
      expect(status.appliedMigrations).toHaveLength(1);
      expect(status.pendingMigrations).toHaveLength(0);
    });

    it('should indicate when migrations are pending', async () => {
      const mockStatus = {
        appliedMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        pendingMigrations: [
          { version: 2, name: 'second', description: 'Second migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        totalAvailable: 2,
      };

      mockRunner.getStatus.mockResolvedValue(mockStatus);

      const status = await service.getStatus();

      expect(status.isUpToDate).toBe(false);
      expect(status.pendingMigrations).toHaveLength(1);
    });

    it('should check if specific migration is applied', async () => {
      const mockStatus = {
        appliedMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
          { version: 3, name: 'third', description: 'Third migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        pendingMigrations: [],
        totalAvailable: 2,
      };

      mockRunner.getStatus.mockResolvedValue(mockStatus);

      const isApplied1 = await service.isMigrationApplied(1);
      const isApplied2 = await service.isMigrationApplied(2);
      const isApplied3 = await service.isMigrationApplied(3);

      expect(isApplied1).toBe(true);
      expect(isApplied2).toBe(false);
      expect(isApplied3).toBe(true);
    });

    it('should get latest applied version', async () => {
      const mockStatus = {
        appliedMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
          { version: 3, name: 'third', description: 'Third migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
          { version: 2, name: 'second', description: 'Second migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        pendingMigrations: [],
        totalAvailable: 3,
      };

      mockRunner.getStatus.mockResolvedValue(mockStatus);

      const latestVersion = await service.getLatestVersion();

      expect(latestVersion).toBe(3);
    });

    it('should return null for latest version when no migrations applied', async () => {
      const mockStatus = {
        appliedMigrations: [],
        pendingMigrations: [],
        totalAvailable: 0,
      };

      mockRunner.getStatus.mockResolvedValue(mockStatus);

      const latestVersion = await service.getLatestVersion();

      expect(latestVersion).toBeNull();
    });
  });

  describe('Health Check', () => {
    it('should report healthy status when all is well', async () => {
      mockRunner.validate.mockResolvedValue({ valid: true, errors: [] });
      mockRunner.getStatus.mockResolvedValue({
        appliedMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date('2025-01-01'), dependencies: [], rollbackAvailable: false },
        ],
        pendingMigrations: [],
        totalAvailable: 1,
      });

      const health = await service.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details.migrationsValid).toBe(true);
      expect(health.details.pendingCount).toBe(0);
      expect(health.details.lastMigrationTime).toBeInstanceOf(Date);
    });

    it('should report warning when migrations are pending', async () => {
      mockRunner.validate.mockResolvedValue({ valid: true, errors: [] });
      mockRunner.getStatus.mockResolvedValue({
        appliedMigrations: [],
        pendingMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        totalAvailable: 1,
      });

      const health = await service.healthCheck();

      expect(health.status).toBe('warning');
      expect(health.details.pendingCount).toBe(1);
    });

    it('should report error when validation fails', async () => {
      mockRunner.validate.mockResolvedValue({
        valid: false,
        errors: ['Validation error'],
      });
      mockRunner.getStatus.mockResolvedValue({
        appliedMigrations: [],
        pendingMigrations: [],
        totalAvailable: 0,
      });

      const health = await service.healthCheck();

      expect(health.status).toBe('error');
      expect(health.details.migrationsValid).toBe(false);
    });

    it('should handle health check errors gracefully', async () => {
      mockRunner.validate.mockRejectedValue(new Error('Database connection failed'));

      const health = await service.healthCheck();

      expect(health.status).toBe('error');
      expect(health.details.migrationsValid).toBe(false);
      expect(health.details.pendingCount).toBe(-1);
    });
  });

  describe('Utility Methods', () => {
    it('should get applied migration count', async () => {
      mockRunner.getStatus.mockResolvedValue({
        appliedMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
          { version: 2, name: 'second', description: 'Second migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        pendingMigrations: [],
        totalAvailable: 2,
      });

      const count = await service.getAppliedCount();

      expect(count).toBe(2);
    });

    it('should get pending migration count', async () => {
      mockRunner.getStatus.mockResolvedValue({
        appliedMigrations: [],
        pendingMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        totalAvailable: 1,
      });

      const count = await service.getPendingCount();

      expect(count).toBe(1);
    });

    it('should check if database is up to date', async () => {
      mockRunner.getStatus.mockResolvedValue({
        appliedMigrations: [
          { version: 1, name: 'first', description: 'First migration', author: 'Test', created: new Date(), dependencies: [], rollbackAvailable: false },
        ],
        pendingMigrations: [],
        totalAvailable: 1,
      });

      const isUpToDate = await service.isUpToDate();

      expect(isUpToDate).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should validate migrations successfully', async () => {
      mockRunner.validate.mockResolvedValue({ valid: true, errors: [] });

      await expect(service.validateMigrations()).resolves.not.toThrow();
    });

    it('should throw on validation errors', async () => {
      mockRunner.validate.mockResolvedValue({
        valid: false,
        errors: ['Error 1', 'Error 2'],
      });

      await expect(service.validateMigrations()).rejects.toThrow(
        'Migration validation failed: Error 1, Error 2'
      );
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly', async () => {
      await expect(service.dispose()).resolves.not.toThrow();
    });
  });
});