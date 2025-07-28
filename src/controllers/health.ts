/**
 * @fileoverview Health check controller for system monitoring and diagnostics
 * @lastmodified 2025-07-28T01:43:24Z
 * 
 * Features: Redis health, vector DB health, memory monitoring, disk checks, dependency status
 * Main APIs: HealthController class, getHealthStatus(), getDetailedHealthStatus()
 * Constraints: Requires Redis, Pinecone vector DB, EnhancedBaseController
 * Patterns: Dependency injection, comprehensive health checks, status aggregation
 */

import { Request, Response } from 'express';
import { Injectable } from '@container/Container';
import { EnhancedBaseController } from '@controllers/enhanced-base';
import { container, REDIS_ADAPTER, CONFIG, REDIS_HEALTH_SERVICE, VECTOR_DB } from '@container/index';
import type { CacheAdapter } from '@adapters/redis';
import type { RedisHealthService } from '@services/redis-health';
import type { PineconeService } from '@services/vectordb';
import type { AppConfig } from '@config/index';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  dependencies: {
    redis: {
      status: 'connected' | 'disconnected' | 'error';
      latency?: number;
      error?: string;
    };
    vectordb: {
      status: 'connected' | 'disconnected' | 'error';
      indexName?: string;
      error?: string;
    };
    memory: {
      used: number;
      free: number;
      total: number;
      percentage: number;
    };
    disk?: {
      used: number;
      free: number;
      total: number;
      percentage: number;
    };
  };
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    details?: string;
    responseTime?: number;
  }>;
}

@Injectable
export class HealthController extends EnhancedBaseController {
  private redisAdapter: CacheAdapter;
  private redisHealthService: RedisHealthService;
  private vectorDbService: PineconeService;
  private config: AppConfig;

  constructor() {
    super();
    this.redisAdapter = container.resolve<CacheAdapter>(REDIS_ADAPTER);
    this.redisHealthService = container.resolve<RedisHealthService>(REDIS_HEALTH_SERVICE);
    this.vectorDbService = container.resolve<PineconeService>(VECTOR_DB);
    this.config = container.resolve<AppConfig>(CONFIG);
  }

  async getHealthStatus(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, async () => {
      const startTime = Date.now();
      const healthStatus = await this.performHealthChecks();
      const responseTime = Date.now() - startTime;

      this.logger.debug('Health check completed', {
        status: healthStatus.status,
        responseTime,
        requestId: req.requestId,
      });

      // Set appropriate HTTP status code based on health
      const statusCode = this.getHttpStatusCode(healthStatus.status);
      res.status(statusCode);

      return healthStatus;
    });
  }

  async getDetailedHealthStatus(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, async () => {
      const startTime = Date.now();
      const healthStatus = await this.performDetailedHealthChecks();
      const responseTime = Date.now() - startTime;

      this.logger.debug('Detailed health check completed', {
        status: healthStatus.status,
        responseTime,
        requestId: req.requestId,
      });

      const statusCode = this.getHttpStatusCode(healthStatus.status);
      res.status(statusCode);

      return healthStatus;
    });
  }

  private async performHealthChecks(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = [];
    const dependencies: HealthStatus['dependencies'] = {
      redis: { status: 'disconnected' },
      vectordb: { status: 'disconnected' },
      memory: this.getMemoryInfo(),
    };

    // Check Redis connection
    const redisCheck = await this.checkRedisHealth();
    dependencies.redis = redisCheck.redis;
    checks.push(redisCheck.check);

    // Check Vector Database connection
    const vectorDbCheck = await this.checkVectorDbHealth();
    dependencies.vectordb = vectorDbCheck.vectordb;
    checks.push(vectorDbCheck.check);

    // Check memory usage
    const memoryCheck = this.checkMemoryHealth();
    checks.push(memoryCheck);

    // Determine overall health status
    const overallStatus = this.determineOverallStatus(checks);

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      environment: this.config.nodeEnv,
      dependencies,
      checks,
    };

    return healthStatus;
  }

  private async performDetailedHealthChecks(): Promise<HealthStatus> {
    const basicHealth = await this.performHealthChecks();

    // Add disk usage if available
    try {
      const diskInfo = await this.getDiskInfo();
      if (diskInfo) {
        basicHealth.dependencies.disk = diskInfo;
        const diskCheck = this.checkDiskHealth(diskInfo);
        basicHealth.checks.push(diskCheck);
      }
    } catch (error) {
      this.logger.warn('Could not retrieve disk information', { error });
    }

    // Re-evaluate overall status with additional checks
    basicHealth.status = this.determineOverallStatus(basicHealth.checks);

    return basicHealth;
  }

  private async checkRedisHealth(): Promise<{
    redis: HealthStatus['dependencies']['redis'];
    check: HealthStatus['checks'][0];
  }> {
    try {
      const healthResult = await this.redisHealthService.performHealthCheck();
      
      const redisStatus = healthResult.details.connected ? 'connected' : 
                         healthResult.status === 'degraded' ? 'error' : 'disconnected';
      
      const checkStatus = healthResult.status === 'healthy' ? 'pass' :
                         healthResult.status === 'degraded' ? 'warn' : 'fail';

      return {
        redis: {
          status: redisStatus,
          latency: healthResult.details.latency,
          error: healthResult.details.errors?.join(', '),
        },
        check: {
          name: 'redis',
          status: checkStatus,
          details: `Redis health: ${healthResult.status} (${healthResult.details.latency}ms)`,
          responseTime: healthResult.responseTime,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        redis: {
          status: 'error',
          error: errorMessage,
        },
        check: {
          name: 'redis',
          status: 'fail',
          details: `Health check failed: ${errorMessage}`,
        },
      };
    }
  }

  private async checkVectorDbHealth(): Promise<{
    vectordb: HealthStatus['dependencies']['vectordb'];
    check: HealthStatus['checks'][0];
  }> {
    try {
      const startTime = Date.now();
      const isHealthy = await this.vectorDbService.healthCheck();
      const responseTime = Date.now() - startTime;
      
      const status = isHealthy ? 'connected' : 'error';
      const checkStatus = isHealthy ? 'pass' : 'fail';

      return {
        vectordb: {
          status,
          indexName: this.vectorDbService.getIndexName(),
        },
        check: {
          name: 'vectordb',
          status: checkStatus,
          details: `Vector database (Pinecone) health: ${isHealthy ? 'healthy' : 'unhealthy'}`,
          responseTime,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        vectordb: {
          status: 'error',
          error: errorMessage,
          indexName: this.vectorDbService.getIndexName(),
        },
        check: {
          name: 'vectordb',
          status: 'fail',
          details: `Vector database health check failed: ${errorMessage}`,
        },
      };
    }
  }

  private getMemoryInfo(): HealthStatus['dependencies']['memory'] {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal;
    const usedMemory = memoryUsage.heapUsed;
    const freeMemory = totalMemory - usedMemory;

    return {
      used: usedMemory,
      free: freeMemory,
      total: totalMemory,
      percentage: Math.round((usedMemory / totalMemory) * 100),
    };
  }

  private checkMemoryHealth(): HealthStatus['checks'][0] {
    const memory = this.getMemoryInfo();
    const memoryThresholds = {
      warning: 80, // 80% usage warning
      critical: 95, // 95% usage critical
    };

    if (memory.percentage >= memoryThresholds.critical) {
      return {
        name: 'memory',
        status: 'fail',
        details: `Critical memory usage: ${memory.percentage}%`,
      };
    }
    if (memory.percentage >= memoryThresholds.warning) {
      return {
        name: 'memory',
        status: 'warn',
        details: `High memory usage: ${memory.percentage}%`,
      };
    }
    return {
      name: 'memory',
      status: 'pass',
      details: `Normal memory usage: ${memory.percentage}%`,
    };
  }

  private async getDiskInfo(): Promise<HealthStatus['dependencies']['disk'] | null> {
    // Note: This is a simplified implementation
    // In a real application, you might use a library like 'systeminformation'
    // or call system commands to get actual disk usage
    return null;
  }

  private checkDiskHealth(
    diskInfo: NonNullable<HealthStatus['dependencies']['disk']>
  ): HealthStatus['checks'][0] {
    const diskThresholds = {
      warning: 80,
      critical: 95,
    };

    if (diskInfo.percentage >= diskThresholds.critical) {
      return {
        name: 'disk',
        status: 'fail',
        details: `Critical disk usage: ${diskInfo.percentage}%`,
      };
    }
    if (diskInfo.percentage >= diskThresholds.warning) {
      return {
        name: 'disk',
        status: 'warn',
        details: `High disk usage: ${diskInfo.percentage}%`,
      };
    }
    return {
      name: 'disk',
      status: 'pass',
      details: `Normal disk usage: ${diskInfo.percentage}%`,
    };
  }

  private determineOverallStatus(checks: HealthStatus['checks']): HealthStatus['status'] {
    const hasFailures = checks.some((check) => check.status === 'fail');
    const hasWarnings = checks.some((check) => check.status === 'warn');

    if (hasFailures) {
      return 'unhealthy';
    }
    if (hasWarnings) {
      return 'degraded';
    }
    return 'healthy';
  }

  private getHttpStatusCode(status: HealthStatus['status']): number {
    switch (status) {
      case 'healthy':
        return 200;
      case 'degraded':
        return 200; // Still operational but with warnings
      case 'unhealthy':
        return 503; // Service unavailable
      default:
        return 500;
    }
  }
}
