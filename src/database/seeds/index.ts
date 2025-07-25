/**
 * @fileoverview Database seeding orchestrator
 * 
 * Manages the execution of all seed files in proper dependency order.
 * Provides utilities for running seeds in development, testing, and production environments.
 * 
 * @module database/seeds
 */

import { DatabaseConnection } from '@database/connection';
import logger from '@utils/logger';
import { config } from '@config/index';

// Import all seed modules
import { seedAuthors } from './authors';
import { seedSources } from './sources';
import { seedTags } from './tags';
import { seedUsers } from './users';
import { seedContent } from './content';
import { seedUserInteractions } from './interactions';
import { seedTrends } from './trends';
import { seedApiKeys } from './api-keys';

/**
 * Seed configuration interface
 */
export interface SeedConfig {
  environment: 'development' | 'testing' | 'production';
  batchSize?: number;
  skipExisting?: boolean;
  verbose?: boolean;
}

/**
 * Seed execution result
 */
export interface SeedResult {
  tableName: string;
  recordsCreated: number;
  recordsSkipped: number;
  duration: number;
  errors: string[];
}

/**
 * Main seeding orchestrator class
 */
export class DatabaseSeeder {
  private db: DatabaseConnection;
  private config: SeedConfig;

  constructor(db: DatabaseConnection, seedConfig: SeedConfig) {
    this.db = db;
    this.config = seedConfig;
  }

  /**
   * Run all seeds in dependency order
   */
  async runAllSeeds(): Promise<SeedResult[]> {
    const results: SeedResult[] = [];
    
    logger.info('Starting database seeding process...', {
      environment: this.config.environment,
      skipExisting: this.config.skipExisting
    });

    try {
      // Execute seeds in dependency order
      const seedFunctions = [
        { name: 'authors', fn: seedAuthors },
        { name: 'sources', fn: seedSources },
        { name: 'tags', fn: seedTags },
        { name: 'users', fn: seedUsers },
        { name: 'content', fn: seedContent },
        { name: 'user_interactions', fn: seedUserInteractions },
        { name: 'trends', fn: seedTrends },
        { name: 'api_keys', fn: seedApiKeys }
      ];

      for (const { name, fn } of seedFunctions) {
        logger.info(`Seeding ${name}...`);
        const startTime = Date.now();

        try {
          const result = await fn(this.db, this.config);
          const duration = Date.now() - startTime;

          const seedResult: SeedResult = {
            tableName: name,
            recordsCreated: result.created,
            recordsSkipped: result.skipped,
            duration,
            errors: result.errors || []
          };

          results.push(seedResult);

          logger.info(`Completed seeding ${name}`, {
            recordsCreated: result.created,
            recordsSkipped: result.skipped,
            duration,
            hasErrors: (result.errors?.length || 0) > 0
          });

        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          const seedResult: SeedResult = {
            tableName: name,
            recordsCreated: 0,
            recordsSkipped: 0,
            duration,
            errors: [errorMessage]
          };

          results.push(seedResult);

          logger.error(`Failed to seed ${name}`, {
            error: errorMessage,
            duration
          });

          // Continue with other seeds unless it's a critical dependency
          if (name === 'authors' || name === 'sources' || name === 'tags') {
            throw new Error(`Critical seed failed: ${name}. Stopping seeding process.`);
          }
        }
      }

      // Summary
      const totalCreated = results.reduce((sum, r) => sum + r.recordsCreated, 0);
      const totalSkipped = results.reduce((sum, r) => sum + r.recordsSkipped, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

      logger.info('Database seeding completed', {
        totalRecordsCreated: totalCreated,
        totalRecordsSkipped: totalSkipped,
        totalErrors,
        totalDuration,
        environment: this.config.environment
      });

    } catch (error) {
      logger.error('Database seeding failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        environment: this.config.environment
      });
      throw error;
    }

    return results;
  }

  /**
   * Run a specific seed
   */
  async runSeed(seedName: string): Promise<SeedResult> {
    logger.info(`Running specific seed: ${seedName}`);

    const seedMap: Record<string, (db: DatabaseConnection, config: SeedConfig) => Promise<any>> = {
      authors: seedAuthors,
      sources: seedSources,
      tags: seedTags,
      users: seedUsers,
      content: seedContent,
      interactions: seedUserInteractions,
      trends: seedTrends,
      'api-keys': seedApiKeys
    };

    const seedFn = seedMap[seedName];
    if (!seedFn) {
      throw new Error(`Unknown seed: ${seedName}. Available seeds: ${Object.keys(seedMap).join(', ')}`);
    }

    const startTime = Date.now();
    try {
      const result = await seedFn(this.db, this.config);
      const duration = Date.now() - startTime;

      const seedResult: SeedResult = {
        tableName: seedName,
        recordsCreated: result.created,
        recordsSkipped: result.skipped,
        duration,
        errors: result.errors || []
      };

      logger.info(`Completed seed: ${seedName}`, seedResult);
      return seedResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`Failed to run seed: ${seedName}`, {
        error: errorMessage,
        duration
      });

      return {
        tableName: seedName,
        recordsCreated: 0,
        recordsSkipped: 0,
        duration,
        errors: [errorMessage]
      };
    }
  }

  /**
   * Clear all seed data (useful for testing)
   */
  async clearAllSeeds(): Promise<void> {
    if (this.config.environment === 'production') {
      throw new Error('Cannot clear seeds in production environment');
    }

    logger.warn('Clearing all seed data...', {
      environment: this.config.environment
    });

    // Delete in reverse dependency order
    const tables = [
      'user_interactions',
      'content_tags',
      'content',
      'api_keys',
      'trends',
      'users',
      'tags',
      'sources',
      'authors'
    ];

    for (const table of tables) {
      try {
        await this.db.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        logger.debug(`Cleared table: ${table}`);
      } catch (error) {
        logger.warn(`Failed to clear table ${table}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info('All seed data cleared');
  }
}

/**
 * Convenience function to run all seeds
 */
export async function runAllSeeds(seedConfig?: Partial<SeedConfig>): Promise<SeedResult[]> {
  const db = new DatabaseConnection(config.database);
  await db.connect();

  const defaultConfig: SeedConfig = {
    environment: (config.nodeEnv as any) || 'development',
    batchSize: 100,
    skipExisting: true,
    verbose: config.enableDebugLogging
  };

  const finalConfig = { ...defaultConfig, ...seedConfig };
  const seeder = new DatabaseSeeder(db, finalConfig);

  try {
    const results = await seeder.runAllSeeds();
    await db.disconnect();
    return results;
  } catch (error) {
    await db.disconnect();
    throw error;
  }
}

/**
 * Convenience function to run a specific seed
 */
export async function runSeed(seedName: string, seedConfig?: Partial<SeedConfig>): Promise<SeedResult> {
  const db = new DatabaseConnection(config.database);
  await db.connect();

  const defaultConfig: SeedConfig = {
    environment: (config.nodeEnv as any) || 'development',
    batchSize: 100,
    skipExisting: true,
    verbose: config.enableDebugLogging
  };

  const finalConfig = { ...defaultConfig, ...seedConfig };
  const seeder = new DatabaseSeeder(db, finalConfig);

  try {
    const result = await seeder.runSeed(seedName);
    await db.disconnect();
    return result;
  } catch (error) {
    await db.disconnect();
    throw error;
  }
}