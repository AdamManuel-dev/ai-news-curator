/**
 * @fileoverview Database connection pool monitoring and alerting service
 * @lastmodified 2025-07-27T18:58:00Z
 * 
 * Features: Real-time monitoring, alerting, metrics collection, dashboard data
 * Main APIs: PoolMonitor, MonitoringAlert, PoolDashboard
 * Constraints: Requires Redis for metrics storage, configured thresholds
 * Patterns: Observer pattern, threshold-based alerts, metrics aggregation
 */

import { EventEmitter } from 'events';
import { getConnectionPool, PoolMetrics, QueryMetrics } from './connection-pool';
import logger from '@utils/logger';
import { createClient, RedisClientType } from 'redis';
import { config } from '@config/index';

export interface MonitoringAlert {
  id: string;
  type: 'connection_shortage' | 'high_latency' | 'error_rate' | 'circuit_breaker' | 'health_check_failed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metrics?: Record<string, unknown>;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface PoolThresholds {
  maxConnectionUtilization: number;  // 0-1
  maxAverageQueryTime: number;       // milliseconds
  maxErrorRate: number;              // 0-1
  maxWaitingClients: number;
  minHealthCheckSuccess: number;     // 0-1 (last 10 checks)
}

export interface MonitoringConfig {
  enabled: boolean;
  checkIntervalMs: number;
  alertRetentionHours: number;
  metricsRetentionHours: number;
  thresholds: PoolThresholds;
  redisKeyPrefix: string;
}

export interface PoolDashboard {
  currentMetrics: PoolMetrics;
  alerts: MonitoringAlert[];
  trends: {
    queryTimes: Array<{ timestamp: Date; value: number }>;
    connectionUtilization: Array<{ timestamp: Date; value: number }>;
    errorRates: Array<{ timestamp: Date; value: number }>;
  };
  slowQueries: QueryMetrics[];
  failedQueries: QueryMetrics[];
  recommendations: string[];
}

/**
 * Database connection pool monitoring service
 */
export class PoolMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private redisClient: RedisClientType;
  private monitoringTimer?: NodeJS.Timeout;
  private alertHistory: MonitoringAlert[] = [];
  private lastHealthChecks: boolean[] = [];
  private isRunning = false;

  constructor(config?: Partial<MonitoringConfig>) {
    super();
    
    this.config = {
      enabled: true,
      checkIntervalMs: 30000, // 30 seconds
      alertRetentionHours: 24,
      metricsRetentionHours: 168, // 7 days
      thresholds: {
        maxConnectionUtilization: 0.8,
        maxAverageQueryTime: 1000,
        maxErrorRate: 0.05,
        maxWaitingClients: 10,
        minHealthCheckSuccess: 0.8,
      },
      redisKeyPrefix: 'pool_monitor',
      ...config,
    };

    this.redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
      database: config.redis.db,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    const pool = getConnectionPool();
    
    pool.on('circuitBreakerOpened', () => {
      this.createAlert({
        type: 'circuit_breaker',
        severity: 'critical',
        message: 'Database circuit breaker has opened due to connection failures',
      });
    });

    pool.on('circuitBreakerClosed', () => {
      this.resolveAlerts('circuit_breaker');
    });

    pool.on('healthCheckFailed', (error: Error) => {
      this.lastHealthChecks.push(false);
      this.limitArray(this.lastHealthChecks, 10);
      
      this.createAlert({
        type: 'health_check_failed',
        severity: 'high',
        message: `Database health check failed: ${error.message}`,
        metrics: { error: error.message },
      });
    });

    pool.on('healthCheckPassed', () => {
      this.lastHealthChecks.push(true);
      this.limitArray(this.lastHealthChecks, 10);
      this.resolveAlerts('health_check_failed');
    });
  }

  /**
   * Start monitoring the connection pool
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Pool monitor is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Pool monitoring is disabled');
      return;
    }

    try {
      await this.redisClient.connect();
      logger.info('Pool monitor Redis client connected');
    } catch (error) {
      logger.error('Failed to connect to Redis for pool monitoring', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue without Redis (alerts will be in-memory only)
    }

    this.isRunning = true;
    this.startMonitoring();
    
    logger.info('Database pool monitoring started', {
      checkInterval: this.config.checkIntervalMs,
      thresholds: this.config.thresholds,
    });
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    try {
      await this.redisClient.quit();
    } catch (error) {
      logger.error('Error disconnecting from Redis', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    logger.info('Database pool monitoring stopped');
  }

  private startMonitoring(): void {
    this.monitoringTimer = setInterval(async () => {
      await this.performMonitoringCheck();
    }, this.config.checkIntervalMs);

    // Initial check
    setImmediate(() => this.performMonitoringCheck());
  }

  private async performMonitoringCheck(): Promise<void> {
    try {
      const pool = getConnectionPool();
      const metrics = pool.getMetrics();
      
      // Store metrics for trending
      await this.storeMetrics(metrics);
      
      // Check thresholds and create alerts
      await this.checkThresholds(metrics);
      
      // Clean up old data
      await this.cleanupOldData();
      
    } catch (error) {
      logger.error('Error during pool monitoring check', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async storeMetrics(metrics: PoolMetrics): Promise<void> {
    if (!this.redisClient.isOpen) return;

    const timestamp = Date.now();
    const key = `${this.config.redisKeyPrefix}:metrics`;
    
    try {
      await this.redisClient.zAdd(key, [
        {
          score: timestamp,
          value: JSON.stringify({
            timestamp,
            totalConnections: metrics.totalConnections,
            activeConnections: metrics.activeConnections,
            idleConnections: metrics.idleConnections,
            waitingClients: metrics.waitingClients,
            averageQueryTime: metrics.averageQueryTime,
            totalQueries: metrics.totalQueries,
            failedQueries: metrics.failedQueries,
            poolStatus: metrics.poolStatus,
          }),
        },
      ]);

      // Set expiration for automatic cleanup
      await this.redisClient.expire(key, this.config.metricsRetentionHours * 3600);
    } catch (error) {
      logger.error('Failed to store pool metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async checkThresholds(metrics: PoolMetrics): Promise<void> {
    const thresholds = this.config.thresholds;
    
    // Check connection utilization
    const connectionUtilization = metrics.activeConnections / metrics.totalConnections;
    if (connectionUtilization > thresholds.maxConnectionUtilization) {
      this.createAlert({
        type: 'connection_shortage',
        severity: connectionUtilization > 0.95 ? 'critical' : 'high',
        message: `High connection utilization: ${(connectionUtilization * 100).toFixed(1)}%`,
        metrics: { connectionUtilization, activeConnections: metrics.activeConnections, totalConnections: metrics.totalConnections },
      });
    }

    // Check average query time
    if (metrics.averageQueryTime > thresholds.maxAverageQueryTime) {
      this.createAlert({
        type: 'high_latency',
        severity: metrics.averageQueryTime > thresholds.maxAverageQueryTime * 2 ? 'high' : 'medium',
        message: `High average query time: ${metrics.averageQueryTime.toFixed(2)}ms`,
        metrics: { averageQueryTime: metrics.averageQueryTime },
      });
    }

    // Check error rate
    const errorRate = metrics.totalQueries > 0 ? metrics.failedQueries / metrics.totalQueries : 0;
    if (errorRate > thresholds.maxErrorRate) {
      this.createAlert({
        type: 'error_rate',
        severity: errorRate > thresholds.maxErrorRate * 2 ? 'high' : 'medium',
        message: `High query error rate: ${(errorRate * 100).toFixed(2)}%`,
        metrics: { errorRate, failedQueries: metrics.failedQueries, totalQueries: metrics.totalQueries },
      });
    }

    // Check waiting clients
    if (metrics.waitingClients > thresholds.maxWaitingClients) {
      this.createAlert({
        type: 'connection_shortage',
        severity: metrics.waitingClients > thresholds.maxWaitingClients * 2 ? 'high' : 'medium',
        message: `High number of waiting clients: ${metrics.waitingClients}`,
        metrics: { waitingClients: metrics.waitingClients },
      });
    }

    // Check health check success rate
    if (this.lastHealthChecks.length >= 5) {
      const successRate = this.lastHealthChecks.filter(Boolean).length / this.lastHealthChecks.length;
      if (successRate < thresholds.minHealthCheckSuccess) {
        this.createAlert({
          type: 'health_check_failed',
          severity: successRate < 0.5 ? 'critical' : 'high',
          message: `Low health check success rate: ${(successRate * 100).toFixed(1)}%`,
          metrics: { successRate, checksCount: this.lastHealthChecks.length },
        });
      }
    }
  }

  private createAlert(alert: Omit<MonitoringAlert, 'id' | 'timestamp'>): void {
    const newAlert: MonitoringAlert = {
      id: `${alert.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
      ...alert,
    };

    this.alertHistory.push(newAlert);
    this.limitArray(this.alertHistory, 1000);

    logger.warn('Pool monitoring alert created', {
      alertId: newAlert.id,
      type: newAlert.type,
      severity: newAlert.severity,
      message: newAlert.message,
    });

    this.emit('alert', newAlert);
    
    // Store alert in Redis
    this.storeAlert(newAlert);
  }

  private resolveAlerts(type: MonitoringAlert['type']): void {
    const unresolvedAlerts = this.alertHistory.filter(a => a.type === type && !a.resolved);
    
    for (const alert of unresolvedAlerts) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      logger.info('Pool monitoring alert resolved', {
        alertId: alert.id,
        type: alert.type,
      });
      
      this.emit('alertResolved', alert);
      this.storeAlert(alert);
    }
  }

  private async storeAlert(alert: MonitoringAlert): Promise<void> {
    if (!this.redisClient.isOpen) return;

    const key = `${this.config.redisKeyPrefix}:alerts`;
    
    try {
      await this.redisClient.zAdd(key, [
        {
          score: alert.timestamp.getTime(),
          value: JSON.stringify(alert),
        },
      ]);

      await this.redisClient.expire(key, this.config.alertRetentionHours * 3600);
    } catch (error) {
      logger.error('Failed to store alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async cleanupOldData(): Promise<void> {
    if (!this.redisClient.isOpen) return;

    const cutoff = Date.now() - (this.config.metricsRetentionHours * 3600 * 1000);
    
    try {
      // Clean up old metrics
      await this.redisClient.zRemRangeByScore(`${this.config.redisKeyPrefix}:metrics`, 0, cutoff);
      
      // Clean up old alerts
      const alertCutoff = Date.now() - (this.config.alertRetentionHours * 3600 * 1000);
      await this.redisClient.zRemRangeByScore(`${this.config.redisKeyPrefix}:alerts`, 0, alertCutoff);
      
    } catch (error) {
      logger.error('Failed to cleanup old monitoring data', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get dashboard data for monitoring UI
   */
  async getDashboard(): Promise<PoolDashboard> {
    const pool = getConnectionPool();
    const currentMetrics = pool.getMetrics();
    
    const alerts = await this.getRecentAlerts();
    const trends = await this.getTrends();
    const slowQueries = pool.getSlowQueries(500, 20);
    const failedQueries = pool.getFailedQueries(20);
    const recommendations = this.generateRecommendations(currentMetrics, alerts);

    return {
      currentMetrics,
      alerts,
      trends,
      slowQueries,
      failedQueries,
      recommendations,
    };
  }

  private async getRecentAlerts(hours = 24): Promise<MonitoringAlert[]> {
    if (!this.redisClient.isOpen) {
      return this.alertHistory.filter(a => 
        a.timestamp.getTime() > Date.now() - (hours * 3600 * 1000)
      );
    }

    try {
      const cutoff = Date.now() - (hours * 3600 * 1000);
      const alertData = await this.redisClient.zRangeByScore(
        `${this.config.redisKeyPrefix}:alerts`,
        cutoff,
        '+inf'
      );

      return alertData.map(data => JSON.parse(data) as MonitoringAlert);
    } catch (error) {
      logger.error('Failed to get recent alerts', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  private async getTrends(): Promise<PoolDashboard['trends']> {
    if (!this.redisClient.isOpen) {
      return {
        queryTimes: [],
        connectionUtilization: [],
        errorRates: [],
      };
    }

    try {
      const last24Hours = Date.now() - (24 * 3600 * 1000);
      const metricsData = await this.redisClient.zRangeByScore(
        `${this.config.redisKeyPrefix}:metrics`,
        last24Hours,
        '+inf'
      );

      const metrics = metricsData.map(data => JSON.parse(data));
      
      return {
        queryTimes: metrics.map(m => ({
          timestamp: new Date(m.timestamp),
          value: m.averageQueryTime,
        })),
        connectionUtilization: metrics.map(m => ({
          timestamp: new Date(m.timestamp),
          value: m.totalConnections > 0 ? m.activeConnections / m.totalConnections : 0,
        })),
        errorRates: metrics.map(m => ({
          timestamp: new Date(m.timestamp),
          value: m.totalQueries > 0 ? m.failedQueries / m.totalQueries : 0,
        })),
      };
    } catch (error) {
      logger.error('Failed to get trends', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        queryTimes: [],
        connectionUtilization: [],
        errorRates: [],
      };
    }
  }

  private generateRecommendations(metrics: PoolMetrics, alerts: MonitoringAlert[]): string[] {
    const recommendations: string[] = [];
    
    const connectionUtilization = metrics.activeConnections / metrics.totalConnections;
    if (connectionUtilization > 0.8) {
      recommendations.push('Consider increasing the maximum pool size to handle high connection demand');
    }
    
    if (metrics.averageQueryTime > 1000) {
      recommendations.push('Review slow queries and consider adding database indexes or query optimization');
    }
    
    const errorRate = metrics.totalQueries > 0 ? metrics.failedQueries / metrics.totalQueries : 0;
    if (errorRate > 0.05) {
      recommendations.push('Investigate query failures and consider implementing retry logic');
    }
    
    if (metrics.waitingClients > 5) {
      recommendations.push('High number of waiting clients suggests need for connection pool tuning');
    }
    
    const recentCriticalAlerts = alerts.filter(a => 
      a.severity === 'critical' && 
      !a.resolved &&
      a.timestamp.getTime() > Date.now() - (3600 * 1000)
    );
    
    if (recentCriticalAlerts.length > 0) {
      recommendations.push('Address critical alerts immediately to prevent service degradation');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Database pool is operating within normal parameters');
    }
    
    return recommendations;
  }

  private limitArray<T>(array: T[], maxLength: number): void {
    while (array.length > maxLength) {
      array.shift();
    }
  }

  /**
   * Get current alerts
   */
  getActiveAlerts(): MonitoringAlert[] {
    return this.alertHistory.filter(a => !a.resolved);
  }

  /**
   * Manually resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.storeAlert(alert);
      return true;
    }
    return false;
  }
}

// Singleton instance
let monitorInstance: PoolMonitor | null = null;

/**
 * Get the singleton pool monitor instance
 */
export function getPoolMonitor(): PoolMonitor {
  if (!monitorInstance) {
    monitorInstance = new PoolMonitor();
  }
  return monitorInstance;
}

/**
 * Initialize pool monitoring
 */
export async function initializePoolMonitoring(): Promise<PoolMonitor> {
  const monitor = getPoolMonitor();
  await monitor.start();
  return monitor;
}

/**
 * Stop pool monitoring
 */
export async function stopPoolMonitoring(): Promise<void> {
  if (monitorInstance) {
    await monitorInstance.stop();
  }
}