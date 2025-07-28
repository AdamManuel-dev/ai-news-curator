/**
 * @fileoverview Cacheable repository base class
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Entity caching, query caching, invalidation, cache warming
 * Main APIs: CacheableRepository class, findById(), warmUpCache()
 * Constraints: Requires CacheService, CacheManager, BaseRepository
 * Patterns: Extends BaseRepository, configurable TTLs, batch operations
 */

import { BaseRepository } from '@database/repositories/base';
import { CacheManager } from '@services/cache-manager';
import { container, CACHE_SERVICE } from '@container/index';
import { CacheService } from '@services/cache';
import type { BaseEntity, QueryOptions, PaginatedResult } from '@types/database';

export interface CacheableRepositoryConfig {
  entityTtl?: number;
  queryTtl?: number;
  listTtl?: number;
  enableCache?: boolean;
  cachePrefix?: string;
  invalidateOnWrite?: boolean;
}

export abstract class CacheableRepository<T extends BaseEntity> extends BaseRepository<T> {
  protected cacheManager: CacheManager;
  protected cacheService: CacheService;
  private cacheConfig: Required<CacheableRepositoryConfig>;
  private cachePrefix: string;

  constructor(tableName: string, config?: CacheableRepositoryConfig) {
    super(tableName);
    
    this.cacheService = container.resolve<CacheService>(CACHE_SERVICE);
    this.cacheManager = new CacheManager(this.cacheService);
    
    this.cacheConfig = {
      entityTtl: 300, // 5 minutes
      queryTtl: 180,  // 3 minutes
      listTtl: 60,    // 1 minute
      enableCache: true,
      cachePrefix: tableName,
      invalidateOnWrite: true,
      ...config,
    };

    this.cachePrefix = this.cacheConfig.cachePrefix;
  }

  /**
   * Find entity by ID with caching
   */
  async findById(id: string): Promise<T | null> {
    if (!this.cacheConfig.enableCache) {
      return super.findById(id);
    }

    const cacheKey = this.getEntityCacheKey(id);
    
    return this.cacheManager.getOrSet(
      cacheKey,
      () => super.findById(id),
      this.cacheConfig.entityTtl
    );
  }

  /**
   * Find multiple entities by IDs with caching
   */
  async findByIds(ids: string[]): Promise<T[]> {
    if (!this.cacheConfig.enableCache || ids.length === 0) {
      return super.findByIds(ids);
    }

    // Try to get entities from cache first
    const cachedEntities = new Map<string, T>();
    const uncachedIds: string[] = [];

    for (const id of ids) {
      const cacheKey = this.getEntityCacheKey(id);
      const cached = await this.cacheManager.get<T>(cacheKey);
      
      if (cached) {
        cachedEntities.set(id, cached);
      } else {
        uncachedIds.push(id);
      }
    }

    // Fetch uncached entities from database
    let uncachedEntities: T[] = [];
    if (uncachedIds.length > 0) {
      uncachedEntities = await super.findByIds(uncachedIds);
      
      // Cache the newly fetched entities
      for (const entity of uncachedEntities) {
        const cacheKey = this.getEntityCacheKey(entity.id);
        await this.cacheManager.set(cacheKey, entity, this.cacheConfig.entityTtl);
      }
    }

    // Combine cached and fetched entities in original order
    const result: T[] = [];
    for (const id of ids) {
      const entity = cachedEntities.get(id) || uncachedEntities.find(e => e.id === id);
      if (entity) {
        result.push(entity);
      }
    }

    return result;
  }

  /**
   * Find all entities with caching
   */
  async findAll(options?: QueryOptions): Promise<T[]> {
    if (!this.cacheConfig.enableCache) {
      return super.findAll(options);
    }

    const cacheKey = this.getQueryCacheKey('findAll', options);
    
    return this.cacheManager.getOrSet(
      cacheKey,
      () => super.findAll(options),
      this.cacheConfig.listTtl
    );
  }

  /**
   * Find with pagination and caching
   */
  async findWithPagination(options?: QueryOptions): Promise<PaginatedResult<T>> {
    if (!this.cacheConfig.enableCache) {
      return super.findWithPagination(options);
    }

    const cacheKey = this.getQueryCacheKey('findWithPagination', options);
    
    return this.cacheManager.getOrSet(
      cacheKey,
      () => super.findWithPagination(options),
      this.cacheConfig.queryTtl
    );
  }

  /**
   * Create entity with cache invalidation
   */
  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const created = await super.create(data);
    
    if (this.cacheConfig.enableCache && this.cacheConfig.invalidateOnWrite) {
      await this.invalidateEntityCache(created.id);
      await this.invalidateQueryCaches();
    }
    
    return created;
  }

  /**
   * Update entity with cache invalidation
   */
  async update(id: string, data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T | null> {
    const updated = await super.update(id, data);
    
    if (updated && this.cacheConfig.enableCache && this.cacheConfig.invalidateOnWrite) {
      await this.invalidateEntityCache(id);
      await this.invalidateQueryCaches();
    }
    
    return updated;
  }

  /**
   * Delete entity with cache invalidation
   */
  async delete(id: string): Promise<boolean> {
    const deleted = await super.delete(id);
    
    if (deleted && this.cacheConfig.enableCache && this.cacheConfig.invalidateOnWrite) {
      await this.invalidateEntityCache(id);
      await this.invalidateQueryCaches();
    }
    
    return deleted;
  }

  /**
   * Count entities with caching
   */
  async count(filters?: Record<string, any>): Promise<number> {
    if (!this.cacheConfig.enableCache) {
      return super.count(filters);
    }

    const cacheKey = this.getQueryCacheKey('count', { filters });
    
    return this.cacheManager.getOrSet(
      cacheKey,
      () => super.count(filters),
      this.cacheConfig.queryTtl
    );
  }

  /**
   * Exists check with caching
   */
  async exists(id: string): Promise<boolean> {
    if (!this.cacheConfig.enableCache) {
      return super.exists(id);
    }

    const cacheKey = this.getEntityCacheKey(id, 'exists');
    
    return this.cacheManager.getOrSet(
      cacheKey,
      () => super.exists(id),
      this.cacheConfig.entityTtl
    );
  }

  /**
   * Cache a query result manually
   */
  protected async cacheQueryResult<R>(
    cacheKey: string,
    fetcher: () => Promise<R>,
    ttl?: number
  ): Promise<R> {
    if (!this.cacheConfig.enableCache) {
      return fetcher();
    }

    return this.cacheManager.getOrSet(
      cacheKey,
      fetcher,
      ttl || this.cacheConfig.queryTtl
    );
  }

  /**
   * Invalidate cache for a specific entity
   */
  protected async invalidateEntityCache(id: string): Promise<void> {
    if (!this.cacheConfig.enableCache) {
      return;
    }

    const patterns = [
      this.getEntityCacheKey(id, '*'),
      this.getEntityCacheKey(id),
    ];

    for (const pattern of patterns) {
      await this.cacheManager.invalidatePattern({
        pattern,
        reason: `Entity ${id} modified`,
      });
    }
  }

  /**
   * Invalidate all query caches for this repository
   */
  protected async invalidateQueryCaches(): Promise<void> {
    if (!this.cacheConfig.enableCache) {
      return;
    }

    const pattern = this.getQueryCacheKey('*');
    await this.cacheManager.invalidatePattern({
      pattern,
      reason: `${this.tableName} data modified`,
    });
  }

  /**
   * Invalidate all caches for this repository
   */
  async invalidateAllCaches(): Promise<void> {
    if (!this.cacheConfig.enableCache) {
      return;
    }

    const pattern = `${this.cachePrefix}:*`;
    await this.cacheManager.invalidatePattern({
      pattern,
      reason: `${this.tableName} cache cleared`,
    });
  }

  /**
   * Warm up entity cache
   */
  async warmUpCache(ids: string[]): Promise<void> {
    if (!this.cacheConfig.enableCache || ids.length === 0) {
      return;
    }

    const warmupConfigs = ids.map(id => ({
      key: this.getEntityCacheKey(id),
      fetcher: () => super.findById(id),
      ttl: this.cacheConfig.entityTtl,
      priority: 'medium' as const,
    }));

    await this.cacheManager.warmCache(warmupConfigs);
  }

  /**
   * Get cache statistics for this repository
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
   * Enable/disable caching at runtime
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheConfig.enableCache = enabled;
  }

  /**
   * Update cache configuration
   */
  updateCacheConfig(updates: Partial<CacheableRepositoryConfig>): void {
    this.cacheConfig = { ...this.cacheConfig, ...updates };
  }

  /**
   * Generate cache key for entity
   */
  private getEntityCacheKey(id: string, suffix?: string): string {
    const parts = [this.cachePrefix, 'entity', id];
    if (suffix) {
      parts.push(suffix);
    }
    return parts.join(':');
  }

  /**
   * Generate cache key for queries
   */
  private getQueryCacheKey(operation: string, options?: any): string {
    const parts = [this.cachePrefix, 'query', operation];
    
    if (options) {
      // Create a stable hash of the options
      const optionsHash = this.hashOptions(options);
      parts.push(optionsHash);
    }
    
    return parts.join(':');
  }

  /**
   * Create a stable hash from query options
   */
  private hashOptions(options: any): string {
    try {
      // Sort keys to ensure consistent hash
      const sorted = JSON.stringify(options, Object.keys(options).sort());
      
      // Simple hash function (in production, consider using a proper hash library)
      let hash = 0;
      for (let i = 0; i < sorted.length; i++) {
        const char = sorted.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      return Math.abs(hash).toString(36);
    } catch {
      return 'default';
    }
  }

  /**
   * Batch cache operations for multiple entities
   */
  protected async batchCacheSet(entities: T[]): Promise<void> {
    if (!this.cacheConfig.enableCache || entities.length === 0) {
      return;
    }

    const cacheOperations = entities.map(entity => ({
      key: this.getEntityCacheKey(entity.id),
      value: entity,
      ttl: this.cacheConfig.entityTtl,
    }));

    await this.cacheService.setMultiple(cacheOperations);
  }

  /**
   * Preload frequently accessed entities
   */
  async preloadFrequentEntities(limit: number = 100): Promise<void> {
    if (!this.cacheConfig.enableCache) {
      return;
    }

    try {
      // This is a basic implementation - could be enhanced with actual access patterns
      const entities = await super.findAll({ limit, orderBy: 'updatedAt', orderDirection: 'DESC' });
      await this.batchCacheSet(entities);
    } catch (error) {
      // Don't throw errors from cache preloading
      console.warn('Failed to preload entities for cache:', error);
    }
  }
}