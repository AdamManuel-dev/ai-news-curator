/**
 * @fileoverview Migration service for dependency injection integration
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Service wrapper, auto-migration, validation, health checks
 * Main APIs: MigrationService class, init(), runPendingMigrations()
 * Constraints: Requires MigrationRunner, Pool connection
 * Patterns: Service pattern, configurable auto-migration, factory function
 */

import { Pool } from 'pg';
import logger from '@utils/logger';
import { MigrationRunner, MigrationResult, MigrationMetadata } from './migration-runner';

/**
 * Migration service configuration
 */
export interface MigrationServiceConfig {
  autoMigrate: boolean;
  validateOnStartup: boolean;
  migrationsPath?: string;
  allowRollback?: boolean;
}

/**
 * Migration service for application integration
 */
export class MigrationService {
  private runner: MigrationRunner;

  private config: MigrationServiceConfig;

  constructor(
    pool: Pool,
    config: MigrationServiceConfig = {
      autoMigrate: false,
      validateOnStartup: true,
    }
  ) {
    this.config = config;
    this.runner = new MigrationRunner(pool, {
      migrationsPath: config.migrationsPath,
      allowRollback: config.allowRollback,
    });
  }

  /**
   * Initialize migration service
   */
  async init(): Promise<void> {
    logger.info('Initializing migration service', this.config);

    // Validate migrations on startup
    if (this.config.validateOnStartup) {
      await this.validateMigrations();
    }

    // Auto-migrate if enabled
    if (this.config.autoMigrate) {
      await this.runPendingMigrations();
    }

    logger.info('Migration service initialized successfully');
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<MigrationResult[]> {
    logger.info('Running pending migrations');

    const results = await this.runner.migrate();

    if (results.length === 0) {
      logger.info('No pending migrations found');
    } else {
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      if (failed > 0) {
        logger.error('Some migrations failed', {
          successful,
          failed,
          total: results.length,
        });
        throw new Error(`${failed} migration(s) failed`);
      } else {
        logger.info('All migrations completed successfully', {
          applied: successful,
        });
      }
    }

    return results;
  }

  /**
   * Rollback migrations to a specific version
   */
  async rollbackToVersion(version: number): Promise<MigrationResult[]> {
    logger.info('Rolling back migrations', { targetVersion: version });

    const results = await this.runner.rollback(version);

    if (results.length === 0) {
      logger.info('No migrations to rollback');
    } else {
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      if (failed > 0) {
        logger.error('Some rollbacks failed', {
          successful,
          failed,
          total: results.length,
        });
        throw new Error(`${failed} rollback(s) failed`);
      } else {
        logger.info('All rollbacks completed successfully', {
          rolledBack: successful,
        });
      }
    }

    return results;
  }

  /**
   * Get current migration status
   */
  async getStatus(): Promise<{
    appliedMigrations: MigrationMetadata[];
    pendingMigrations: MigrationMetadata[];
    totalAvailable: number;
    isUpToDate: boolean;
  }> {
    const status = await this.runner.getStatus();

    return {
      ...status,
      isUpToDate: status.pendingMigrations.length === 0,
    };
  }

  /**
   * Validate all migrations
   */
  async validateMigrations(): Promise<void> {
    logger.debug('Validating migration files');

    const validation = await this.runner.validate();

    if (!validation.valid) {
      logger.error('Migration validation failed', {
        errors: validation.errors,
      });
      throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`);
    }

    logger.debug('All migrations are valid');
  }

  /**
   * Check if database is up to date
   */
  async isUpToDate(): Promise<boolean> {
    const status = await this.getStatus();
    return status.isUpToDate;
  }

  /**
   * Get applied migration count
   */
  async getAppliedCount(): Promise<number> {
    const status = await this.getStatus();
    return status.appliedMigrations.length;
  }

  /**
   * Get pending migration count
   */
  async getPendingCount(): Promise<number> {
    const status = await this.getStatus();
    return status.pendingMigrations.length;
  }

  /**
   * Check if a specific migration has been applied
   */
  async isMigrationApplied(version: number): Promise<boolean> {
    const status = await this.getStatus();
    return status.appliedMigrations.some((m) => m.version === version);
  }

  /**
   * Get the latest applied migration version
   */
  async getLatestVersion(): Promise<number | null> {
    const status = await this.getStatus();

    if (status.appliedMigrations.length === 0) {
      return null;
    }

    return Math.max(...status.appliedMigrations.map((m) => m.version));
  }

  /**
   * Health check for migration service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    details: {
      migrationsValid: boolean;
      pendingCount: number;
      lastMigrationTime?: Date;
    };
  }> {
    try {
      // Validate migrations
      const validation = await this.runner.validate();
      const status = await this.getStatus();

      const details = {
        migrationsValid: validation.valid,
        pendingCount: status.pendingMigrations.length,
        lastMigrationTime:
          status.appliedMigrations.length > 0
            ? status.appliedMigrations[status.appliedMigrations.length - 1].created
            : undefined,
      };

      // Determine overall health
      let healthStatus: 'healthy' | 'warning' | 'error' = 'healthy';

      if (!validation.valid) {
        healthStatus = 'error';
      } else if (status.pendingMigrations.length > 0) {
        healthStatus = 'warning';
      }

      return {
        status: healthStatus,
        details,
      };
    } catch (error) {
      logger.error('Migration health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        status: 'error',
        details: {
          migrationsValid: false,
          pendingCount: -1,
        },
      };
    }
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    logger.debug('Disposing migration service');
    // Migration runner doesn't hold persistent resources
    // Pool is managed by the database service
  }
}

/**
 * Factory function for creating migration service
 */
export function createMigrationService(
  pool: Pool,
  config?: MigrationServiceConfig
): MigrationService {
  return new MigrationService(pool, config);
}
