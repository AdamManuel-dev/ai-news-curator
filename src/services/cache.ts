/**
 * @fileoverview Cache service with Redis adapter integration
 * @lastmodified 2025-07-28T01:43:24Z
 * 
 * Features: CRUD operations, TTL support, batch operations, cache-aside pattern
 * Main APIs: CacheService class, get(), set(), delete(), getOrSet(), increment()
 * Constraints: Requires Redis adapter, dependency injection container
 * Patterns: Service pattern, cache-aside, error handling with fallbacks
 */

import { Injectable } from '@container/Container';
import { container, REDIS_ADAPTER } from '@container/index';
import { BaseService } from '@services/index';
import type { CacheAdapter } from '@adapters/redis';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  clear(): Promise<void>;
  increment(key: string, by?: number): Promise<number>;
  decrement(key: string, by?: number): Promise<number>;
  getWithTtl<T>(key: string): Promise<{ value: T | null; ttl: number }>;
  setMultiple(items: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void>;
  deleteMultiple(keys: string[]): Promise<void>;
  getMultiple<T>(keys: string[]): Promise<Array<{ key: string; value: T | null }>>;
  keys(pattern: string): Promise<string[]>;
}

@Injectable
export class CacheService extends BaseService implements CacheService {
  private cacheAdapter: CacheAdapter;

  constructor() {
    super();
    this.cacheAdapter = container.resolve<CacheAdapter>(REDIS_ADAPTER);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      this.logDebug('Cache GET operation', { key });
      const value = await this.cacheAdapter.get<T>(key);
      this.logDebug('Cache GET result', { key, found: value !== null });
      return value;
    } catch (error) {
      await this.handleError(error as Error, 'Cache GET operation failed', { key });
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      this.logDebug('Cache SET operation', { key, hasTtl: !!ttlSeconds });
      await this.cacheAdapter.set(key, value, ttlSeconds);
      this.logDebug('Cache SET completed', { key });
    } catch (error) {
      await this.handleError(error as Error, 'Cache SET operation failed', { key, ttlSeconds });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      this.logDebug('Cache DELETE operation', { key });
      await this.cacheAdapter.delete(key);
      this.logDebug('Cache DELETE completed', { key });
    } catch (error) {
      await this.handleError(error as Error, 'Cache DELETE operation failed', { key });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      this.logDebug('Cache EXISTS operation', { key });
      const exists = await this.cacheAdapter.exists(key);
      this.logDebug('Cache EXISTS result', { key, exists });
      return exists;
    } catch (error) {
      await this.handleError(error as Error, 'Cache EXISTS operation failed', { key });
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      this.logInfo('Cache CLEAR operation started');
      await this.cacheAdapter.clear();
      this.logInfo('Cache CLEAR completed');
    } catch (error) {
      await this.handleError(error as Error, 'Cache CLEAR operation failed');
      throw error;
    }
  }

  async increment(key: string, by = 1): Promise<number> {
    try {
      this.logDebug('Cache INCREMENT operation', { key, by });
      const result = await this.cacheAdapter.increment(key, by);
      this.logDebug('Cache INCREMENT result', { key, by, result });
      return result;
    } catch (error) {
      await this.handleError(error as Error, 'Cache INCREMENT operation failed', { key, by });
      throw error;
    }
  }

  async decrement(key: string, by = 1): Promise<number> {
    try {
      this.logDebug('Cache DECREMENT operation', { key, by });
      const result = await this.cacheAdapter.decrement(key, by);
      this.logDebug('Cache DECREMENT result', { key, by, result });
      return result;
    } catch (error) {
      await this.handleError(error as Error, 'Cache DECREMENT operation failed', { key, by });
      throw error;
    }
  }

  async getWithTtl<T>(key: string): Promise<{ value: T | null; ttl: number }> {
    try {
      this.logDebug('Cache GET_WITH_TTL operation', { key });
      const [value, ttl] = await Promise.all([
        this.cacheAdapter.get<T>(key),
        this.cacheAdapter.ttl(key),
      ]);
      this.logDebug('Cache GET_WITH_TTL result', { key, found: value !== null, ttl });
      return { value, ttl };
    } catch (error) {
      await this.handleError(error as Error, 'Cache GET_WITH_TTL operation failed', { key });
      return { value: null, ttl: -1 };
    }
  }

  async setMultiple(items: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> {
    try {
      this.logDebug('Cache SET_MULTIPLE operation', { count: items.length });
      const operations = items.map(({ key, value, ttl }) => this.cacheAdapter.set(key, value, ttl));
      await Promise.all(operations);
      this.logDebug('Cache SET_MULTIPLE completed', { count: items.length });
    } catch (error) {
      await this.handleError(error as Error, 'Cache SET_MULTIPLE operation failed', {
        count: items.length,
      });
      throw error;
    }
  }

  async deleteMultiple(keys: string[]): Promise<void> {
    try {
      this.logDebug('Cache DELETE_MULTIPLE operation', { count: keys.length });
      const operations = keys.map((key) => this.cacheAdapter.delete(key));
      await Promise.all(operations);
      this.logDebug('Cache DELETE_MULTIPLE completed', { count: keys.length });
    } catch (error) {
      await this.handleError(error as Error, 'Cache DELETE_MULTIPLE operation failed', {
        count: keys.length,
      });
      throw error;
    }
  }

  async getMultiple<T>(keys: string[]): Promise<Array<{ key: string; value: T | null }>> {
    try {
      this.logDebug('Cache GET_MULTIPLE operation', { count: keys.length });
      const operations = keys.map(async (key) => ({
        key,
        value: await this.cacheAdapter.get<T>(key),
      }));
      const results = await Promise.all(operations);
      this.logDebug('Cache GET_MULTIPLE completed', { count: keys.length });
      return results;
    } catch (error) {
      await this.handleError(error as Error, 'Cache GET_MULTIPLE operation failed', {
        count: keys.length,
      });
      return keys.map((key) => ({ key, value: null }));
    }
  }

  // Utility method to create cache keys with prefixes
  static createKey(prefix: string, ...parts: string[]): string {
    return [prefix, ...parts].filter(Boolean).join(':');
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      this.logDebug('Cache KEYS operation', { pattern });
      const keys = await this.cacheAdapter.keys(pattern);
      this.logDebug('Cache KEYS result', { pattern, count: keys.length });
      return keys;
    } catch (error) {
      await this.handleError(error as Error, 'Cache KEYS operation failed', { pattern });
      return [];
    }
  }

  // Utility method for cache-aside pattern
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        this.logDebug('Cache hit', { key });
        return cached;
      }

      // Cache miss - fetch data
      this.logDebug('Cache miss - fetching data', { key });
      const data = await fetcher();

      // Store in cache for next time
      await this.set(key, data, ttlSeconds);
      this.logDebug('Data cached', { key });

      return data;
    } catch (error) {
      await this.handleError(error as Error, 'Cache GET_OR_SET operation failed', { key });
      throw error;
    }
  }
}
