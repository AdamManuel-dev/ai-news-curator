/**
 * @fileoverview Enhanced database connection pool with advanced monitoring and health management
 * @lastmodified 2025-07-27T18:58:00Z
 * 
 * Features: Connection pooling, health monitoring, auto-recovery, metrics, circuit breaker pattern
 * Main APIs: EnhancedConnectionPool, PoolMetrics, ConnectionHealthMonitor
 * Constraints: Requires PostgreSQL, Redis for metrics, configurable pool settings
 * Patterns: Singleton pool, circuit breaker, exponential backoff, comprehensive monitoring
 */

import { Pool, PoolClient, QueryResult, PoolConfig } from 'pg';
import { EventEmitter } from 'events';
import { config } from '@config/index';
import logger from '@utils/logger';
import { DatabaseConfig } from '@types/database';

export interface PoolMetrics {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
  totalQueries: number;
  failedQueries: number;
  averageQueryTime: number;
  connectionErrors: number;
  lastHealthCheck: Date;
  uptimeSeconds: number;
  poolStatus: 'healthy' | 'degraded' | 'unhealthy';
}

export interface ConnectionPoolOptions extends DatabaseConfig {
  minConnections?: number;
  maxConnections?: number;
  acquireTimeoutMillis?: number;
  createTimeoutMillis?: number;
  destroyTimeoutMillis?: number;
  reapIntervalMillis?: number;
  createRetryIntervalMillis?: number;
  healthCheckIntervalMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeoutMs?: number;
  enableAutoRecovery?: boolean;
  monitoringEnabled?: boolean;
}

export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Enhanced database connection pool with advanced monitoring and health management
 */
export class EnhancedConnectionPool extends EventEmitter {
  private pool: Pool;
  private metrics: PoolMetrics;
  private queryHistory: QueryMetrics[] = [];
  private healthCheckTimer?: NodeJS.Timeout;
  private isCircuitOpen = false;
  private circuitBreakerTimer?: NodeJS.Timeout;
  private startTime = new Date();
  private options: ConnectionPoolOptions;

  constructor(options: ConnectionPoolOptions) {
    super();
    this.options = {
      minConnections: 2,
      maxConnections: 20,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 3000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      healthCheckIntervalMs: 30000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeoutMs: 60000,
      enableAutoRecovery: true,
      monitoringEnabled: true,
      connectionTimeout: 5000,
      queryTimeout: 30000,
      ...options,
    };

    this.initializePool();
    this.initializeMetrics();
    this.setupEventHandlers();

    if (this.options.monitoringEnabled) {
      this.startHealthMonitoring();
    }
  }

  private initializePool(): void {
    const poolConfig: PoolConfig = {
      host: this.options.host,
      port: this.options.port,
      database: this.options.database,
      user: this.options.username,
      password: this.options.password,
      ssl: this.options.ssl ? { rejectUnauthorized: false } : false,
      
      // Pool configuration
      min: this.options.minConnections,
      max: this.options.maxConnections,
      
      // Timing configuration
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: this.options.connectionTimeout ?? 5000,
      query_timeout: this.options.queryTimeout ?? 30000,
      statement_timeout: this.options.queryTimeout ?? 30000,
      
      // Advanced pool settings
      acquireTimeoutMillis: this.options.acquireTimeoutMillis ?? 60000,
      createTimeoutMillis: this.options.createTimeoutMillis ?? 3000,
      destroyTimeoutMillis: this.options.destroyTimeoutMillis ?? 5000,
      reapIntervalMillis: this.options.reapIntervalMillis ?? 1000,
      createRetryIntervalMillis: this.options.createRetryIntervalMillis ?? 200,
      
      // Application name for connection tracking
      application_name: 'ai-news-curator',
    };

    this.pool = new Pool(poolConfig);
  }

  private initializeMetrics(): void {
    this.metrics = {
      totalConnections: 0,
      idleConnections: 0,
      activeConnections: 0,
      waitingClients: 0,
      totalQueries: 0,
      failedQueries: 0,
      averageQueryTime: 0,
      connectionErrors: 0,
      lastHealthCheck: new Date(),
      uptimeSeconds: 0,
      poolStatus: 'healthy',
    };
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', (client: PoolClient) => {
      logger.debug('Database client connected', {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
      });
      this.emit('clientConnected', client);
    });

    this.pool.on('acquire', (client: PoolClient) => {
      logger.debug('Database client acquired from pool');
      this.emit('clientAcquired', client);
    });

    this.pool.on('remove', (client: PoolClient) => {
      logger.debug('Database client removed from pool');
      this.emit('clientRemoved', client);
    });

    this.pool.on('error', (err: Error, client?: PoolClient) => {
      this.metrics.connectionErrors++;
      logger.error('Database pool error', { 
        error: err.message, 
        stack: err.stack,
        clientExists: !!client,
      });
      
      this.emit('poolError', err, client);
      this.handleConnectionError(err);
    });
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const start = Date.now();
      const result = await this.pool.query('SELECT 1 as health, NOW() as timestamp');
      const duration = Date.now() - start;

      if (result.rows.length > 0) {
        this.metrics.poolStatus = 'healthy';
        this.metrics.lastHealthCheck = new Date();
        
        if (this.isCircuitOpen) {
          this.closeCircuitBreaker();
        }
        
        logger.debug('Database health check passed', { duration });
        this.emit('healthCheckPassed', { duration, timestamp: new Date() });
      } else {
        throw new Error('Health check returned no rows');
      }
    } catch (error) {
      this.metrics.poolStatus = 'unhealthy';
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      this.emit('healthCheckFailed', error);
      this.handleConnectionError(error as Error);
    }
  }

  private handleConnectionError(error: Error): void {
    if (this.metrics.connectionErrors >= (this.options.circuitBreakerThreshold || 5)) {
      this.openCircuitBreaker();
    }
  }

  private openCircuitBreaker(): void {
    if (this.isCircuitOpen) return;

    this.isCircuitOpen = true;
    this.metrics.poolStatus = 'degraded';
    
    logger.warn('Circuit breaker opened due to connection errors', {
      errorCount: this.metrics.connectionErrors,
      threshold: this.options.circuitBreakerThreshold,
    });

    this.emit('circuitBreakerOpened');

    // Auto-recovery timer
    if (this.options.enableAutoRecovery) {
      this.circuitBreakerTimer = setTimeout(() => {
        this.attemptRecovery();
      }, this.options.circuitBreakerTimeoutMs);
    }
  }

  private closeCircuitBreaker(): void {
    if (!this.isCircuitOpen) return;

    this.isCircuitOpen = false;
    this.metrics.connectionErrors = 0;
    
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = undefined;
    }

    logger.info('Circuit breaker closed - pool recovered');
    this.emit('circuitBreakerClosed');
  }

  private async attemptRecovery(): Promise<void> {
    logger.info('Attempting database pool recovery');
    
    try {
      await this.performHealthCheck();
      logger.info('Database pool recovery successful');
    } catch (error) {
      logger.error('Database pool recovery failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Retry recovery after delay
      if (this.options.enableAutoRecovery) {
        this.circuitBreakerTimer = setTimeout(() => {
          this.attemptRecovery();
        }, this.options.circuitBreakerTimeoutMs);
      }
    }
  }

  /**
   * Execute a query with enhanced monitoring and circuit breaker protection
   */
  async query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (this.isCircuitOpen) {
      throw new Error('Database circuit breaker is open - service temporarily unavailable');
    }

    const start = Date.now();
    let success = false;

    try {
      const result = await this.pool.query<T>(text, params);
      success = true;
      
      const duration = Date.now() - start;
      this.updateQueryMetrics(text, duration, true);

      logger.debug('Database query executed', {
        query: text.substring(0, 100),
        params: params ? params.length : 0,
        rows: result.rowCount,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.updateQueryMetrics(text, duration, false, error as Error);
      
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
   * Execute queries within a transaction with enhanced error handling
   */
  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (this.isCircuitOpen) {
      throw new Error('Database circuit breaker is open - service temporarily unavailable');
    }

    const client = await this.pool.connect();
    const start = Date.now();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      
      const duration = Date.now() - start;
      logger.debug('Transaction completed successfully', { duration });
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      
      const duration = Date.now() - start;
      logger.error('Transaction failed and rolled back', {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a client from the pool for advanced operations
   */
  async getClient(): Promise<PoolClient> {
    if (this.isCircuitOpen) {
      throw new Error('Database circuit breaker is open - service temporarily unavailable');
    }

    return this.pool.connect();
  }

  private updateQueryMetrics(query: string, duration: number, success: boolean, error?: Error): void {
    this.metrics.totalQueries++;
    
    if (!success) {
      this.metrics.failedQueries++;
    }

    // Update average query time
    const totalTime = this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + duration;
    this.metrics.averageQueryTime = totalTime / this.metrics.totalQueries;

    // Store query history (keep last 1000 queries)
    const queryMetric: QueryMetrics = {
      query: query.substring(0, 200),
      duration,
      timestamp: new Date(),
      success,
      error: error?.message,
    };

    this.queryHistory.push(queryMetric);
    if (this.queryHistory.length > 1000) {
      this.queryHistory.shift();
    }
  }

  /**
   * Get comprehensive pool metrics
   */
  getMetrics(): PoolMetrics {
    const now = new Date();
    
    return {
      ...this.metrics,
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
      uptimeSeconds: Math.floor((now.getTime() - this.startTime.getTime()) / 1000),
    };
  }

  /**
   * Get recent query history for analysis
   */
  getQueryHistory(limit = 100): QueryMetrics[] {
    return this.queryHistory.slice(-limit);
  }

  /**
   * Get slow queries (above threshold)
   */
  getSlowQueries(thresholdMs = 1000, limit = 50): QueryMetrics[] {
    return this.queryHistory
      .filter(q => q.duration > thresholdMs)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get failed queries
   */
  getFailedQueries(limit = 50): QueryMetrics[] {
    return this.queryHistory
      .filter(q => !q.success)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Force pool health check
   */
  async checkHealth(): Promise<boolean> {
    try {
      await this.performHealthCheck();
      return this.metrics.poolStatus === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker(): void {
    this.closeCircuitBreaker();
    logger.info('Circuit breaker manually reset');
  }

  /**
   * Gracefully close the connection pool
   */
  async close(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
    }

    try {
      await this.pool.end();
      logger.info('Database connection pool closed gracefully');
      this.emit('poolClosed');
    } catch (error) {
      logger.error('Error closing database pool', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get the underlying pool for direct access (use carefully)
   */
  getUnderlyingPool(): Pool {
    return this.pool;
  }
}

// Singleton instance management
let poolInstance: EnhancedConnectionPool | null = null;

/**
 * Get the singleton enhanced connection pool instance
 */
export function getConnectionPool(): EnhancedConnectionPool {
  if (!poolInstance) {
    poolInstance = new EnhancedConnectionPool({
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
  return poolInstance;
}

/**
 * Initialize the enhanced connection pool
 */
export async function initializePool(): Promise<EnhancedConnectionPool> {
  const pool = getConnectionPool();
  await pool.checkHealth();
  
  logger.info('Enhanced database connection pool initialized', {
    poolStatus: pool.getMetrics().poolStatus,
  });
  
  return pool;
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.close();
    poolInstance = null;
  }
}