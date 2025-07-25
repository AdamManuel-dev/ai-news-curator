/**
 * @fileoverview Redis health monitoring service
 * 
 * Provides comprehensive health monitoring for Redis connections including
 * connection status, performance metrics, and recovery strategies.
 * 
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import { redisAdapter } from '@adapters/redis';
import logger from '@utils/logger';
import { config } from '@config/index';

// Health status levels
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

// Health check result interface
export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: Date;
  responseTime: number;
  details: {
    connected: boolean;
    latency: number;
    memoryUsage?: {
      used: string;
      peak: string;
      fragmentation: number;
    };
    stats?: {
      totalConnections: number;
      commands: {
        processed: number;
        perSecond: number;
      };
      keyspace: {
        keys: number;
        expires: number;
      };
    };
    errors?: string[];
  };
}

// Performance metrics
export interface RedisMetrics {
  avgLatency: number;
  peakLatency: number;
  totalCommands: number;
  errorRate: number;
  connectionUptime: number;
  lastSuccessfulCheck: Date;
  consecutiveFailures: number;
}

/**
 * Redis health monitoring service
 */
export class RedisHealthService {
  private metrics: RedisMetrics;
  private healthHistory: HealthCheckResult[] = [];
  private maxHistorySize = 100;
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  constructor() {
    this.metrics = {
      avgLatency: 0,
      peakLatency: 0,
      totalCommands: 0,
      errorRate: 0,
      connectionUptime: 0,
      lastSuccessfulCheck: new Date(),
      consecutiveFailures: 0,
    };
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const result: HealthCheckResult = {
      status: HealthStatus.UNKNOWN,
      timestamp: new Date(),
      responseTime: 0,
      details: {
        connected: false,
        latency: 0,
        errors: [],
      },
    };

    try {
      // Test basic connectivity
      const connectivityResult = await this.testConnectivity();
      result.details.connected = connectivityResult.connected;
      result.details.latency = connectivityResult.latency;

      if (!connectivityResult.connected) {
        result.status = HealthStatus.UNHEALTHY;
        result.details.errors = ['Redis connection failed'];
        this.updateMetrics(result, false);
        return result;
      }

      // Test basic operations
      const operationsResult = await this.testBasicOperations();
      if (!operationsResult.success) {
        result.status = HealthStatus.DEGRADED;
        result.details.errors = operationsResult.errors;
        this.updateMetrics(result, false);
        return result;
      }

      // Get Redis server info
      try {
        const serverInfo = await this.getServerInfo();
        result.details.memoryUsage = serverInfo.memoryUsage;
        result.details.stats = serverInfo.stats;
      } catch (error) {
        logger.warn('Failed to get Redis server info', { 
          error: error instanceof Error ? error.message : String(error)
        });
      }

      // Determine final status based on performance
      result.status = this.determineHealthStatus(result.details.latency);
      result.responseTime = Date.now() - startTime;

      this.updateMetrics(result, true);
      this.addToHistory(result);

      return result;
    } catch (error) {
      result.status = HealthStatus.UNHEALTHY;
      result.responseTime = Date.now() - startTime;
      result.details.errors = [error instanceof Error ? error.message : String(error)];
      
      this.updateMetrics(result, false);
      this.addToHistory(result);

      logger.error('Redis health check failed', { 
        error: error instanceof Error ? error.message : String(error)
      });

      return result;
    }
  }

  /**
   * Test basic Redis connectivity
   */
  private async testConnectivity(): Promise<{ connected: boolean; latency: number }> {
    const startTime = Date.now();
    
    try {
      if (!redisAdapter.isConnected) {
        await redisAdapter.connect();
      }

      // Test with PING command
      const client = redisAdapter.getClient();
      await client.ping();

      const latency = Date.now() - startTime;
      return { connected: true, latency };
    } catch (error) {
      logger.error('Redis connectivity test failed', { 
        error: error instanceof Error ? error.message : String(error)
      });
      return { connected: false, latency: Date.now() - startTime };
    }
  }

  /**
   * Test basic Redis operations
   */
  private async testBasicOperations(): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    const testKey = `health_check:${Date.now()}`;
    const testValue = 'health_check_value';

    try {
      // Test SET operation
      await redisAdapter.set(testKey, testValue, 10);

      // Test GET operation
      const retrievedValue = await redisAdapter.get<string>(testKey);
      if (retrievedValue !== testValue) {
        errors.push('GET operation returned incorrect value');
      }

      // Test EXISTS operation
      const exists = await redisAdapter.exists(testKey);
      if (!exists) {
        errors.push('EXISTS operation failed');
      }

      // Test DELETE operation
      await redisAdapter.delete(testKey);

      // Verify deletion
      const existsAfterDelete = await redisAdapter.exists(testKey);
      if (existsAfterDelete) {
        errors.push('DELETE operation failed');
      }

      return { success: errors.length === 0, errors };
    } catch (error) {
      errors.push(`Basic operations failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Cleanup on error
      try {
        await redisAdapter.delete(testKey);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup test key', { testKey, cleanupError });
      }

      return { success: false, errors };
    }
  }

  /**
   * Get Redis server information
   */
  private async getServerInfo(): Promise<{
    memoryUsage: {
      used: string;
      peak: string;
      fragmentation: number;
    };
    stats: {
      totalConnections: number;
      commands: {
        processed: number;
        perSecond: number;
      };
      keyspace: {
        keys: number;
        expires: number;
      };
    };
  }> {
    const client = redisAdapter.getClient();
    const info = await client.info();
    
    // Parse memory information
    const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
    const peakMemoryMatch = info.match(/used_memory_peak_human:([^\r\n]+)/);
    const fragMatch = info.match(/mem_fragmentation_ratio:([^\r\n]+)/);

    // Parse stats information
    const connectionsMatch = info.match(/total_connections_received:([^\r\n]+)/);
    const commandsMatch = info.match(/total_commands_processed:([^\r\n]+)/);
    const commandsPerSecMatch = info.match(/instantaneous_ops_per_sec:([^\r\n]+)/);

    // Get keyspace info
    const dbInfo = await client.info('keyspace');
    const keyspaceMatch = dbInfo.match(/db0:keys=(\d+),expires=(\d+)/);

    return {
      memoryUsage: {
        used: memoryMatch?.[1] || 'unknown',
        peak: peakMemoryMatch?.[1] || 'unknown',
        fragmentation: parseFloat(fragMatch?.[1] || '0'),
      },
      stats: {
        totalConnections: parseInt(connectionsMatch?.[1] || '0', 10),
        commands: {
          processed: parseInt(commandsMatch?.[1] || '0', 10),
          perSecond: parseInt(commandsPerSecMatch?.[1] || '0', 10),
        },
        keyspace: {
          keys: parseInt(keyspaceMatch?.[1] || '0', 10),
          expires: parseInt(keyspaceMatch?.[2] || '0', 10),
        },
      },
    };
  }

  /**
   * Determine health status based on latency and other factors
   */
  private determineHealthStatus(latency: number): HealthStatus {
    // Define latency thresholds (in milliseconds)
    const HEALTHY_THRESHOLD = 10;
    const DEGRADED_THRESHOLD = 50;

    if (latency <= HEALTHY_THRESHOLD) {
      return HealthStatus.HEALTHY;
    } else if (latency <= DEGRADED_THRESHOLD) {
      return HealthStatus.DEGRADED;
    } else {
      return HealthStatus.UNHEALTHY;
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(result: HealthCheckResult, success: boolean): void {
    this.metrics.totalCommands++;

    if (success) {
      this.metrics.consecutiveFailures = 0;
      this.metrics.lastSuccessfulCheck = result.timestamp;
      
      // Update latency metrics
      const latency = result.details.latency;
      this.metrics.avgLatency = (this.metrics.avgLatency + latency) / 2;
      this.metrics.peakLatency = Math.max(this.metrics.peakLatency, latency);
    } else {
      this.metrics.consecutiveFailures++;
    }

    // Calculate error rate
    const recentResults = this.healthHistory.slice(-20); // Last 20 checks
    const failures = recentResults.filter(r => r.status === HealthStatus.UNHEALTHY).length;
    this.metrics.errorRate = recentResults.length > 0 ? (failures / recentResults.length) * 100 : 0;

    // Update connection uptime
    this.metrics.connectionUptime = Date.now() - this.metrics.lastSuccessfulCheck.getTime();
  }

  /**
   * Add result to health history
   */
  private addToHistory(result: HealthCheckResult): void {
    this.healthHistory.push(result);
    
    // Maintain history size
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): RedisMetrics {
    return { ...this.metrics };
  }

  /**
   * Get health history
   */
  getHealthHistory(limit?: number): HealthCheckResult[] {
    const history = [...this.healthHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(intervalMs = 30000): void {
    if (this.isMonitoring) {
      logger.warn('Redis health monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting Redis health monitoring', { intervalMs });

    this.monitoringInterval = setInterval(async () => {
      try {
        const result = await this.performHealthCheck();
        
        if (result.status === HealthStatus.UNHEALTHY) {
          logger.error('Redis health check failed', { result });
        } else if (result.status === HealthStatus.DEGRADED) {
          logger.warn('Redis performance degraded', { result });
        }

        // Trigger recovery if needed
        if (this.metrics.consecutiveFailures >= 3) {
          await this.attemptRecovery();
        }
      } catch (error) {
        logger.error('Health monitoring check failed', { 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, intervalMs);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('Stopped Redis health monitoring');
  }

  /**
   * Attempt Redis connection recovery
   */
  private async attemptRecovery(): Promise<void> {
    logger.info('Attempting Redis connection recovery');

    try {
      // Disconnect and reconnect
      await redisAdapter.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      await redisAdapter.connect();

      logger.info('Redis connection recovery successful');
      this.metrics.consecutiveFailures = 0;
    } catch (error) {
      logger.error('Redis connection recovery failed', { 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get comprehensive health summary
   */
  getHealthSummary(): {
    currentStatus: HealthStatus;
    metrics: RedisMetrics;
    recentTrend: 'improving' | 'stable' | 'degrading';
    recommendations: string[];
  } {
    const recentResults = this.healthHistory.slice(-10);
    const currentStatus = recentResults.length > 0 
      ? recentResults[recentResults.length - 1].status 
      : HealthStatus.UNKNOWN;

    // Determine trend
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (recentResults.length >= 5) {
      const first = recentResults.slice(0, 3);
      const last = recentResults.slice(-3);
      
      const firstHealthy = first.filter(r => r.status === HealthStatus.HEALTHY).length;
      const lastHealthy = last.filter(r => r.status === HealthStatus.HEALTHY).length;
      
      if (lastHealthy > firstHealthy) {
        trend = 'improving';
      } else if (lastHealthy < firstHealthy) {
        trend = 'degrading';
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (this.metrics.errorRate > 20) {
      recommendations.push('High error rate detected - check Redis server health');
    }
    
    if (this.metrics.avgLatency > 20) {
      recommendations.push('High latency detected - consider Redis optimization');
    }
    
    if (this.metrics.consecutiveFailures > 0) {
      recommendations.push('Recent failures detected - monitor connection stability');
    }

    return {
      currentStatus,
      metrics: this.metrics,
      recentTrend: trend,
      recommendations,
    };
  }

  /**
   * Dispose of the health service
   */
  dispose(): void {
    this.stopMonitoring();
    this.healthHistory = [];
  }
}

// Export singleton instance
export const redisHealthService = new RedisHealthService();