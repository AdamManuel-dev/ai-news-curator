/**
 * @fileoverview Basic tests for database seeding system
 */

import { DatabaseSeeder, SeedConfig } from '../index';

// Simple mock database
const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn(),
  disconnect: jest.fn()
} as any;

describe('DatabaseSeeder Basic Tests', () => {
  let config: SeedConfig;

  beforeEach(() => {
    config = {
      environment: 'testing',
      batchSize: 100,
      skipExisting: true,
      verbose: false
    };
    jest.clearAllMocks();
  });

  it('should create DatabaseSeeder instance', () => {
    const seeder = new DatabaseSeeder(mockDb, config);
    expect(seeder).toBeDefined();
  });

  it('should handle different environments', () => {
    const configs = ['development', 'testing', 'production'] as const;
    
    for (const env of configs) {
      const seeder = new DatabaseSeeder(mockDb, { ...config, environment: env });
      expect(seeder).toBeDefined();
    }
  });

  it('should handle different batch sizes', () => {
    const seeder = new DatabaseSeeder(mockDb, { ...config, batchSize: 50 });
    expect(seeder).toBeDefined();
  });

  it('should handle verbose and skipExisting options', () => {
    const seeder = new DatabaseSeeder(mockDb, { 
      ...config, 
      verbose: true, 
      skipExisting: false 
    });
    expect(seeder).toBeDefined();
  });
});