/**
 * @fileoverview Tests for database seeding system with comprehensive seed orchestration
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Full seed execution testing, individual seed running, seed clearing, error handling
 * Main APIs: runAllSeeds(), runSeed(), clearAllSeeds(), environment validation
 * Constraints: Requires mock database connection, individual seed modules, Jest framework
 * Patterns: Mock all seed functions, test execution order, validate error scenarios
 */

import { DatabaseSeeder, SeedConfig } from '../index';

// Mock database connection
const mockDb = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  execute: jest.fn(),
  queryOne: jest.fn(),
  query: jest.fn()
} as any;

// Mock individual seed functions
jest.mock('../authors', () => ({
  seedAuthors: jest.fn().mockResolvedValue({ created: 5, skipped: 2, errors: [] })
}));

jest.mock('../sources', () => ({
  seedSources: jest.fn().mockResolvedValue({ created: 10, skipped: 1, errors: [] })
}));

jest.mock('../tags', () => ({
  seedTags: jest.fn().mockResolvedValue({ created: 25, skipped: 0, errors: [] })
}));

jest.mock('../users', () => ({
  seedUsers: jest.fn().mockResolvedValue({ created: 3, skipped: 0, errors: [] })
}));

jest.mock('../content', () => ({
  seedContent: jest.fn().mockResolvedValue({ created: 0, skipped: 0, errors: [] })
}));

jest.mock('../interactions', () => ({
  seedUserInteractions: jest.fn().mockResolvedValue({ created: 0, skipped: 0, errors: [] })
}));

jest.mock('../trends', () => ({
  seedTrends: jest.fn().mockResolvedValue({ created: 0, skipped: 0, errors: [] })
}));

jest.mock('../api-keys', () => ({
  seedApiKeys: jest.fn().mockResolvedValue({ created: 0, skipped: 0, errors: [] })
}));

// Mock logger
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('DatabaseSeeder', () => {
  let seeder: DatabaseSeeder;
  let config: SeedConfig;

  beforeEach(() => {
    config = {
      environment: 'testing',
      batchSize: 100,
      skipExisting: true,
      verbose: false
    };

    seeder = new DatabaseSeeder(mockDb, config);
    jest.clearAllMocks();
  });

  describe('runAllSeeds', () => {
    it('should run all seeds in correct order', async () => {
      const results = await seeder.runAllSeeds();

      expect(results).toHaveLength(8);
      expect(results[0]?.tableName).toBe('authors');
      expect(results[1]?.tableName).toBe('sources');
      expect(results[2]?.tableName).toBe('tags');
      expect(results[3]?.tableName).toBe('users');
      
      // Check totals
      const totalCreated = results.reduce((sum, r) => sum + r.recordsCreated, 0);
      const totalSkipped = results.reduce((sum, r) => sum + r.recordsSkipped, 0);
      
      expect(totalCreated).toBe(43); // 5+10+25+3+0+0+0+0
      expect(totalSkipped).toBe(3);  // 2+1+0+0+0+0+0+0
    });

    it('should handle seed failures gracefully', async () => {
      // Mock one seed to fail
      const { seedSources } = require('../sources');
      seedSources.mockRejectedValueOnce(new Error('Source seed failed'));

      const results = await seeder.runAllSeeds();

      expect(results).toHaveLength(8);
      expect(results[1]?.tableName).toBe('sources');
      expect(results[1]?.errors).toContain('Source seed failed');
      expect(results[1]?.recordsCreated).toBe(0);
    });

    it('should stop on critical seed failures', async () => {
      // Mock authors seed to fail (critical dependency)
      const { seedAuthors } = require('../authors');
      seedAuthors.mockRejectedValueOnce(new Error('Authors seed failed'));

      await expect(seeder.runAllSeeds()).rejects.toThrow('Critical seed failed: authors');
    });
  });

  describe('runSeed', () => {
    it('should run a specific seed successfully', async () => {
      const result = await seeder.runSeed('authors');

      expect(result.tableName).toBe('authors');
      expect(result.recordsCreated).toBe(5);
      expect(result.recordsSkipped).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle unknown seed names', async () => {
      await expect(seeder.runSeed('unknown')).rejects.toThrow('Unknown seed: unknown');
    });

    it('should handle seed errors', async () => {
      const { seedAuthors } = require('../authors');
      seedAuthors.mockRejectedValueOnce(new Error('Seed error'));

      const result = await seeder.runSeed('authors');

      expect(result.tableName).toBe('authors');
      expect(result.recordsCreated).toBe(0);
      expect(result.errors).toContain('Seed error');
    });
  });

  describe('clearAllSeeds', () => {
    it('should clear all seed data in development', async () => {
      mockDb.execute = jest.fn().mockResolvedValue(undefined);

      await seeder.clearAllSeeds();

      expect(mockDb.execute).toHaveBeenCalledTimes(9); // 9 tables to clear
      expect(mockDb.execute).toHaveBeenNthCalledWith(1, 'TRUNCATE TABLE user_interactions RESTART IDENTITY CASCADE');
      expect(mockDb.execute).toHaveBeenLastCalledWith('TRUNCATE TABLE authors RESTART IDENTITY CASCADE');
    });

    it('should refuse to clear in production', async () => {
      const prodSeeder = new DatabaseSeeder(mockDb, { ...config, environment: 'production' });

      await expect(prodSeeder.clearAllSeeds()).rejects.toThrow('Cannot clear seeds in production environment');
    });

    it('should handle clear errors gracefully', async () => {
      mockDb.execute = jest.fn()
        .mockResolvedValueOnce(undefined) // First table succeeds
        .mockRejectedValueOnce(new Error('Clear failed')); // Second table fails

      // Should not throw, just log warnings
      await expect(seeder.clearAllSeeds()).resolves.not.toThrow();
    });
  });

  describe('environment handling', () => {
    it('should work in development environment', () => {
      const devSeeder = new DatabaseSeeder(mockDb, { ...config, environment: 'development' });
      expect(devSeeder).toBeDefined();
    });

    it('should work in testing environment', () => {
      const testSeeder = new DatabaseSeeder(mockDb, { ...config, environment: 'testing' });
      expect(testSeeder).toBeDefined();
    });

    it('should work in production environment', () => {
      const prodSeeder = new DatabaseSeeder(mockDb, { ...config, environment: 'production' });
      expect(prodSeeder).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should respect skipExisting option', async () => {
      const noSkipConfig = { ...config, skipExisting: false };
      const noSkipSeeder = new DatabaseSeeder(mockDb, noSkipConfig);

      await noSkipSeeder.runSeed('authors');

      const { seedAuthors } = require('../authors');
      expect(seedAuthors).toHaveBeenCalledWith(mockDb, noSkipConfig);
    });

    it('should respect verbose option', async () => {
      const verboseConfig = { ...config, verbose: true };
      const verboseSeeder = new DatabaseSeeder(mockDb, verboseConfig);

      await verboseSeeder.runSeed('authors');

      const { seedAuthors } = require('../authors');
      expect(seedAuthors).toHaveBeenCalledWith(mockDb, verboseConfig);
    });

    it('should respect batchSize option', async () => {
      const batchConfig = { ...config, batchSize: 50 };
      const batchSeeder = new DatabaseSeeder(mockDb, batchConfig);

      await batchSeeder.runSeed('authors');

      const { seedAuthors } = require('../authors');
      expect(seedAuthors).toHaveBeenCalledWith(mockDb, batchConfig);
    });
  });
});