#!/usr/bin/env node

/**
 * @fileoverview Database seeding CLI
 * 
 * Command-line interface for running database seeds
 * 
 * Usage:
 *   npm run seed                    # Run all seeds
 *   npm run seed -- --seed authors # Run specific seed
 *   npm run seed -- --clear        # Clear all seed data
 *   npm run seed -- --env testing  # Run in specific environment
 * 
 * @module database/seeds/cli
 */

import { Command } from 'commander';
import { runAllSeeds, runSeed, DatabaseSeeder } from './index';
import { DatabaseConnection } from '@database/connection';
import { config } from '@config/index';
import logger from '@utils/logger';

const program = new Command();

program
  .name('seed')
  .description('Database seeding CLI')
  .version('1.0.0');

// Run all seeds
program
  .command('all')
  .description('Run all database seeds')
  .option('-e, --env <environment>', 'Environment (development, testing, production)', 'development')
  .option('-b, --batch-size <size>', 'Batch size for operations', '100')
  .option('-s, --skip-existing', 'Skip existing records', true)
  .option('-v, --verbose', 'Verbose logging', false)
  .action(async (options) => {
    try {
      logger.info('Starting database seeding...', { options });

      const results = await runAllSeeds({
        environment: options.env,
        batchSize: parseInt(options.batchSize),
        skipExisting: options.skipExisting,
        verbose: options.verbose
      });

      // Print summary
      console.log('\n=== Seeding Summary ===');
      for (const result of results) {
        const status = result.errors.length > 0 ? '❌' : '✅';
        console.log(`${status} ${result.tableName}: ${result.recordsCreated} created, ${result.recordsSkipped} skipped`);
        
        if (result.errors.length > 0) {
          console.log(`   Errors: ${result.errors.length}`);
          result.errors.forEach(error => console.log(`   - ${error}`));
        }
      }

      const totalCreated = results.reduce((sum, r) => sum + r.recordsCreated, 0);
      const totalSkipped = results.reduce((sum, r) => sum + r.recordsSkipped, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      console.log(`\nTotal: ${totalCreated} created, ${totalSkipped} skipped, ${totalErrors} errors`);

      process.exit(totalErrors > 0 ? 1 : 0);

    } catch (error) {
      logger.error('Seeding failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      console.error('❌ Seeding failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Run specific seed
program
  .command('run <seedName>')
  .description('Run a specific seed')
  .option('-e, --env <environment>', 'Environment (development, testing, production)', 'development')
  .option('-b, --batch-size <size>', 'Batch size for operations', '100')
  .option('-s, --skip-existing', 'Skip existing records', true)
  .option('-v, --verbose', 'Verbose logging', false)
  .action(async (seedName, options) => {
    try {
      logger.info(`Starting seed: ${seedName}...`, { options });

      const result = await runSeed(seedName, {
        environment: options.env,
        batchSize: parseInt(options.batchSize),
        skipExisting: options.skipExisting,
        verbose: options.verbose
      });

      // Print result
      const status = result.errors.length > 0 ? '❌' : '✅';
      console.log(`${status} ${result.tableName}: ${result.recordsCreated} created, ${result.recordsSkipped} skipped`);
      
      if (result.errors.length > 0) {
        console.log(`Errors: ${result.errors.length}`);
        result.errors.forEach(error => console.log(`- ${error}`));
      }

      process.exit(result.errors.length > 0 ? 1 : 0);

    } catch (error) {
      logger.error(`Seed ${seedName} failed`, { error: error instanceof Error ? error.message : 'Unknown error' });
      console.error(`❌ Seed ${seedName} failed:`, error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Clear all seed data
program
  .command('clear')
  .description('Clear all seed data (development and testing only)')
  .option('-e, --env <environment>', 'Environment (development, testing)', 'development')
  .action(async (options) => {
    if (options.env === 'production') {
      console.error('❌ Cannot clear seed data in production environment');
      process.exit(1);
    }

    try {
      const db = new DatabaseConnection(config.database);
      await db.connect();

      const seeder = new DatabaseSeeder(db, {
        environment: options.env,
        skipExisting: false,
        verbose: true
      });

      await seeder.clearAllSeeds();
      await db.disconnect();

      console.log('✅ All seed data cleared');
      process.exit(0);

    } catch (error) {
      logger.error('Failed to clear seed data', { error: error instanceof Error ? error.message : 'Unknown error' });
      console.error('❌ Failed to clear seed data:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// List available seeds
program
  .command('list')
  .description('List available seeds')
  .action(() => {
    console.log('Available seeds:');
    console.log('- authors');
    console.log('- sources');
    console.log('- tags');
    console.log('- users');
    console.log('- content');
    console.log('- interactions');
    console.log('- trends');
    console.log('- api-keys');
  });

// Default command (run all seeds)
if (process.argv.length <= 2) {
  process.argv.push('all');
}

program.parse(process.argv);