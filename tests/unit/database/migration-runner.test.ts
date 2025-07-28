/**
 * @fileoverview Tests for database migration runner
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Migration execution, rollback, validation, error handling
 * Main APIs: migrate(), rollback(), validate(), getStatus()
 * Constraints: Requires Pool and filesystem mocking
 * Patterns: Mocks database operations and file system access
 */

import { Pool, PoolClient } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { MigrationRunner } from '@database/migration-runner';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('path');
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('MigrationRunner', () => {
  let mockPool: jest.Mocked<Pool>;
  let mockClient: any;
  let runner: MigrationRunner;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockPath = path as jest.Mocked<typeof path>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock pool and client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn(),
    } as any;

    // Mock path operations
    mockPath.join.mockImplementation((...args) => args.join('/'));

    // Create runner instance
    runner = new MigrationRunner(mockPool, {
      migrationsPath: '/test/migrations',
      validateChecksums: false,
    });
  });

  describe('Migration Loading', () => {
    it('should load migrations from filesystem', async () => {
      // Mock filesystem
      mockFs.readdir.mockResolvedValue(['001_initial.sql', '002_users.sql'] as any);
      mockFs.readFile
        .mockResolvedValueOnce(`-- Migration: 001_initial
-- Description: Initial schema
-- Author: Test
-- Created: 2025-01-01

CREATE TABLE test;`)
        .mockResolvedValueOnce(`-- Migration: 002_users
-- Description: User table
-- Author: Test
-- Created: 2025-01-02
-- Depends: 1

CREATE TABLE users;`);

      // Mock access for rollback file check
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const migrations = await (runner as any).loadMigrations();

      expect(migrations).toHaveLength(2);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('001_initial');
      expect(migrations[1].version).toBe(2);
      expect(migrations[1].dependencies).toEqual([1]);
    });

    it('should parse migration metadata correctly', async () => {
      const content = `-- Migration: 001_test_migration
-- Description: Test migration for parsing
-- Author: Test Author
-- Created: 2025-01-01
-- Depends: 1, 2, 3

CREATE TABLE test;`;

      const metadata = (runner as any).parseMigrationMetadata(content, '001_test_migration.sql');

      expect(metadata).toEqual({
        version: 1,
        name: '001_test_migration',
        description: 'Test migration for parsing',
        author: 'Test Author',
        created: new Date('2025-01-01'),
        dependencies: [1, 2, 3],
        rollbackAvailable: false,
      });
    });

    it('should handle missing metadata gracefully', async () => {
      const content = 'CREATE TABLE test;';
      
      const metadata = (runner as any).parseMigrationMetadata(content, '001_test.sql');

      expect(metadata.version).toBe(1);
      expect(metadata.name).toBe('001_test');
      expect(metadata.description).toBe('No description provided');
      expect(metadata.author).toBe('Unknown');
      expect(metadata.dependencies).toEqual([]);
    });
  });

  describe('Migration Execution', () => {
    beforeEach(() => {
      // Mock successful migration table creation
      mockClient.query.mockResolvedValue({ rows: [] } as any);
    });

    it('should run pending migrations successfully', async () => {
      // Mock available migrations
      jest.spyOn(runner as any, 'loadMigrations').mockResolvedValue([
        {
          version: 1,
          name: 'test_migration',
          description: 'Test',
          author: 'Test',
          created: new Date(),
          dependencies: [],
          rollbackAvailable: false,
        },
      ]);

      // Mock no applied migrations
      jest.spyOn(runner as any, 'getAppliedMigrations').mockResolvedValue([]);

      // Mock file reading
      mockFs.readFile.mockResolvedValue('CREATE TABLE test;');

      // Mock advisory lock
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ acquired: true }] } as any) // lock
        .mockResolvedValueOnce({ rows: [] } as any) // ensure table
        .mockResolvedValueOnce({ rows: [] } as any) // begin
        .mockResolvedValueOnce({ rows: [] } as any) // migration sql
        .mockResolvedValueOnce({ rows: [] } as any) // record migration
        .mockResolvedValueOnce({ rows: [] } as any) // commit
        .mockResolvedValueOnce({ rows: [] } as any); // unlock

      const results = await runner.migrate();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].version).toBe(1);
    });

    it('should handle migration failures', async () => {
      // Mock migration that fails
      jest.spyOn(runner as any, 'loadMigrations').mockResolvedValue([
        {
          version: 1,
          name: 'failing_migration',
          description: 'Test',
          author: 'Test',
          created: new Date(),
          dependencies: [],
          rollbackAvailable: false,
        },
      ]);

      jest.spyOn(runner as any, 'getAppliedMigrations').mockResolvedValue([]);

      mockFs.readFile.mockResolvedValue('INVALID SQL;');

      // Mock lock acquisition and failure
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ acquired: true }] } as any) // lock
        .mockResolvedValueOnce({ rows: [] } as any) // ensure table
        .mockResolvedValueOnce({ rows: [] } as any) // begin
        .mockRejectedValueOnce(new Error('SQL syntax error')) // migration fails
        .mockResolvedValueOnce({ rows: [] } as any) // rollback
        .mockResolvedValueOnce({ rows: [] } as any); // unlock

      const results = await runner.migrate();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('SQL syntax error');
    });

    it('should check dependencies before migration', async () => {
      jest.spyOn(runner as any, 'loadMigrations').mockResolvedValue([
        {
          version: 2,
          name: 'dependent_migration',
          description: 'Test',
          author: 'Test',
          created: new Date(),
          dependencies: [1],
          rollbackAvailable: false,
        },
      ]);

      jest.spyOn(runner as any, 'getAppliedMigrations').mockResolvedValue([]);

      mockFs.readFile.mockResolvedValue('CREATE TABLE test;');

      // Mock dependency check failure
      jest.spyOn(runner as any, 'isMigrationApplied').mockResolvedValue(false);

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ acquired: true }] } as any) // lock
        .mockResolvedValueOnce({ rows: [] } as any) // ensure table
        .mockResolvedValueOnce({ rows: [] } as any) // begin
        .mockResolvedValueOnce({ rows: [] } as any); // rollback

      const results = await runner.migrate();

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('Dependency migration 1 not applied');
    });
  });

  describe('Migration Rollback', () => {
    it('should rollback migrations to target version', async () => {
      // Mock applied migrations
      jest.spyOn(runner as any, 'getAppliedMigrations').mockResolvedValue([
        { version: 1, name: 'first' },
        { version: 2, name: 'second' },
        { version: 3, name: 'third' },
      ]);

      mockFs.readFile.mockResolvedValue('DROP TABLE test;');
      jest.spyOn(runner as any, 'fileExists').mockResolvedValue(true);

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ acquired: true }] } as any) // lock
        .mockResolvedValueOnce({ rows: [] } as any) // begin (migration 3)
        .mockResolvedValueOnce({ rows: [] } as any) // rollback sql
        .mockResolvedValueOnce({ rows: [] } as any) // delete record
        .mockResolvedValueOnce({ rows: [] } as any) // commit
        .mockResolvedValueOnce({ rows: [] } as any) // begin (migration 2)
        .mockResolvedValueOnce({ rows: [] } as any) // rollback sql
        .mockResolvedValueOnce({ rows: [] } as any) // delete record
        .mockResolvedValueOnce({ rows: [] } as any) // commit
        .mockResolvedValueOnce({ rows: [] } as any); // unlock

      const results = await runner.rollback(1);

      expect(results).toHaveLength(2); // Should rollback migrations 3 and 2
      expect(results[0].version).toBe(3);
      expect(results[1].version).toBe(2);
      expect(results.every((r: any) => r.success)).toBe(true);
    });

    it('should handle missing rollback files gracefully', async () => {
      jest.spyOn(runner as any, 'getAppliedMigrations').mockResolvedValue([
        { version: 1, name: 'test' },
      ]);

      jest.spyOn(runner as any, 'fileExists').mockResolvedValue(false);

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ acquired: true }] } as any) // lock
        .mockResolvedValueOnce({ rows: [] } as any) // begin
        .mockResolvedValueOnce({ rows: [] } as any) // delete record
        .mockResolvedValueOnce({ rows: [] } as any) // commit
        .mockResolvedValueOnce({ rows: [] } as any); // unlock

      const results = await runner.rollback(0);

      expect(results[0].success).toBe(true);
      // Should still succeed even without rollback file
    });
  });

  describe('Migration Validation', () => {
    it('should detect duplicate version numbers', async () => {
      jest.spyOn(runner as any, 'loadMigrations').mockResolvedValue([
        { version: 1, name: 'first', dependencies: [] },
        { version: 1, name: 'duplicate', dependencies: [] },
      ]);

      const validation = await runner.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Duplicate migration versions: 1');
    });

    it('should detect missing dependencies', async () => {
      jest.spyOn(runner as any, 'loadMigrations').mockResolvedValue([
        { version: 2, name: 'dependent', dependencies: [1] },
      ]);

      const validation = await runner.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Migration 2 depends on missing migration 1');
    });

    it('should detect circular dependencies', async () => {
      jest.spyOn(runner as any, 'loadMigrations').mockResolvedValue([
        { version: 1, name: 'first', dependencies: [2] },
        { version: 2, name: 'second', dependencies: [1] },
      ]);

      const validation = await runner.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Circular dependencies detected in migrations');
    });

    it('should pass validation for valid migrations', async () => {
      jest.spyOn(runner as any, 'loadMigrations').mockResolvedValue([
        { version: 1, name: 'first', dependencies: [] },
        { version: 2, name: 'second', dependencies: [1] },
      ]);

      const validation = await runner.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Status Reporting', () => {
    it('should return accurate migration status', async () => {
      const availableMigrations = [
        { version: 1, name: 'first' },
        { version: 2, name: 'second' },
        { version: 3, name: 'third' },
      ];

      const appliedMigrations = [
        { version: 1, name: 'first' },
        { version: 2, name: 'second' },
      ];

      jest.spyOn(runner as any, 'loadMigrations').mockResolvedValue(availableMigrations);
      jest.spyOn(runner as any, 'getAppliedMigrations').mockResolvedValue(appliedMigrations);

      mockClient.query.mockResolvedValue({ rows: [] } as any);

      const status = await runner.getStatus();

      expect(status.totalAvailable).toBe(3);
      expect(status.appliedMigrations).toHaveLength(2);
      expect(status.pendingMigrations).toHaveLength(1);
      expect(status.pendingMigrations[0].version).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle lock acquisition failure', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ acquired: false }] } as any);

      await expect(runner.migrate()).rejects.toThrow('Could not acquire migration lock');
    });

    it('should handle filesystem errors', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      await expect(runner.validate()).rejects.toThrow('Permission denied');
    });

    it('should clean up resources on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ acquired: true }] } as any) // lock
        .mockRejectedValueOnce(new Error('Database error')); // error

      await expect(runner.migrate()).rejects.toThrow('Database error');

      // Should have attempted to release lock
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_unlock'),
        expect.any(Array)
      );
    });
  });
});