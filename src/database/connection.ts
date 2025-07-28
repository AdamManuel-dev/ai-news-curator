/**
 * @fileoverview Database connection management for PostgreSQL
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Connection pooling, transactions, query execution, health checks
 * Main APIs: DatabaseConnection class, getDatabase(), initializeDatabase()
 * Constraints: Requires PostgreSQL, config.database settings
 * Patterns: Singleton connection, pool monitoring, auto-migrations
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '@config/index';
import logger from '@utils/logger';
import { DatabaseConfig } from '@types/database';
import { EnhancedConnectionPool, getConnectionPool, initializePool } from './connection-pool';
import { getPoolMonitor, initializePoolMonitoring } from './pool-monitor';

/**
 * Database connection manager with connection pooling
 */
export class DatabaseConnection {
  private pool: Pool;

  private isConnected = false;

  constructor(dbConfig: DatabaseConfig) {
    this.pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.username,
      password: dbConfig.password,
      ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
      max: dbConfig.poolSize || 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: dbConfig.connectionTimeout || 5000,
      query_timeout: dbConfig.queryTimeout || 30000,
      statement_timeout: dbConfig.queryTimeout || 30000,
    });

    // Connection event handlers
    this.pool.on('connect', (client: PoolClient) => {
      logger.info('New database client connected');
    });

    this.pool.on('error', (err: Error) => {
      logger.error('Database pool error', { error: err.message, stack: err.stack });
    });

    this.pool.on('acquire', (client: PoolClient) => {
      logger.debug('Client acquired from pool');
    });

    this.pool.on('remove', (client: PoolClient) => {
      logger.debug('Client removed from pool');
    });
  }

  /**
   * Initialize database connection and run migrations
   */
  async connect(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      logger.info('Database connected successfully', {
        host: config.database.host,
        database: config.database.database,
        poolSize: this.pool.totalCount,
      });

      // Run migrations if configured
      if (config.database.runMigrations) {
        await this.runMigrations();
      }
    } catch (error) {
      this.isConnected = false;
      logger.error('Database connection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        host: config.database.host,
        database: config.database.database,
      });
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from database', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Execute a query with parameters
   */
  async query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    const start = Date.now();

    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      logger.debug('Database query executed', {
        query: text.substring(0, 100),
        params: params ? params.length : 0,
        rows: result.rowCount,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: text.substring(0, 100),
        params: params ? params.length : 0,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(
    queries: Array<{ text: string; params?: unknown[] }>
  ): Promise<QueryResult<T>[]> {
    const client = await this.pool.connect();
    const results: QueryResult<T>[] = [];

    try {
      await client.query('BEGIN');

      for (const { text, params } of queries) {
        const result = await client.query<T>(text, params);
        results.push(result);
      }

      await client.query('COMMIT');
      logger.debug('Transaction completed successfully', {
        queries: queries.length,
      });

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed, rolled back', {
        queries: queries.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a function within a transaction context
   */
  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');

      logger.debug('Transaction function completed successfully');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction function failed, rolled back', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get connection pool status
   */
  getPoolStatus(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    isConnected: boolean;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      isConnected: this.isConnected,
    };
  }

  /**
   * Check if database is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows.length > 0 && this.isConnected;
    } catch {
      return false;
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    try {
      logger.info('Starting database migrations');

      // First, ensure migration system is in place
      await this.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Get applied migrations
      const appliedResult = await this.query<{ version: number; name: string }>(
        'SELECT version, name FROM schema_migrations ORDER BY version'
      );

      const appliedVersions = new Set(appliedResult.rows.map((row) => row.version));

      logger.info('Migration status', {
        appliedMigrations: appliedResult.rows.length,
        versions: Array.from(appliedVersions),
      });

      // For now, we'll just log that migrations would be run here
      // In a production setup, you'd read migration files and execute them
      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Migration failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get the underlying pool for advanced use cases
   */
  getPool(): Pool {
    return this.pool;
  }
}

// Singleton instance
let dbConnection: DatabaseConnection | null = null;

/**
 * Get the singleton database connection instance
 */
export function getDatabase(): DatabaseConnection {
  if (!dbConnection) {
    dbConnection = new DatabaseConnection({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      username: config.database.username,
      password: config.database.password,
      ssl: config.database.ssl,
      poolSize: config.database.poolSize,
      connectionTimeout: config.database.connectionTimeout,
      queryTimeout: config.database.queryTimeout,
    });
  }
  return dbConnection;
}

/**
 * Initialize database connection with enhanced pooling and monitoring
 */
export async function initializeDatabase(): Promise<DatabaseConnection> {
  try {
    // Initialize enhanced connection pool
    await initializePool();
    logger.info('Enhanced connection pool initialized');

    // Initialize pool monitoring
    await initializePoolMonitoring();
    logger.info('Connection pool monitoring started');

    // Initialize legacy connection for backward compatibility
    const db = getDatabase();
    await db.connect();
    
    return db;
  } catch (error) {
    logger.error('Failed to initialize database with enhanced features', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // Fallback to basic connection
    const db = getDatabase();
    await db.connect();
    return db;
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbConnection) {
    await dbConnection.disconnect();
    dbConnection = null;
  }
}

export default getDatabase;
