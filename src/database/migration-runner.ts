/**
 * @fileoverview Database migration runner with rollback support
 *
 * Provides a robust migration system with validation, dependency checking,
 * and automatic rollback capabilities for database schema management.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import fs from 'fs/promises';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import logger from '@utils/logger';

// Migration metadata interface
export interface MigrationMetadata {
  version: number;
  name: string;
  description: string;
  author: string;
  created: Date;
  dependencies: number[];
  rollbackAvailable: boolean;
}

// Migration execution result
export interface MigrationResult {
  version: number;
  name: string;
  success: boolean;
  executionTime: number;
  error?: string;
}

// Migration runner configuration
export interface MigrationConfig {
  migrationsPath: string;
  tableName: string;
  lockTimeout: number;
  validateChecksums: boolean;
  allowRollback: boolean;
}

/**
 * Database migration runner
 */
export class MigrationRunner {
  private pool: Pool;

  private config: MigrationConfig;

  private lockAcquired = false;

  constructor(pool: Pool, config: Partial<MigrationConfig> = {}) {
    this.pool = pool;
    this.config = {
      migrationsPath: path.join(__dirname, 'migrations'),
      tableName: 'schema_migrations',
      lockTimeout: 30000,
      validateChecksums: true,
      allowRollback: true,
      ...config,
    };
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<MigrationResult[]> {
    const client = await this.pool.connect();

    try {
      await this.acquireLock(client);
      await this.ensureMigrationTable(client);

      const availableMigrations = await this.loadMigrations();
      const appliedMigrations = await this.getAppliedMigrations(client);
      const pendingMigrations = this.getPendingMigrations(availableMigrations, appliedMigrations);

      logger.info('Starting migration process', {
        available: availableMigrations.length,
        applied: appliedMigrations.length,
        pending: pendingMigrations.length,
      });

      const results: MigrationResult[] = [];

      for (const migration of pendingMigrations) {
        const result = await this.runMigration(client, migration);
        results.push(result);

        if (!result.success) {
          logger.error('Migration failed, stopping execution', {
            migration: migration.name,
            error: result.error,
          });
          break;
        }
      }

      return results;
    } finally {
      await this.releaseLock(client);
      client.release();
    }
  }

  /**
   * Rollback migrations to a specific version
   */
  async rollback(targetVersion: number): Promise<MigrationResult[]> {
    if (!this.config.allowRollback) {
      throw new Error('Rollback is disabled in current configuration');
    }

    const client = await this.pool.connect();

    try {
      await this.acquireLock(client);

      const appliedMigrations = await this.getAppliedMigrations(client);
      const migrationsToRollback = appliedMigrations
        .filter((m) => m.version > targetVersion)
        .sort((a, b) => b.version - a.version); // Reverse order for rollback

      logger.info('Starting rollback process', {
        targetVersion,
        migrationsToRollback: migrationsToRollback.length,
      });

      const results: MigrationResult[] = [];

      for (const migration of migrationsToRollback) {
        const result = await this.rollbackMigration(client, migration);
        results.push(result);

        if (!result.success) {
          logger.error('Rollback failed, stopping execution', {
            migration: migration.name,
            error: result.error,
          });
          break;
        }
      }

      return results;
    } finally {
      await this.releaseLock(client);
      client.release();
    }
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<{
    appliedMigrations: MigrationMetadata[];
    pendingMigrations: MigrationMetadata[];
    totalAvailable: number;
  }> {
    const client = await this.pool.connect();

    try {
      await this.ensureMigrationTable(client);

      const availableMigrations = await this.loadMigrations();
      const appliedMigrations = await this.getAppliedMigrations(client);
      const pendingMigrations = this.getPendingMigrations(availableMigrations, appliedMigrations);

      return {
        appliedMigrations,
        pendingMigrations,
        totalAvailable: availableMigrations.length,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Validate migration integrity
   */
  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const migrations = await this.loadMigrations();

      // Check for version conflicts
      const versions = migrations.map((m) => m.version);
      const duplicateVersions = versions.filter((v, i) => versions.indexOf(v) !== i);
      if (duplicateVersions.length > 0) {
        errors.push(`Duplicate migration versions: ${duplicateVersions.join(', ')}`);
      }

      // Check for dependency cycles
      const hasCycles = this.detectDependencyCycles(migrations);
      if (hasCycles) {
        errors.push('Circular dependencies detected in migrations');
      }

      // Check for missing dependencies
      for (const migration of migrations) {
        for (const depVersion of migration.dependencies) {
          if (!migrations.find((m) => m.version === depVersion)) {
            errors.push(
              `Migration ${migration.version} depends on missing migration ${depVersion}`
            );
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
      return { valid: false, errors };
    }
  }

  /**
   * Load all available migrations from filesystem
   */
  private async loadMigrations(): Promise<MigrationMetadata[]> {
    const files = await fs.readdir(this.config.migrationsPath);
    const migrationFiles = files.filter((file) => file.endsWith('.sql')).sort();

    const migrations: MigrationMetadata[] = [];

    for (const file of migrationFiles) {
      const filePath = path.join(this.config.migrationsPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const metadata = this.parseMigrationMetadata(content, file);
      migrations.push(metadata);
    }

    return migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Parse migration metadata from SQL comments
   */
  private parseMigrationMetadata(content: string, filename: string): MigrationMetadata {
    const lines = content.split('\n');
    const metadata: Partial<MigrationMetadata> = {};

    // Extract version from filename (format: XXX_name.sql)
    const versionMatch = filename.match(/^(\d+)_/);
    if (!versionMatch) {
      throw new Error(`Invalid migration filename format: ${filename}`);
    }
    metadata.version = parseInt(versionMatch[1], 10);

    // Parse header comments
    for (const line of lines.slice(0, 20)) {
      // Look in first 20 lines
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('-- Migration:')) {
        metadata.name = trimmedLine.replace('-- Migration:', '').trim();
      } else if (trimmedLine.startsWith('-- Description:')) {
        metadata.description = trimmedLine.replace('-- Description:', '').trim();
      } else if (trimmedLine.startsWith('-- Author:')) {
        metadata.author = trimmedLine.replace('-- Author:', '').trim();
      } else if (trimmedLine.startsWith('-- Created:')) {
        const dateStr = trimmedLine.replace('-- Created:', '').trim();
        metadata.created = new Date(dateStr);
      } else if (trimmedLine.startsWith('-- Depends:')) {
        const depsStr = trimmedLine.replace('-- Depends:', '').trim();
        metadata.dependencies = depsStr
          .split(',')
          .map((d) => parseInt(d.trim(), 10))
          .filter((d) => !isNaN(d));
      }
    }

    // Check for rollback file
    const rollbackPath = filename.replace('.sql', '_rollback.sql');
    metadata.rollbackAvailable = await this.fileExists(
      path.join(this.config.migrationsPath, rollbackPath)
    );

    return {
      version: metadata.version,
      name: metadata.name || filename.replace('.sql', ''),
      description: metadata.description || 'No description provided',
      author: metadata.author || 'Unknown',
      created: metadata.created || new Date(),
      dependencies: metadata.dependencies || [],
      rollbackAvailable: metadata.rollbackAvailable || false,
    };
  }

  /**
   * Get applied migrations from database
   */
  private async getAppliedMigrations(client: PoolClient): Promise<MigrationMetadata[]> {
    const result = await client.query(`
      SELECT version, name, applied_at 
      FROM ${this.config.tableName} 
      ORDER BY version
    `);

    return result.rows.map((row) => ({
      version: row.version,
      name: row.name,
      description: 'Applied migration',
      author: 'System',
      created: row.applied_at,
      dependencies: [],
      rollbackAvailable: false,
    }));
  }

  /**
   * Get pending migrations
   */
  private getPendingMigrations(
    available: MigrationMetadata[],
    applied: MigrationMetadata[]
  ): MigrationMetadata[] {
    const appliedVersions = new Set(applied.map((m) => m.version));
    return available.filter((m) => !appliedVersions.has(m.version));
  }

  /**
   * Run a single migration
   */
  private async runMigration(
    client: PoolClient,
    migration: MigrationMetadata
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      logger.info('Applying migration', {
        version: migration.version,
        name: migration.name,
      });

      await client.query('BEGIN');

      // Check dependencies
      for (const depVersion of migration.dependencies) {
        const depApplied = await this.isMigrationApplied(client, depVersion);
        if (!depApplied) {
          throw new Error(`Dependency migration ${depVersion} not applied`);
        }
      }

      // Load and execute migration SQL
      const migrationPath = path.join(
        this.config.migrationsPath,
        `${migration.version.toString().padStart(3, '0')}_${migration.name}.sql`
      );
      const sql = await fs.readFile(migrationPath, 'utf-8');

      // Execute migration (excluding metadata comments)
      const cleanSql = this.cleanMigrationSql(sql);
      await client.query(cleanSql);

      // Record migration as applied
      await client.query(
        `
        INSERT INTO ${this.config.tableName} (version, name, applied_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (version) DO NOTHING
      `,
        [migration.version, migration.name]
      );

      await client.query('COMMIT');

      const executionTime = Date.now() - startTime;
      logger.info('Migration applied successfully', {
        version: migration.version,
        name: migration.name,
        executionTime,
      });

      return {
        version: migration.version,
        name: migration.name,
        success: true,
        executionTime,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Migration failed', {
        version: migration.version,
        name: migration.name,
        error: errorMessage,
      });

      return {
        version: migration.version,
        name: migration.name,
        success: false,
        executionTime: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Rollback a single migration
   */
  private async rollbackMigration(
    client: PoolClient,
    migration: MigrationMetadata
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      logger.info('Rolling back migration', {
        version: migration.version,
        name: migration.name,
      });

      await client.query('BEGIN');

      // Load rollback SQL if available
      const rollbackPath = path.join(
        this.config.migrationsPath,
        `${migration.version.toString().padStart(3, '0')}_${migration.name}_rollback.sql`
      );

      if (await this.fileExists(rollbackPath)) {
        const rollbackSql = await fs.readFile(rollbackPath, 'utf-8');
        await client.query(this.cleanMigrationSql(rollbackSql));
      } else {
        logger.warn('No rollback script available', {
          version: migration.version,
          name: migration.name,
        });
      }

      // Remove migration record
      await client.query(
        `
        DELETE FROM ${this.config.tableName} 
        WHERE version = $1
      `,
        [migration.version]
      );

      await client.query('COMMIT');

      const executionTime = Date.now() - startTime;
      logger.info('Migration rolled back successfully', {
        version: migration.version,
        name: migration.name,
        executionTime,
      });

      return {
        version: migration.version,
        name: migration.name,
        success: true,
        executionTime,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Rollback failed', {
        version: migration.version,
        name: migration.name,
        error: errorMessage,
      });

      return {
        version: migration.version,
        name: migration.name,
        success: false,
        executionTime: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Clean migration SQL by removing metadata comments
   */
  private cleanMigrationSql(sql: string): string {
    return sql
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return (
          !trimmed.startsWith('-- Migration:') &&
          !trimmed.startsWith('-- Description:') &&
          !trimmed.startsWith('-- Author:') &&
          !trimmed.startsWith('-- Created:') &&
          !trimmed.startsWith('-- Depends:')
        );
      })
      .join('\n');
  }

  /**
   * Check if migration table exists and create if needed
   */
  private async ensureMigrationTable(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
  }

  /**
   * Check if a specific migration has been applied
   */
  private async isMigrationApplied(client: PoolClient, version: number): Promise<boolean> {
    const result = await client.query(
      `
      SELECT 1 FROM ${this.config.tableName} WHERE version = $1
    `,
      [version]
    );

    return result.rows.length > 0;
  }

  /**
   * Acquire migration lock to prevent concurrent migrations
   */
  private async acquireLock(client: PoolClient): Promise<void> {
    const lockId = 12345; // Arbitrary lock ID for migrations

    const result = await client.query(
      `
      SELECT pg_try_advisory_lock($1) as acquired
    `,
      [lockId]
    );

    if (!result.rows[0].acquired) {
      throw new Error('Could not acquire migration lock. Another migration may be running.');
    }

    this.lockAcquired = true;
    logger.debug('Migration lock acquired');
  }

  /**
   * Release migration lock
   */
  private async releaseLock(client: PoolClient): Promise<void> {
    if (this.lockAcquired) {
      const lockId = 12345;
      await client.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
      this.lockAcquired = false;
      logger.debug('Migration lock released');
    }
  }

  /**
   * Detect circular dependencies in migrations
   */
  private detectDependencyCycles(migrations: MigrationMetadata[]): boolean {
    const visited = new Set<number>();
    const recursionStack = new Set<number>();

    const hasCycle = (version: number): boolean => {
      if (recursionStack.has(version)) return true;
      if (visited.has(version)) return false;

      visited.add(version);
      recursionStack.add(version);

      const migration = migrations.find((m) => m.version === version);
      if (migration) {
        for (const dep of migration.dependencies) {
          if (hasCycle(dep)) return true;
        }
      }

      recursionStack.delete(version);
      return false;
    };

    for (const migration of migrations) {
      if (hasCycle(migration.version)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
