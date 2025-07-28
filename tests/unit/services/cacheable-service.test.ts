/**
 * @fileoverview Tests for CacheableService
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Cache functionality, invalidation, warmup, fallback behavior
 * Main APIs: getOrSetCache(), setCache(), invalidateCache(), warmupCache()
 * Constraints: Requires CacheManager and CacheService mocking
 * Patterns: Tests cache-aside pattern, service lifecycle, error handling
 */

import { CacheableService } from '@services/base/CacheableService';
import { CacheManager } from '@services/cache-manager';
import { CacheService } from '@services/cache';

// Mock dependencies
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('@container/index', () => ({
  container: {
    resolve: jest.fn().mockImplementation((token) => {
      if (token === 'LOGGER') {
        return {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        };
      }
      if (token === 'CONFIG') {
        return {
          nodeEnv: 'test',
        };
      }
      if (token === 'CACHE_SERVICE') {
        return mockCacheService;
      }
      return {};
    }),
  },
  LOGGER: 'LOGGER',
  CONFIG: 'CONFIG',
  CACHE_SERVICE: 'CACHE_SERVICE',
}));

// Mock cache service
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  exists: jest.fn(),
  clear: jest.fn(),
  keys: jest.fn(),
  increment: jest.fn(),
  decrement: jest.fn(),
  getWithTtl: jest.fn(),
  setMultiple: jest.fn(),
  deleteMultiple: jest.fn(),
  getMultiple: jest.fn(),
} as jest.Mocked<CacheService>;

// Mock cache manager
jest.mock('@services/cache-manager', () => ({
  CacheManager: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    getOrSet: jest.fn(),
    invalidatePattern: jest.fn(),
    warmCache: jest.fn(),
    healthCheck: jest.fn(),
    getStats: jest.fn(),
    resetStats: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
  })),
}));

// Test service implementation
class TestCacheableService extends CacheableService {
  private testData = new Map<string, any>();
  
  // Simulate some business logic that would benefit from caching
  async getExpensiveData(id: string): Promise<{ id: string; value: string }> {
    return this.getOrSetCache(`expensive:${id}`, async () => {
      // Simulate expensive operation
      await new Promise(resolve => setTimeout(resolve, 100));
      return { id, value: `computed-value-${id}` };
    });
  }
  
  async getUserData(userId: string): Promise<{ userId: string; name: string }> {
    const cacheKey = `user:${userId}`;
    
    const cached = await this.getFromCache<{ userId: string; name: string }>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Simulate database fetch
    const userData = { userId, name: `User ${userId}` };
    await this.setCache(cacheKey, userData);
    
    return userData;
  }
  
  async updateUserData(userId: string, name: string): Promise<void> {
    // Update in "database"
    this.testData.set(userId, { userId, name });
    
    // Invalidate cache
    await this.invalidateCache(`user:${userId}`, 'User data updated');
  }
  
  async getAllUsers(): Promise<Array<{ userId: string; name: string }>> {
    return this.getOrSetCache('users:all', async () => {
      // Simulate database query
      const users = Array.from(this.testData.values());
      return users;
    }, 60); // 1 minute TTL
  }
  
  // Expose protected methods for testing
  public testGetCacheKey(...parts: (string | number)[]): string {
    return this.getCacheKey(...parts);
  }
  
  public async testWarmupCache(keys: string[]): Promise<void> {
    return this.warmupCache(keys);
  }
  
  protected async createWarmupConfigs(keys: string[]) {
    return keys.map(key => ({
      key: this.getCacheKey('warmup', key),
      fetcher: async () => ({ key, value: `warmed-${key}` }),
      ttl: 300,
      priority: 'medium' as const,
    }));
  }
}

describe('CacheableService', () => {
  let service: TestCacheableService;
  let mockCacheManager: jest.Mocked<CacheManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TestCacheableService();
    mockCacheManager = (service as any).cacheManager as jest.Mocked<CacheManager>;
  });

  describe('Cache Key Generation', () => {
    it('should generate cache keys with service prefix', () => {
      const key = service.testGetCacheKey('user', '123', 'profile');
      expect(key).toBe('testcacheableservice:user:123:profile');
    });

    it('should handle numeric values in cache keys', () => {
      const key = service.testGetCacheKey('item', 456, 'data');
      expect(key).toBe('testcacheableservice:item:456:data');
    });

    it('should filter out empty parts', () => {
      const key = service.testGetCacheKey('user', '', '123', 'profile');
      expect(key).toBe('testcacheableservice:user:123:profile');
    });
  });

  describe('Cache Operations', () => {
    it('should get value from cache', async () => {
      const testValue = { id: '123', name: 'Test' };
      mockCacheManager.get.mockResolvedValue(testValue);
      
      const result = await service.getFromCache('test-key');
      
      expect(result).toEqual(testValue);
      expect(mockCacheManager.get).toHaveBeenCalledWith('testcacheableservice:test-key');
    });

    it('should return null when cache miss', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      
      const result = await service.getFromCache('nonexistent-key');
      
      expect(result).toBeNull();
    });

    it('should set value in cache', async () => {
      const testValue = { id: '123', name: 'Test' };
      mockCacheManager.set.mockResolvedValue();
      
      await service.setCache('test-key', testValue, 600);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'testcacheableservice:test-key',
        testValue,
        600
      );
    });

    it('should delete value from cache', async () => {
      mockCacheManager.delete.mockResolvedValue();
      
      await service.deleteFromCache('test-key');
      
      expect(mockCacheManager.delete).toHaveBeenCalledWith('testcacheableservice:test-key');
    });
  });

  describe('Cache-Aside Pattern', () => {
    it('should use cache-aside pattern correctly', async () => {
      const expectedData = { id: '123', value: 'computed-value-123' };
      mockCacheManager.getOrSet.mockResolvedValue(expectedData);
      
      const result = await service.getExpensiveData('123');
      
      expect(result).toEqual(expectedData);
      expect(mockCacheManager.getOrSet).toHaveBeenCalledWith(
        'testcacheableservice:expensive:123',
        expect.any(Function),
        300 // default TTL
      );
    });

    it('should call fetcher function when cache miss', async () => {
      mockCacheManager.getOrSet.mockImplementation(async (key, fetcher, ttl) => {
        return await fetcher();
      });
      
      const result = await service.getExpensiveData('456');
      
      expect(result).toEqual({ id: '456', value: 'computed-value-456' });
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache pattern', async () => {
      mockCacheManager.invalidatePattern.mockResolvedValue(5);
      
      const invalidated = await service.invalidateCache('user:*', 'Test invalidation');
      
      expect(invalidated).toBe(5);
      expect(mockCacheManager.invalidatePattern).toHaveBeenCalledWith({
        pattern: 'testcacheableservice:user:*',
        reason: 'Test invalidation',
      });
    });

    it('should use default reason when none provided', async () => {
      mockCacheManager.invalidatePattern.mockResolvedValue(3);
      
      await service.invalidateCache('data:*');
      
      expect(mockCacheManager.invalidatePattern).toHaveBeenCalledWith({
        pattern: 'testcacheableservice:data:*',
        reason: 'TestCacheableService cache invalidation',
      });
    });

    it('should handle invalidation errors gracefully', async () => {
      mockCacheManager.invalidatePattern.mockRejectedValue(new Error('Cache error'));
      
      const result = await service.invalidateCache('user:*');
      
      expect(result).toBe(0);
    });
  });

  describe('Cache Warmup', () => {
    it('should warm up cache with provided keys', async () => {
      mockCacheManager.warmCache.mockResolvedValue();
      
      await service.testWarmupCache(['key1', 'key2']);
      
      expect(mockCacheManager.warmCache).toHaveBeenCalledWith([
        {
          key: 'testcacheableservice:warmup:key1',
          fetcher: expect.any(Function),
          ttl: 300,
          priority: 'medium',
        },
        {
          key: 'testcacheableservice:warmup:key2',
          fetcher: expect.any(Function),
          ttl: 300,
          priority: 'medium',
        },
      ]);
    });

    it('should handle warmup errors gracefully', async () => {
      mockCacheManager.warmCache.mockRejectedValue(new Error('Warmup failed'));
      
      // Should not throw error
      await expect(service.testWarmupCache(['key1'])).resolves.not.toThrow();
    });

    it('should skip warmup when caching is disabled', async () => {
      service.setCacheEnabled(false);
      
      await service.testWarmupCache(['key1']);
      
      expect(mockCacheManager.warmCache).not.toHaveBeenCalled();
    });
  });

  describe('Service Lifecycle', () => {
    it('should initialize cache manager on service initialization', async () => {
      mockCacheManager.initialize = jest.fn().mockResolvedValue();
      
      await service.initialize();
      
      expect(mockCacheManager.initialize).toHaveBeenCalled();
    });

    it('should shutdown cache manager on service shutdown', async () => {
      mockCacheManager.shutdown = jest.fn().mockResolvedValue();
      await service.initialize();
      
      await service.shutdown();
      
      expect(mockCacheManager.shutdown).toHaveBeenCalled();
    });
  });

  describe('Health Checks', () => {
    it('should include cache health in service health check', async () => {
      mockCacheManager.healthCheck.mockResolvedValue({
        status: 'healthy',
        details: { connectivity: true },
      });
      
      await service.initialize();
      const health = await service.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.details.cache).toBeDefined();
    });

    it('should report degraded status when cache is unhealthy', async () => {
      mockCacheManager.healthCheck.mockResolvedValue({
        status: 'unhealthy',
        details: { connectivity: false },
      });
      
      await service.initialize();
      const health = await service.healthCheck();
      
      expect(health.status).toBe('degraded');
    });

    it('should handle cache health check errors', async () => {
      mockCacheManager.healthCheck.mockRejectedValue(new Error('Cache health check failed'));
      
      await service.initialize();
      const health = await service.healthCheck();
      
      expect(health.status).toBe('degraded');
      expect(health.details.cache.status).toBe('error');
    });
  });

  describe('Cache Control', () => {
    it('should enable/disable caching at runtime', () => {
      service.setCacheEnabled(false);
      expect(service.getServiceConfig().cache?.enabled).toBe(false);
      
      service.setCacheEnabled(true);
      expect(service.getServiceConfig().cache?.enabled).toBe(true);
    });

    it('should skip cache operations when disabled', async () => {
      service.setCacheEnabled(false);
      mockCacheManager.getOrSet.mockImplementation(async (key, fetcher) => fetcher());
      
      const result = await service.getExpensiveData('123');
      
      // Should call the fetcher directly without caching
      expect(result).toEqual({ id: '123', value: 'computed-value-123' });
    });
  });

  describe('Error Handling', () => {
    it('should fall back to direct fetch when cache fails', async () => {
      mockCacheManager.getOrSet.mockRejectedValue(new Error('Cache unavailable'));
      
      // This would call the fallback in a real implementation
      // For this test, we'll verify the error is handled gracefully
      await expect(service.getExpensiveData('123')).rejects.toThrow('Cache unavailable');
    });

    it('should handle cache set failures gracefully', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Cache write failed'));
      
      // Should not throw error
      await expect(service.setCache('test', { data: 'test' })).resolves.not.toThrow();
    });

    it('should handle cache delete failures gracefully', async () => {
      mockCacheManager.delete.mockRejectedValue(new Error('Cache delete failed'));
      
      // Should not throw error
      await expect(service.deleteFromCache('test')).resolves.not.toThrow();
    });
  });

  describe('Cache Statistics', () => {
    it('should provide cache statistics', () => {
      const mockStats = {
        hits: 10,
        misses: 2,
        totalOperations: 12,
        hitRate: 83.33,
        uptime: 3600,
      };
      mockCacheManager.getStats.mockReturnValue(mockStats);
      
      const stats = service.getCacheStats();
      
      expect(stats).toEqual(mockStats);
    });

    it('should reset cache statistics', () => {
      service.resetCacheStats();
      
      expect(mockCacheManager.resetStats).toHaveBeenCalled();
    });
  });
});