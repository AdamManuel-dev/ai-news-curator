/**
 * @fileoverview Redis adapter for caching operations in the AI Content Curator Agent.
 * 
 * Provides a Redis-based implementation of the cache adapter interface with
 * connection management, error handling, and comprehensive caching operations.
 * Supports both simple key-value operations and advanced Redis features.
 * 
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import Redis from 'ioredis';
import { config } from '@config/index';
import logger from '@utils/logger';

/**
 * Interface defining the contract for cache adapter implementations.
 * Provides a consistent API for caching operations regardless of the
 * underlying storage technology (Redis, Memcached, in-memory, etc.).
 * 
 * @interface ICacheAdapter
 * @since 1.0.0
 */
export interface ICacheAdapter {
  /**
   * Establishes connection to the cache storage.
   * @returns {Promise<void>} Promise that resolves when connected
   */
  connect(): Promise<void>;

  /**
   * Closes connection to the cache storage.
   * @returns {Promise<void>} Promise that resolves when disconnected
   */
  disconnect(): Promise<void>;

  /**
   * Retrieves a value from cache by key.
   * @template T The expected type of the cached value
   * @param {string} key Cache key to retrieve
   * @returns {Promise<T | null>} Cached value or null if not found
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Stores a value in cache with optional TTL.
   * @param {string} key Cache key to store under
   * @param {unknown} value Value to cache (will be JSON serialized)
   * @param {number} [ttlSeconds] Time to live in seconds
   * @returns {Promise<void>} Promise that resolves when stored
   */
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;

  /**
   * Removes a key from cache.
   * @param {string} key Cache key to delete
   * @returns {Promise<void>} Promise that resolves when deleted
   */
  delete(key: string): Promise<void>;

  /**
   * Checks if a key exists in cache.
   * @param {string} key Cache key to check
   * @returns {Promise<boolean>} True if key exists, false otherwise
   */
  exists(key: string): Promise<boolean>;

  /**
   * Clears all keys from the current database.
   * @returns {Promise<void>} Promise that resolves when cleared
   */
  clear(): Promise<void>;

  /**
   * Finds keys matching a pattern.
   * @param {string} pattern Glob-style pattern to match
   * @returns {Promise<string[]>} Array of matching keys
   */
  keys(pattern: string): Promise<string[]>;

  /**
   * Increments a numeric value stored at key.
   * @param {string} key Cache key containing numeric value
   * @param {number} [by=1] Amount to increment by
   * @returns {Promise<number>} New value after increment
   */
  increment(key: string, by?: number): Promise<number>;

  /**
   * Decrements a numeric value stored at key.
   * @param {string} key Cache key containing numeric value
   * @param {number} [by=1] Amount to decrement by
   * @returns {Promise<number>} New value after decrement
   */
  decrement(key: string, by?: number): Promise<number>;

  /**
   * Sets TTL for an existing key.
   * @param {string} key Cache key to set expiration on
   * @param {number} ttlSeconds Time to live in seconds
   * @returns {Promise<void>} Promise that resolves when TTL is set
   */
  expire(key: string, ttlSeconds: number): Promise<void>;

  /**
   * Gets remaining TTL for a key.
   * @param {string} key Cache key to check TTL for
   * @returns {Promise<number>} Remaining TTL in seconds (-1 if no TTL, -2 if key doesn't exist)
   */
  ttl(key: string): Promise<number>;
}

export class RedisAdapter implements ICacheAdapter {
  private client: Redis;
  private connected = false;

  constructor() {
    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      commandTimeout: 5000,
      connectTimeout: 10000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.connected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
      this.connected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
      this.connected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;
      logger.info('Redis adapter connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.connected = false;
      logger.info('Redis adapter disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error });
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Redis GET error', { key, error });
      throw error;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      logger.error('Redis SET error', { key, ttlSeconds, error });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Redis DELETE error', { key, error });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error', { key, error });
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.client.flushdb();
      logger.info('Redis cache cleared');
    } catch (error) {
      logger.error('Redis CLEAR error', { error });
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS error', { pattern, error });
      throw error;
    }
  }

  async increment(key: string, by = 1): Promise<number> {
    try {
      return await this.client.incrby(key, by);
    } catch (error) {
      logger.error('Redis INCREMENT error', { key, by, error });
      throw error;
    }
  }

  async decrement(key: string, by = 1): Promise<number> {
    try {
      return await this.client.decrby(key, by);
    } catch (error) {
      logger.error('Redis DECREMENT error', { key, by, error });
      throw error;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (error) {
      logger.error('Redis EXPIRE error', { key, ttlSeconds, error });
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Redis TTL error', { key, error });
      throw error;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  getClient(): Redis {
    return this.client;
  }
}

// Create and export singleton instance
export const redisAdapter = new RedisAdapter();