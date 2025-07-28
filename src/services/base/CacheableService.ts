/**
 * @fileoverview Cacheable service base class
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Cache-aside pattern, cache invalidation, warmup, statistics
 * Main APIs: getOrSetCache(), setCache(), invalidateCache(), warmupCache()
 * Constraints: Requires CacheService, configurable TTL, key prefixing
 * Patterns: Extends BaseService, graceful cache degradation, metrics tracking
 */

import { BaseService } from '@services/index';
import { CacheManager } from '@services/cache-manager';
import { container, CACHE_SERVICE } from '@container/index';
import { CacheService } from '@services/cache';
import type { ServiceConfiguration } from '@types/service';

export interface CacheableServiceConfig extends ServiceConfiguration {
  cache: {
    enabled: boolean;
    defaultTtl: number;
    keyPrefix?: string;
    warmupKeys?: string[];
  };
}

export abstract class CacheableService extends BaseService {
  protected cacheManager: CacheManager;
  protected cacheService: CacheService;
  protected defaultTtl: number;
  private keyPrefix: string;

  constructor(config?: Partial<CacheableServiceConfig>) {
    const cacheableConfig: CacheableServiceConfig = {
      cache: {
        enabled: true,
        defaultTtl: 300,
        keyPrefix: '',
        warmupKeys: [],
        ...config?.cache,
      },
      ...config,
    };

    super(cacheableConfig);
    
    this.cacheService = container.resolve<CacheService>(CACHE_SERVICE);
    this.cacheManager = new CacheManager(this.cacheService);
    this.defaultTtl = cacheableConfig.cache.defaultTtl;
    this.keyPrefix = cacheableConfig.cache.keyPrefix || this.serviceName.toLowerCase();
  }

  protected async onInitialize(): Promise<void> {
    await super.onInitialize();
    
    if (this.getServiceConfig().cache?.enabled) {
      await this.cacheManager.initialize?.();
      this.logInfo('Cache manager initialized');
      
      // Warm up cache if configured
      const warmupKeys = (this.getServiceConfig() as CacheableServiceConfig).cache.warmupKeys;
      if (warmupKeys && warmupKeys.length > 0) {
        await this.warmupCache(warmupKeys);
      }
    }
  }

  protected async onShutdown(): Promise<void> {
    if (this.getServiceConfig().cache?.enabled) {
      await this.cacheManager.shutdown?.();
      this.logInfo('Cache manager shutdown');
    }
    
    await super.onShutdown();
  }

  protected async onHealthCheck() {
    const baseHealth = await super.onHealthCheck();
    
    if (!this.getServiceConfig().cache?.enabled) {
      return baseHealth;
    }

    try {
      const cacheHealth = await this.cacheManager.healthCheck();
      return {
        status: cacheHealth.status === 'healthy' ? baseHealth.status : 'degraded',
        details: {
          ...baseHealth.details,
          cache: cacheHealth.details,
        },
      };
    } catch (error) {
      return {
        status: 'degraded',
        details: {
          ...baseHealth.details,
          cache: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        },
      };
    }
  }

  /**
   * Generate cache key with service prefix
   */
  protected getCacheKey(...parts: (string | number)[]): string {
    const keyParts = [this.keyPrefix, ...parts.map(p => String(p))];
    return keyParts.filter(Boolean).join(':');
  }

  /**
   * Cache-aside pattern implementation
   */
  protected async getOrSetCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    if (!this.getServiceConfig().cache?.enabled) {
      return fetcher();
    }

    try {
      const cacheKey = this.getCacheKey(key);
      const result = await this.cacheManager.getOrSet(cacheKey, fetcher, ttl || this.defaultTtl);
      this.recordMetric('cache.operation', 1, { operation: 'get_or_set' });
      return result;
    } catch (error) {
      this.logWarn('Cache operation failed, falling back to direct fetch', { key, error });
      this.recordMetric('cache.fallback', 1, { operation: 'get_or_set' });
      return fetcher();
    }
  }

  /**
   * Get value from cache
   */
  protected async getFromCache<T>(key: string): Promise<T | null> {
    if (!this.getServiceConfig().cache?.enabled) {
      return null;
    }

    try {
      const cacheKey = this.getCacheKey(key);
      const result = await this.cacheManager.get<T>(cacheKey);
      this.recordMetric('cache.operation', 1, { operation: 'get' });
      return result;
    } catch (error) {
      this.logWarn('Cache get failed', { key, error });
      this.recordMetric('cache.error', 1, { operation: 'get' });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  protected async setCache<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.getServiceConfig().cache?.enabled) {
      return;
    }

    try {
      const cacheKey = this.getCacheKey(key);
      await this.cacheManager.set(cacheKey, value, ttl || this.defaultTtl);
      this.recordMetric('cache.operation', 1, { operation: 'set' });
    } catch (error) {
      this.logWarn('Cache set failed', { key, error });
      this.recordMetric('cache.error', 1, { operation: 'set' });
    }
  }

  /**
   * Delete value from cache
   */
  protected async deleteFromCache(key: string): Promise<void> {
    if (!this.getServiceConfig().cache?.enabled) {
      return;
    }

    try {
      const cacheKey = this.getCacheKey(key);
      await this.cacheManager.delete(cacheKey);
      this.recordMetric('cache.operation', 1, { operation: 'delete' });
    } catch (error) {
      this.logWarn('Cache delete failed', { key, error });
      this.recordMetric('cache.error', 1, { operation: 'delete' });
    }
  }

  /**
   * Invalidate cache pattern
   */
  protected async invalidateCache(pattern: string, reason?: string): Promise<number> {
    if (!this.getServiceConfig().cache?.enabled) {
      return 0;
    }

    try {
      const cachePattern = this.getCacheKey(pattern);
      const invalidated = await this.cacheManager.invalidatePattern({
        pattern: cachePattern,
        reason: reason || `${this.serviceName} cache invalidation`,
      });
      
      this.recordMetric('cache.invalidation', invalidated, { pattern });
      this.logDebug('Cache invalidated', { pattern: cachePattern, invalidated });
      
      return invalidated;
    } catch (error) {
      this.logWarn('Cache invalidation failed', { pattern, error });
      this.recordMetric('cache.error', 1, { operation: 'invalidate' });
      return 0;
    }
  }

  /**
   * Warm up cache with multiple keys
   */
  protected async warmupCache(keys: string[]): Promise<void> {
    if (!this.getServiceConfig().cache?.enabled || keys.length === 0) {
      return;
    }

    this.logInfo('Starting cache warmup', { keysCount: keys.length });
    
    try {
      const warmupConfigs = await this.createWarmupConfigs(keys);
      await this.cacheManager.warmCache(warmupConfigs);
      this.recordMetric('cache.warmup.completed', keys.length);
      this.logInfo('Cache warmup completed', { keysCount: keys.length });
    } catch (error) {
      this.logError('Cache warmup failed', error, { keysCount: keys.length });
      this.recordMetric('cache.warmup.failed', 1);
    }
  }

  /**
   * Abstract method for creating warmup configurations
   * Subclasses should override this to provide specific warming logic
   */
  protected async createWarmupConfigs(keys: string[]): Promise<Array<{
    key: string;
    fetcher: () => Promise<unknown>;
    ttl?: number;
    priority: 'high' | 'medium' | 'low';
  }>> {
    // Default implementation - subclasses should override
    return keys.map(key => ({
      key: this.getCacheKey(key),
      fetcher: async () => null,
      ttl: this.defaultTtl,
      priority: 'medium' as const,
    }));
  }

  /**
   * Get cache statistics
   */
  protected getCacheStats() {
    if (!this.getServiceConfig().cache?.enabled) {
      return null;
    }

    return this.cacheManager.getStats();
  }

  /**
   * Reset cache statistics
   */
  protected resetCacheStats(): void {
    if (this.getServiceConfig().cache?.enabled) {
      this.cacheManager.resetStats();
    }
  }

  /**
   * Enable/disable caching at runtime
   */
  protected setCacheEnabled(enabled: boolean): void {
    this.updateServiceConfig({
      cache: {
        ...this.getServiceConfig().cache,
        enabled,
      },
    });
    
    this.logInfo(`Caching ${enabled ? 'enabled' : 'disabled'}`);
  }
}