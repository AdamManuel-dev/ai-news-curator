/**
 * @fileoverview Database service base class
 * 
 * Extends BaseService with database connectivity, transaction management,
 * query execution, and database health monitoring capabilities.
 */

import { BaseService } from '@services/index';
import { container, DATABASE_SERVICE } from '@container/index';
import type { ServiceConfiguration, HealthCheckResult } from '@types/service';
import type { QueryResult, PoolClient } from 'pg';

export interface DatabaseServiceConfig extends ServiceConfiguration {
  database: {
    queryTimeout?: number;
    connectionPoolSize?: number;
    retryQueries?: boolean;
    slowQueryThreshold?: number;
  };
}

export interface DatabaseConnection {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
  getClient(): Promise<PoolClient>;
  releaseClient(client: PoolClient): void;
}

export abstract class DatabaseService extends BaseService {
  protected db: DatabaseConnection;
  private queryTimeout: number;
  private slowQueryThreshold: number;

  constructor(config?: Partial<DatabaseServiceConfig>) {
    const dbConfig: DatabaseServiceConfig = {
      database: {
        queryTimeout: 30000,
        connectionPoolSize: 10,
        retryQueries: true,
        slowQueryThreshold: 1000,
        ...config?.database,
      },
      ...config,
    };

    super(dbConfig);
    
    this.queryTimeout = dbConfig.database.queryTimeout!;
    this.slowQueryThreshold = dbConfig.database.slowQueryThreshold!;
  }

  protected async onInitialize(): Promise<void> {
    await super.onInitialize();
    
    try {
      // Get database connection from container
      this.db = container.resolve<DatabaseConnection>(DATABASE_SERVICE);
      this.logInfo('Database connection initialized');
      
      // Test database connectivity
      await this.testConnection();
    } catch (error) {
      this.logError('Database initialization failed', error);
      throw error;
    }
  }

  protected async onHealthCheck(): Promise<HealthCheckResult> {
    const baseHealth = await super.onHealthCheck();
    
    try {
      const startTime = Date.now();
      await this.db.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;
      
      this.recordMetric('db.health_check.response_time', responseTime);
      
      return {
        status: baseHealth.status,
        details: {
          ...baseHealth.details,
          database: {
            status: 'connected',
            responseTime,
          },
        },
      };
    } catch (error) {
      this.recordMetric('db.health_check.failure', 1);
      
      return {
        status: 'unhealthy',
        details: {
          ...baseHealth.details,
          database: {
            status: 'disconnected',
            error: error instanceof Error ? error.message : String(error),
          },
        },
      };
    }
  }

  /**
   * Execute a database query with monitoring and error handling
   */
  protected async query<T = any>(
    text: string, 
    params?: any[], 
    options?: { timeout?: number; retryOnFailure?: boolean }
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const timeout = options?.timeout || this.queryTimeout;
    const shouldRetry = options?.retryOnFailure ?? (this.getServiceConfig() as DatabaseServiceConfig).database.retryQueries;

    const executeQuery = async (): Promise<QueryResult<T>> => {
      try {
        this.logDebug('Executing database query', { query: text.substring(0, 100), paramsCount: params?.length });
        
        const result = await this.withTimeout(
          () => this.db.query<T>(text, params),
          timeout
        );
        
        const duration = Date.now() - startTime;
        this.recordMetric('db.query.duration', duration);
        this.recordMetric('db.query.success', 1);
        
        if (duration > this.slowQueryThreshold) {
          this.logWarn('Slow query detected', { 
            query: text.substring(0, 100), 
            duration,
            threshold: this.slowQueryThreshold 
          });
          this.recordMetric('db.query.slow', 1);
        }
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        this.recordMetric('db.query.duration', duration);
        this.recordMetric('db.query.error', 1);
        
        this.logError('Database query failed', error, { 
          query: text.substring(0, 100), 
          duration,
          paramsCount: params?.length 
        });
        
        throw error;
      }
    };

    if (shouldRetry) {
      return this.withRetry(executeQuery, 3, 1000);
    } else {
      return executeQuery();
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  protected async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      this.logDebug('Starting database transaction');
      
      const result = await this.db.withTransaction(async (client) => {
        return callback(client);
      });
      
      const duration = Date.now() - startTime;
      this.recordMetric('db.transaction.duration', duration);
      this.recordMetric('db.transaction.success', 1);
      
      this.logDebug('Database transaction completed', { duration });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordMetric('db.transaction.duration', duration);
      this.recordMetric('db.transaction.error', 1);
      
      this.logError('Database transaction failed', error, { duration });
      throw error;
    }
  }

  /**
   * Execute a query within a transaction client
   */
  protected async queryInTransaction<T = any>(
    client: PoolClient,
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    
    try {
      this.logDebug('Executing query in transaction', { query: text.substring(0, 100) });
      
      const result = await client.query<T>(text, params);
      
      const duration = Date.now() - startTime;
      this.recordMetric('db.transaction_query.duration', duration);
      this.recordMetric('db.transaction_query.success', 1);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordMetric('db.transaction_query.duration', duration);
      this.recordMetric('db.transaction_query.error', 1);
      
      this.logError('Transaction query failed', error, { 
        query: text.substring(0, 100),
        duration 
      });
      
      throw error;
    }
  }

  /**
   * Check if a table exists
   */
  protected async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        ) as exists`,
        [tableName]
      );
      
      return result.rows[0]?.exists === true;
    } catch (error) {
      this.logError('Error checking table existence', error, { tableName });
      return false;
    }
  }

  /**
   * Get database connection info
   */
  protected async getConnectionInfo(): Promise<{
    version: string;
    activeConnections: number;
    maxConnections: number;
  }> {
    try {
      const [versionResult, connectionResult] = await Promise.all([
        this.query('SELECT version() as version'),
        this.query(`
          SELECT 
            count(*) as active_connections,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
          FROM pg_stat_activity 
          WHERE state = 'active'
        `)
      ]);

      return {
        version: versionResult.rows[0]?.version || 'unknown',
        activeConnections: parseInt(connectionResult.rows[0]?.active_connections || '0'),
        maxConnections: parseInt(connectionResult.rows[0]?.max_connections || '0'),
      };
    } catch (error) {
      this.logError('Failed to get connection info', error);
      throw error;
    }
  }

  /**
   * Execute query with pagination
   */
  protected async queryWithPagination<T = any>(
    baseQuery: string,
    params: any[] = [],
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    rows: T[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_query`;
    const countResult = await this.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0]?.total || '0');
    
    // Get paginated results
    const paginatedQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await this.query<T>(paginatedQuery, [...params, pageSize, offset]);
    
    return {
      rows: result.rows,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    try {
      await this.query('SELECT 1');
      this.logInfo('Database connection test successful');
    } catch (error) {
      this.logError('Database connection test failed', error);
      throw new Error('Database connection failed');
    }
  }

  /**
   * Get database performance metrics
   */
  protected async getPerformanceMetrics(): Promise<{
    slowQueries: number;
    activeConnections: number;
    cacheHitRatio: number;
    avgQueryTime: number;
  }> {
    try {
      const result = await this.query(`
        SELECT 
          (SELECT count(*) FROM pg_stat_statements WHERE mean_time > $1) as slow_queries,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
          (SELECT ROUND(
            100 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read) + 1), 2
          ) FROM pg_statio_user_tables) as cache_hit_ratio,
          (SELECT ROUND(avg(mean_time), 2) FROM pg_stat_statements) as avg_query_time
      `, [this.slowQueryThreshold]);

      const metrics = result.rows[0] || {};
      
      return {
        slowQueries: parseInt(metrics.slow_queries || '0'),
        activeConnections: parseInt(metrics.active_connections || '0'),
        cacheHitRatio: parseFloat(metrics.cache_hit_ratio || '0'),
        avgQueryTime: parseFloat(metrics.avg_query_time || '0'),
      };
    } catch (error) {
      this.logWarn('Failed to get performance metrics', { error });
      return {
        slowQueries: 0,
        activeConnections: 0,
        cacheHitRatio: 0,
        avgQueryTime: 0,
      };
    }
  }
}