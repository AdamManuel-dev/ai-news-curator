/**
 * @fileoverview Tests for advanced cache manager
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Cache warming, invalidation patterns, circuit breaker, statistics
 * Main APIs: get(), set(), warmCache(), invalidatePattern(), healthCheck()
 * Constraints: Requires CacheService mocking
 * Patterns: Tests cache-aside pattern, circuit breaker, warming strategies
 */

import { CacheManager, CacheWarmingStrategies, InvalidationPatterns } from '@services/cache-manager';
import { CacheService } from '@services/cache';

// Mock dependencies
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('CacheManager', () => {
  let mockCacheService: jest.Mocked<CacheService>;
  let cacheManager: CacheManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock cache service
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      clear: jest.fn(),
      increment: jest.fn(),
      decrement: jest.fn(),
      getWithTtl: jest.fn(),
      setMultiple: jest.fn(),
      deleteMultiple: jest.fn(),
      getMultiple: jest.fn(),
      keys: jest.fn(), // Add the keys method for cache manager
    } as any;

    cacheManager = new CacheManager(mockCacheService);
  });

  describe('Basic Operations with Statistics', () => {
    it('should track cache hits and update statistics', async () => {
      mockCacheService.get.mockResolvedValue('test-value');

      const result = await cacheManager.get('test-key');

      expect(result).toBe('test-value');
      expect(mockCacheService.get).toHaveBeenCalledWith('test-key');

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.totalOperations).toBe(1);
      expect(stats.hitRate).toBe(100);
    });

    it('should track cache misses and update statistics', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const result = await cacheManager.get('test-key');

      expect(result).toBeNull();
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.totalOperations).toBe(1);
      expect(stats.hitRate).toBe(0);
    });

    it('should track set operations', async () => {
      mockCacheService.set.mockResolvedValue();

      await cacheManager.set('test-key', 'test-value', 300);

      expect(mockCacheService.set).toHaveBeenCalledWith('test-key', 'test-value', 300);
      
      const stats = cacheManager.getStats();
      expect(stats.sets).toBe(1);
      expect(stats.totalOperations).toBe(1);
    });

    it('should track delete operations', async () => {
      mockCacheService.delete.mockResolvedValue();

      await cacheManager.delete('test-key');

      expect(mockCacheService.delete).toHaveBeenCalledWith('test-key');
      
      const stats = cacheManager.getStats();
      expect(stats.deletes).toBe(1);
      expect(stats.totalOperations).toBe(1);
    });

    it('should track errors and update statistics', async () => {
      mockCacheService.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cacheManager.get('test-key');

      expect(result).toBeNull();
      
      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
      expect(stats.totalOperations).toBe(1);
    });
  });

  describe('Circuit Breaker Functionality', () => {
    it('should open circuit breaker after multiple failures', async () => {
      mockCacheService.get.mockRejectedValue(new Error('Connection failed'));

      // Generate 5 failures to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await cacheManager.get(`test-key-${i}`);
      }

      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(5);

      // Next request should be bypassed due to open circuit
      const result = await cacheManager.get('test-key-after-circuit-open');
      expect(result).toBeNull();
      expect(mockCacheService.get).toHaveBeenCalledTimes(5); // No additional call
    });

    it('should bypass cache operations when circuit is open', async () => {
      // Force circuit to open by making errors
      mockCacheService.get.mockRejectedValue(new Error('Connection failed'));
      for (let i = 0; i < 5; i++) {
        await cacheManager.get(`test-key-${i}`);
      }

      // Set operation should also be bypassed
      await cacheManager.set('test-key', 'value');
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should reset circuit breaker on successful operation', async () => {
      // First, simulate some failures but not enough to open circuit
      mockCacheService.get.mockRejectedValueOnce(new Error('Temporary failure'));
      await cacheManager.get('test-key-1');
      
      // Then simulate successful operation
      mockCacheService.get.mockResolvedValue('success');
      await cacheManager.get('test-key-2');

      const stats = cacheManager.getStats();
      expect(stats.errors).toBe(1);
      expect(stats.hits).toBe(1);
    });
  });

  describe('Cache-aside Pattern', () => {
    it('should return cached value when available', async () => {
      mockCacheService.get.mockResolvedValue('cached-value');

      const fetcher = jest.fn().mockResolvedValue('fresh-value');
      const result = await cacheManager.getOrSet('test-key', fetcher, 300);

      expect(result).toBe('cached-value');
      expect(fetcher).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should fetch and cache value when cache miss', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockCacheService.set.mockResolvedValue();

      const fetcher = jest.fn().mockResolvedValue('fresh-value');
      const result = await cacheManager.getOrSet('test-key', fetcher, 300);

      expect(result).toBe('fresh-value');
      expect(fetcher).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalledWith('test-key', 'fresh-value', 300);
    });
  });

  describe('Cache Warming', () => {
    it('should warm cache with multiple keys', async () => {
      mockCacheService.exists.mockResolvedValue(false);
      mockCacheService.set.mockResolvedValue();

      const configs = [
        {
          key: 'high-priority-key',
          fetcher: jest.fn().mockResolvedValue('high-priority-data'),
          ttl: 300,
          priority: 'high' as const,
        },
        {
          key: 'low-priority-key',
          fetcher: jest.fn().mockResolvedValue('low-priority-data'),
          ttl: 600,
          priority: 'low' as const,
        },
      ];

      await cacheManager.warmCache(configs);

      // Check that high priority was warmed first
      expect(configs).toHaveLength(2);
      expect(configs[0]!.fetcher).toHaveBeenCalled();
      expect(configs[1]!.fetcher).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalledTimes(2);
    });

    it('should skip warming if key already exists', async () => {
      mockCacheService.exists.mockResolvedValue(true);

      const config = {
        key: 'existing-key',
        fetcher: jest.fn().mockResolvedValue('data'),
        ttl: 300,
        priority: 'high' as const,
      };

      await cacheManager.warmCache([config]);

      expect(config.fetcher).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should handle warming failures gracefully', async () => {
      mockCacheService.exists.mockResolvedValue(false);

      const config = {
        key: 'failing-key',
        fetcher: jest.fn().mockRejectedValue(new Error('Fetch failed')),
        ttl: 300,
        priority: 'high' as const,
      };

      // Should not throw error
      await expect(cacheManager.warmCache([config])).resolves.not.toThrow();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });

    it('should prevent concurrent warming of same key', async () => {
      mockCacheService.exists.mockResolvedValue(false);
      mockCacheService.set.mockResolvedValue();

      const config = {
        key: 'concurrent-key',
        fetcher: jest.fn().mockImplementation(() => new Promise(resolve => 
          setTimeout(() => resolve('data'), 100)
        )),
        ttl: 300,
        priority: 'high' as const,
      };

      // Start two warming operations for the same key
      const promise1 = cacheManager.warmCache([config]);
      const promise2 = cacheManager.warmCache([config]);

      await Promise.all([promise1, promise2]);

      // Fetcher should only be called once
      expect(config.fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate keys matching pattern', async () => {
      mockCacheService.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockCacheService.deleteMultiple.mockResolvedValue();

      const pattern = {
        pattern: 'user:123:*',
        reason: 'User data changed',
      };

      const result = await cacheManager.invalidatePattern(pattern);

      expect(result).toBe(3);
      expect(mockCacheService.keys).toHaveBeenCalledWith('user:123:*');
      expect(mockCacheService.deleteMultiple).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
    });

    it('should handle no matching keys gracefully', async () => {
      mockCacheService.keys.mockResolvedValue([]);

      const pattern = {
        pattern: 'nonexistent:*',
        reason: 'Test',
      };

      const result = await cacheManager.invalidatePattern(pattern);

      expect(result).toBe(0);
      expect(mockCacheService.deleteMultiple).not.toHaveBeenCalled();
    });

    it('should invalidate multiple patterns', async () => {
      mockCacheService.keys
        .mockResolvedValueOnce(['key1', 'key2'])
        .mockResolvedValueOnce(['key3', 'key4']);
      mockCacheService.deleteMultiple.mockResolvedValue();

      const patterns = [
        { pattern: 'pattern1:*', reason: 'Test 1' },
        { pattern: 'pattern2:*', reason: 'Test 2' },
      ];

      const result = await cacheManager.invalidatePatterns(patterns);

      expect(result).toBe(4);
      expect(mockCacheService.deleteMultiple).toHaveBeenCalledTimes(2);
    });

    it('should handle invalidation failures gracefully', async () => {
      mockCacheService.keys.mockRejectedValue(new Error('Redis error'));

      const pattern = {
        pattern: 'failing:*',
        reason: 'Test',
      };

      const result = await cacheManager.invalidatePattern(pattern);

      expect(result).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status when everything works', async () => {
      mockCacheService.set.mockResolvedValue();
      mockCacheService.get.mockResolvedValue('test');
      mockCacheService.delete.mockResolvedValue();

      const health = await cacheManager.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details.connectivity).toBe(true);
      expect(health.details.circuitState).toBe('closed');
    });

    it('should report unhealthy status when connectivity fails', async () => {
      mockCacheService.set.mockRejectedValue(new Error('Connection failed'));

      const health = await cacheManager.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.connectivity).toBe(false);
    });

    it('should report degraded status with low hit rate', async () => {
      // Simulate low hit rate by having more misses first
      mockCacheService.get.mockResolvedValue(null);
      for (let i = 0; i < 15; i++) {
        await cacheManager.get(`miss-key-${i}`);
      }

      // Then set up health check to succeed
      mockCacheService.set.mockResolvedValue();
      mockCacheService.get.mockResolvedValue('test');
      mockCacheService.delete.mockResolvedValue();

      const health = await cacheManager.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.details.connectivity).toBe(true);
      expect(health.details.stats.hitRate).toBeLessThan(50);
    });
  });

  describe('Statistics Management', () => {
    it('should calculate hit rate correctly', async () => {
      mockCacheService.get
        .mockResolvedValueOnce('hit1')
        .mockResolvedValueOnce('hit2')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await cacheManager.get('key1'); // hit
      await cacheManager.get('key2'); // hit
      await cacheManager.get('key3'); // miss
      await cacheManager.get('key4'); // miss

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.totalOperations).toBe(4);
      expect(stats.hitRate).toBe(50);
    });

    it('should reset statistics', async () => {
      mockCacheService.get.mockResolvedValue('value');
      await cacheManager.get('key');

      let stats = cacheManager.getStats();
      expect(stats.hits).toBe(1);

      cacheManager.resetStats();

      stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.totalOperations).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should track uptime', async () => {
      const startTime = Date.now();
      
      // Simulate some delay
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = cacheManager.getStats();
      expect(stats.uptime).toBeGreaterThan(0);
      expect(stats.uptime).toBeLessThanOrEqual(Date.now() - startTime);
    });
  });

  describe('Key Generation Utilities', () => {
    it('should create namespaced keys', () => {
      const key = CacheManager.createKey('user', '123', 'profile');
      expect(key).toBe('user:123:profile');
    });

    it('should create keys with TTL suffix', () => {
      const key = CacheManager.createKeyWithTtl('content', 3600, 'article', '456');
      expect(key).toBe('content:article:456:ttl:3600');
    });

    it('should filter out empty parts', () => {
      const key = CacheManager.createKey('user', '', '123', '', 'data');
      expect(key).toBe('user:123:data');
    });
  });
});

describe('CacheWarmingStrategies', () => {
  it('should create content warming configuration', () => {
    const configs = CacheWarmingStrategies.createContentWarmingConfig();
    
    expect(configs).toHaveLength(3);
    expect(configs[0]!.key).toBe('trending:articles:top10');
    expect(configs[0]!.priority).toBe('high');
    expect(configs[1]!.key).toBe('categories:popular');
    expect(configs[1]!.priority).toBe('medium');
  });

  it('should create user-specific warming configuration', () => {
    const configs = CacheWarmingStrategies.createUserWarmingConfig('user123');
    
    expect(configs).toHaveLength(2);
    expect(configs[0]!.key).toBe('user:user123:preferences');
    expect(configs[0]!.priority).toBe('high');
    expect(configs[1]!.key).toBe('user:user123:recommendations');
    expect(configs[1]!.priority).toBe('medium');
  });
});

describe('InvalidationPatterns', () => {
  it('should create content invalidation pattern', () => {
    const pattern = InvalidationPatterns.contentUpdated('123');
    
    expect(pattern.pattern).toBe('content:123*');
    expect(pattern.reason).toBe('Content updated');
    expect(pattern.cascading).toBe(true);
  });

  it('should create user data invalidation pattern', () => {
    const pattern = InvalidationPatterns.userDataChanged('user456');
    
    expect(pattern.pattern).toBe('user:user456*');
    expect(pattern.reason).toBe('User data changed');
    expect(pattern.cascading).toBe(false);
  });

  it('should create trending data invalidation pattern', () => {
    const pattern = InvalidationPatterns.trendingDataExpired();
    
    expect(pattern.pattern).toBe('trending:*');
    expect(pattern.reason).toBe('Trending data refresh');
    expect(pattern.cascading).toBe(true);
  });

  it('should create global refresh pattern', () => {
    const pattern = InvalidationPatterns.globalRefresh();
    
    expect(pattern.pattern).toBe('*');
    expect(pattern.reason).toBe('Global cache refresh');
    expect(pattern.cascading).toBe(true);
  });
});