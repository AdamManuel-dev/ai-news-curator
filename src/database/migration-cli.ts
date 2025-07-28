#!/usr/bin/env node

/**
 * @fileoverview Command-line interface for database migrations
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Migration commands, status checking, file creation, validation
 * Main APIs: createCLI(), up/down/status/validate/create commands
 * Constraints: Requires database config, migration files directory
 * Patterns: Commander.js CLI, dry-run support, colored output
 */

import { Command } from 'commander';
import { Pool } from 'pg';
import { config } from '@config/index';
import logger from '@utils/logger';
import { MigrationRunner } from './migration-runner';

/**
 * Create database connection pool
 */
function createPool(): Pool {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    ssl: config.database.ssl,
    max: 1, // Only one connection needed for migrations
  });
}

/**
 * Format migration result for console output
 */
function formatResult(result: any): string {
  const status = result.success ? '✅' : '❌';
  const time = `(${result.executionTime}ms)`;
  return `${status} ${result.version}: ${result.name} ${time}`;
}

/**
 * Format migration status for console output
 */
function formatStatus(migration: any, applied: boolean): string {
  const status = applied ? '✅ Applied' : '⏳ Pending';
  const version = migration.version.toString().padStart(3, '0');
  return `${status} | ${version} | ${migration.name} | ${migration.description}`;
}

/**
 * Create migration CLI
 */
function createCLI(): Command {
  const program = new Command();

  program
    .name('migrate')
    .description('Database migration tool for AI Content Curator Agent')
    .version('1.0.0');

  // Migrate command
  program
    .command('up')
    .description('Run all pending migrations')
    .option('-d, --dry-run', 'Show what would be migrated without executing')
    .action(async (options) => {
      const pool = createPool();
      const runner = new MigrationRunner(pool);

      try {
        if (options.dryRun) {
          const status = await runner.getStatus();
          console.log('\n📋 Migration Status (Dry Run)\n');

          if (status.pendingMigrations.length === 0) {
            console.log('✅ All migrations are up to date');
          } else {
            console.log(`📊 ${status.pendingMigrations.length} pending migration(s):\n`);
            for (const migration of status.pendingMigrations) {
              console.log(formatStatus(migration, false));
            }
          }
        } else {
          console.log('\n🚀 Running migrations...\n');
          const results = await runner.migrate();

          if (results.length === 0) {
            console.log('✅ All migrations are up to date');
          } else {
            console.log('📊 Migration Results:\n');
            for (const result of results) {
              console.log(formatResult(result));
              if (!result.success) {
                console.error(`\n❌ Error: ${result.error}`);
                process.exit(1);
              }
            }
            console.log(`\n✅ Applied ${results.length} migration(s) successfully`);
          }
        }
      } catch (error) {
        console.error(
          '❌ Migration failed:',
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      } finally {
        await pool.end();
      }
    });

  // Rollback command
  program
    .command('down')
    .description('Rollback migrations to a specific version')
    .argument('<version>', 'Target version to rollback to')
    .option('-d, --dry-run', 'Show what would be rolled back without executing')
    .action(async (version, options) => {
      const pool = createPool();
      const runner = new MigrationRunner(pool);
      const targetVersion = parseInt(version, 10);

      if (isNaN(targetVersion)) {
        console.error('❌ Invalid version number');
        process.exit(1);
      }

      try {
        const status = await runner.getStatus();
        const migrationsToRollback = status.appliedMigrations
          .filter((m) => m.version > targetVersion)
          .sort((a, b) => b.version - a.version);

        if (options.dryRun) {
          console.log('\n📋 Rollback Status (Dry Run)\n');

          if (migrationsToRollback.length === 0) {
            console.log('✅ No migrations to rollback');
          } else {
            console.log(`📊 ${migrationsToRollback.length} migration(s) would be rolled back:\n`);
            for (const migration of migrationsToRollback) {
              console.log(formatStatus(migration, true));
            }
          }
        } else if (migrationsToRollback.length === 0) {
          console.log('✅ No migrations to rollback');
        } else {
          console.log(
            `\n⏪ Rolling back ${migrationsToRollback.length} migration(s) to version ${targetVersion}...\n`
          );
          const results = await runner.rollback(targetVersion);

          console.log('📊 Rollback Results:\n');
          for (const result of results) {
            console.log(formatResult(result));
            if (!result.success) {
              console.error(`\n❌ Error: ${result.error}`);
              process.exit(1);
            }
          }
          console.log(`\n✅ Rolled back ${results.length} migration(s) successfully`);
        }
      } catch (error) {
        console.error(
          '❌ Rollback failed:',
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      } finally {
        await pool.end();
      }
    });

  // Status command
  program
    .command('status')
    .description('Show migration status')
    .option('-v, --verbose', 'Show detailed information')
    .action(async (options) => {
      const pool = createPool();
      const runner = new MigrationRunner(pool);

      try {
        const status = await runner.getStatus();

        console.log('\n📊 Migration Status\n');
        console.log(`Total Available: ${status.totalAvailable}`);
        console.log(`Applied: ${status.appliedMigrations.length}`);
        console.log(`Pending: ${status.pendingMigrations.length}\n`);

        if (
          options.verbose ||
          status.appliedMigrations.length > 0 ||
          status.pendingMigrations.length > 0
        ) {
          console.log('📋 Detailed Status:\n');

          // Show applied migrations
          for (const migration of status.appliedMigrations) {
            console.log(formatStatus(migration, true));
          }

          // Show pending migrations
          for (const migration of status.pendingMigrations) {
            console.log(formatStatus(migration, false));
          }
        }

        if (status.pendingMigrations.length > 0) {
          console.log(
            `\n💡 Run 'migrate up' to apply ${status.pendingMigrations.length} pending migration(s)`
          );
        } else {
          console.log('\n✅ Database is up to date');
        }
      } catch (error) {
        console.error(
          '❌ Status check failed:',
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      } finally {
        await pool.end();
      }
    });

  // Validate command
  program
    .command('validate')
    .description('Validate migration files and dependencies')
    .action(async () => {
      const pool = createPool();
      const runner = new MigrationRunner(pool);

      try {
        console.log('\n🔍 Validating migrations...\n');
        const validation = await runner.validate();

        if (validation.valid) {
          console.log('✅ All migration files are valid');
        } else {
          console.log('❌ Migration validation failed:\n');
          for (const error of validation.errors) {
            console.log(`  • ${error}`);
          }
          process.exit(1);
        }
      } catch (error) {
        console.error(
          '❌ Validation failed:',
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      } finally {
        await pool.end();
      }
    });

  // Create command
  program
    .command('create')
    .description('Create a new migration file')
    .argument('<name>', 'Migration name (use snake_case)')
    .option('-d, --description <desc>', 'Migration description')
    .option('-a, --author <author>', 'Migration author', 'AI Content Curator Team')
    .option('--rollback', 'Create rollback file as well')
    .action(async (name, options) => {
      try {
        const migrationName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const timestamp = new Date();
        const version = Math.floor(timestamp.getTime() / 1000); // Unix timestamp as version
        const paddedVersion = version.toString();

        const migrationContent = `-- Migration: ${paddedVersion}_${migrationName}
-- Description: ${options.description || 'Migration description'}
-- Author: ${options.author}
-- Created: ${timestamp.toISOString().split('T')[0]}
-- Depends: 

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- Record this migration
INSERT INTO schema_migrations (version, name, applied_at) VALUES
(${version}, '${paddedVersion}_${migrationName}', NOW())
ON CONFLICT (version) DO NOTHING;
`;

        const migrationPath = `src/database/migrations/${paddedVersion}_${migrationName}.sql`;

        // Check if file already exists
        const fs = await import('fs/promises');
        try {
          await fs.access(migrationPath);
          console.error(`❌ Migration file already exists: ${migrationPath}`);
          process.exit(1);
        } catch {
          // File doesn't exist, which is what we want
        }

        await fs.writeFile(migrationPath, migrationContent);
        console.log(`✅ Created migration: ${migrationPath}`);

        if (options.rollback) {
          const rollbackContent = `-- Rollback: ${paddedVersion}_${migrationName}
-- Description: Rollback for ${options.description || 'Migration description'}
-- Author: ${options.author}
-- Created: ${timestamp.toISOString().split('T')[0]}

-- Add your rollback SQL here
-- Example:
-- DROP TABLE IF EXISTS example;

-- Remove migration record
DELETE FROM schema_migrations WHERE version = ${version};
`;

          const rollbackPath = `src/database/migrations/${paddedVersion}_${migrationName}_rollback.sql`;
          await fs.writeFile(rollbackPath, rollbackContent);
          console.log(`✅ Created rollback: ${rollbackPath}`);
        }

        console.log(`\n💡 Next steps:`);
        console.log(`  1. Edit ${migrationPath} to add your SQL`);
        if (options.rollback) {
          console.log(`  2. Edit the rollback file if needed`);
        }
        console.log(`  3. Run 'npm run migrate:up' to apply the migration`);
      } catch (error) {
        console.error(
          '❌ Failed to create migration:',
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    });

  return program;
}

// Execute CLI if run directly
if (require.main === module) {
  const cli = createCLI();
  cli.parse(process.argv);
}

export { createCLI };
