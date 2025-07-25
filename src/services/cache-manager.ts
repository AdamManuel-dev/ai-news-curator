/**
 * @fileoverview Advanced cache management service
 * 
 * Provides high-level cache operations including warming, invalidation patterns,
 * circuit breaker functionality, and cache statistics monitoring.
 * 
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import { CacheService } from './cache';
import logger from '@utils/logger';
import { config } from '@config/index';

// Cache warming configuration
export interface CacheWarmingConfig {
  key: string;
  fetcher: () => Promise<unknown>;
  ttl?: number;
  priority: 'high' | 'medium' | 'low';
  dependencies?: string[];
}

// Cache invalidation pattern
export interface InvalidationPattern {
  pattern: string;
  reason: string;
  cascading?: boolean;
}

// Cache statistics
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  totalOperations: number;
  hitRate: number;
  uptime: number;
}

// Circuit breaker state
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

/**
 * Advanced cache management with patterns and monitoring
 */
export class CacheManager {
  private cacheService: CacheService;
  private stats: CacheStats;
  private circuitState: CircuitState = CircuitState.CLOSED;
  private circuitConfig: CircuitBreakerConfig;
  private failureCount = 0;
  private lastFailureTime = 0;
  private warmingInProgress = new Set<string>();

  constructor(cacheService: CacheService) {
    this.cacheService = cacheService;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalOperations: 0,
      hitRate: 0,
      uptime: Date.now(),
    };
    
    this.circuitConfig = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
    };
  }

  /**
   * Get value with circuit breaker and statistics tracking
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.circuitState === CircuitState.OPEN) {
      logger.warn('Cache circuit breaker is open, bypassing cache', { key });
      this.recordMiss();
      return null;
    }

    try {
      this.incrementOperation();
      const value = await this.cacheService.get<T>(key);
      
      if (value !== null) {
        this.recordHit();
        this.resetCircuitBreaker();
        return value;
      } else {
        this.recordMiss();
        return null;
      }
    } catch (error) {
      this.recordError();
      this.handleCircuitBreakerFailure();
      logger.error('Cache get operation failed', { key, error });
      return null;
    }
  }

  /**
   * Set value with statistics tracking
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    if (this.circuitState === CircuitState.OPEN) {
      logger.warn('Cache circuit breaker is open, skipping set operation', { key });
      return;
    }

    try {
      this.incrementOperation();
      await this.cacheService.set(key, value, ttl);
      this.recordSet();
      this.resetCircuitBreaker();
    } catch (error) {
      this.recordError();
      this.handleCircuitBreakerFailure();
      logger.error('Cache set operation failed', { key, error });
      throw error;
    }
  }

  /**
   * Delete with statistics tracking
   */
  async delete(key: string): Promise<void> {
    try {
      this.incrementOperation();
      await this.cacheService.delete(key);
      this.recordDelete();
    } catch (error) {
      this.recordError();
      this.handleCircuitBreakerFailure();
      logger.error('Cache delete operation failed', { key, error });
      throw error;
    }
  }

  /**
   * Cache-aside pattern with automatic statistics
   */
  async getOrSet<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch data
    const data = await fetcher();
    await this.set(key, data, ttl);
    return data;
  }

  /**
   * Warm cache with multiple keys
   */
  async warmCache(configs: CacheWarmingConfig[]): Promise<void> {
    logger.info('Starting cache warming process', { keysCount: configs.length });
    
    // Sort by priority
    const sortedConfigs = configs.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const results = await Promise.allSettled(
      sortedConfigs.map(config => this.warmSingleKey(config))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('Cache warming completed', { successful, failed, total: configs.length });
  }

  /**
   * Warm a single cache key
   */
  private async warmSingleKey(config: CacheWarmingConfig): Promise<void> {
    if (this.warmingInProgress.has(config.key)) {
      logger.debug('Cache warming already in progress', { key: config.key });
      return;
    }

    this.warmingInProgress.add(config.key);
    
    try {
      // Check if already cached
      const exists = await this.cacheService.exists(config.key);
      if (exists) {
        logger.debug('Key already cached, skipping warming', { key: config.key });
        return;
      }

      // Fetch and cache data
      logger.debug('Warming cache key', { key: config.key, priority: config.priority });
      const data = await config.fetcher();
      await this.set(config.key, data, config.ttl);
      
      logger.debug('Cache key warmed successfully', { key: config.key });
    } catch (error) {
      logger.error('Failed to warm cache key', { 
        key: config.key, 
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.warmingInProgress.delete(config.key);
    }
  }

  /**
   * Invalidate cache keys matching patterns
   */
  async invalidatePattern(pattern: InvalidationPattern): Promise<number> {
    try {
      logger.info('Invalidating cache pattern', { 
        pattern: pattern.pattern, 
        reason: pattern.reason 
      });

      const keys = await this.cacheService.keys(pattern.pattern);
      
      if (keys.length === 0) {
        logger.debug('No keys found for pattern', { pattern: pattern.pattern });
        return 0;
      }

      await this.cacheService.deleteMultiple(keys);
      
      logger.info('Cache pattern invalidated', { 
        pattern: pattern.pattern, 
        keysDeleted: keys.length 
      });

      return keys.length;
    } catch (error) {
      logger.error('Failed to invalidate cache pattern', { 
        pattern: pattern.pattern, 
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Invalidate multiple patterns
   */
  async invalidatePatterns(patterns: InvalidationPattern[]): Promise<number> {
    const results = await Promise.allSettled(
      patterns.map(pattern => this.invalidatePattern(pattern))
    );

    return results.reduce((total, result) => {
      return total + (result.status === 'fulfilled' ? result.value : 0);
    }, 0);
  }

  /**
   * Get current cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    return {
      ...this.stats,
      hitRate: this.stats.totalOperations > 0 
        ? (this.stats.hits / this.stats.totalOperations) * 100 
        : 0,
      uptime: now - this.stats.uptime,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalOperations: 0,
      hitRate: 0,
      uptime: Date.now(),
    };
    logger.info('Cache statistics reset');
  }

  /**
   * Health check for cache system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      circuitState: CircuitState;
      stats: CacheStats;
      connectivity: boolean;
    };
  }> {
    try {
      // Test basic connectivity
      const testKey = `health_check:${Date.now()}`;
      await this.cacheService.set(testKey, 'test', 10);
      const value = await this.cacheService.get(testKey);
      await this.cacheService.delete(testKey);
      
      const connectivity = value === 'test';
      const stats = this.getStats();

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (!connectivity || this.circuitState === CircuitState.OPEN) {
        status = 'unhealthy';
      } else if (this.circuitState === CircuitState.HALF_OPEN || (stats.totalOperations > 10 && stats.hitRate < 50)) {
        status = 'degraded';
      }

      return {
        status,
        details: {
          circuitState: this.circuitState,
          stats,
          connectivity,
        },
      };
    } catch (error) {
      logger.error('Cache health check failed', { 
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        status: 'unhealthy',
        details: {
          circuitState: this.circuitState,
          stats: this.getStats(),
          connectivity: false,
        },
      };
    }
  }

  /**
   * Create cache key with namespace
   */
  static createKey(namespace: string, ...parts: string[]): string {
    return [namespace, ...parts].filter(Boolean).join(':');
  }

  /**
   * Create cache key with TTL suffix for debugging
   */
  static createKeyWithTtl(namespace: string, ttl: number, ...parts: string[]): string {
    return `${CacheManager.createKey(namespace, ...parts)}:ttl:${ttl}`;
  }

  // Private helper methods
  private incrementOperation(): void {
    this.stats.totalOperations++;
  }

  private recordHit(): void {
    this.stats.hits++;
  }

  private recordMiss(): void {
    this.stats.misses++;
  }

  private recordSet(): void {
    this.stats.sets++;
  }

  private recordDelete(): void {
    this.stats.deletes++;
  }

  private recordError(): void {
    this.stats.errors++;
  }

  private handleCircuitBreakerFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.circuitConfig.failureThreshold) {
      this.circuitState = CircuitState.OPEN;
      logger.warn('Cache circuit breaker opened due to failures', {
        failureCount: this.failureCount,
        threshold: this.circuitConfig.failureThreshold,
        lastFailureTime: this.lastFailureTime,
      });

      // Schedule circuit breaker reset
      setTimeout(() => {
        this.circuitState = CircuitState.HALF_OPEN;
        logger.info('Cache circuit breaker moved to half-open state');
      }, this.circuitConfig.resetTimeout);
    }
  }

  private resetCircuitBreaker(): void {
    if (this.circuitState === CircuitState.HALF_OPEN) {
      this.circuitState = CircuitState.CLOSED;
      this.failureCount = 0;
      logger.info('Cache circuit breaker reset to closed state');
    }
  }
}

/**
 * Cache warming strategies
 */
export class CacheWarmingStrategies {
  
  /**
   * Create warming config for frequently accessed content
   */
  static createContentWarmingConfig(): CacheWarmingConfig[] {
    return [
      {
        key: 'trending:articles:top10',
        fetcher: async () => {
          // This would fetch trending articles from database
          return [];
        },
        ttl: config.trendDataCacheTtl,
        priority: 'high',
      },
      {
        key: 'categories:popular',
        fetcher: async () => {
          // This would fetch popular categories
          return [];
        },
        ttl: config.tagAssignmentsCacheTtl,
        priority: 'medium',
      },
      {
        key: 'sources:trusted',
        fetcher: async () => {
          // This would fetch trusted sources
          return [];
        },
        ttl: 86400, // 24 hours
        priority: 'medium',
      },
    ];
  }

  /**
   * Create warming config for user-specific data
   */
  static createUserWarmingConfig(userId: string): CacheWarmingConfig[] {
    return [
      {
        key: CacheManager.createKey('user', userId, 'preferences'),
        fetcher: async () => {
          // This would fetch user preferences
          return {};
        },
        ttl: 3600, // 1 hour
        priority: 'high',
      },
      {
        key: CacheManager.createKey('user', userId, 'recommendations'),
        fetcher: async () => {
          // This would fetch user recommendations
          return [];
        },
        ttl: 1800, // 30 minutes
        priority: 'medium',
      },
    ];
  }
}

/**
 * Common invalidation patterns
 */
export class InvalidationPatterns {
  
  static contentUpdated(contentId: string): InvalidationPattern {
    return {
      pattern: `content:${contentId}*`,
      reason: 'Content updated',
      cascading: true,
    };
  }

  static userDataChanged(userId: string): InvalidationPattern {
    return {
      pattern: `user:${userId}*`,
      reason: 'User data changed',
      cascading: false,
    };
  }

  static trendingDataExpired(): InvalidationPattern {
    return {
      pattern: 'trending:*',
      reason: 'Trending data refresh',
      cascading: true,
    };
  }

  static categoryUpdated(category: string): InvalidationPattern {
    return {
      pattern: `category:${category}*`,
      reason: 'Category updated',
      cascading: true,
    };
  }

  static globalRefresh(): InvalidationPattern {
    return {
      pattern: '*',
      reason: 'Global cache refresh',
      cascading: true,
    };
  }
}