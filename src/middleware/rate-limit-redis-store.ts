/**
 * @fileoverview Redis store implementation for express-rate-limit.
 * 
 * Provides distributed rate limiting across multiple server instances
 * using Redis as the backing store.
 * 
 * @module middleware/rate-limit-redis-store
 */

import { Store, Options, IncrementResponse } from 'express-rate-limit';
import { RedisAdapter } from '@adapters/redis';
import logger from '@utils/logger';

/**
 * Redis store configuration
 */
export interface RedisStoreOptions {
  windowMs: number;
  client: RedisAdapter;
  prefix?: string;
  resetExpiryOnChange?: boolean;
}

/**
 * Redis-backed store for rate limiting
 */
export class RedisStore implements Store {
  private windowMs: number;
  private client: RedisAdapter;
  private prefix: string;
  private resetExpiryOnChange: boolean;

  constructor(options: RedisStoreOptions) {
    this.windowMs = options.windowMs;
    this.client = options.client;
    this.prefix = options.prefix || 'rl:';
    this.resetExpiryOnChange = options.resetExpiryOnChange ?? false;
  }

  /**
   * Increment the count for a key
   */
  async increment(key: string): Promise<IncrementResponse> {
    const prefixedKey = this.prefix + key;
    const expiryMs = this.windowMs;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.client.getClient().pipeline();
      
      // Increment the key
      pipeline.incr(prefixedKey);
      
      // Set expiry only if key doesn't exist (first request in window)
      pipeline.expire(prefixedKey, Math.ceil(expiryMs / 1000), 'NX');
      
      // Get TTL for reset time calculation
      pipeline.pttl(prefixedKey);
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Redis pipeline execution failed');
      }

      const [[incrErr, totalHits], [expireErr], [ttlErr, ttl]] = results;

      if (incrErr || expireErr || ttlErr) {
        throw incrErr || expireErr || ttlErr;
      }

      // Calculate reset time
      const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : new Date(Date.now() + expiryMs);

      logger.debug('Rate limit incremented', {
        key: prefixedKey,
        totalHits,
        resetTime: resetTime.toISOString()
      });

      return {
        totalHits: totalHits as number,
        resetTime
      };
    } catch (error) {
      logger.error('Redis rate limit increment error', {
        key: prefixedKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Fallback to in-memory behavior
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs)
      };
    }
  }

  /**
   * Decrement the count for a key
   */
  async decrement(key: string): Promise<void> {
    const prefixedKey = this.prefix + key;

    try {
      const result = await this.client.getClient().decr(prefixedKey);
      
      // Don't let it go below 0
      if (result < 0) {
        await this.client.getClient().set(prefixedKey, '0', 'KEEPTTL');
      }

      logger.debug('Rate limit decremented', {
        key: prefixedKey,
        newValue: Math.max(0, result)
      });
    } catch (error) {
      logger.error('Redis rate limit decrement error', {
        key: prefixedKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Reset a key
   */
  async resetKey(key: string): Promise<void> {
    const prefixedKey = this.prefix + key;

    try {
      await this.client.getClient().del(prefixedKey);
      
      logger.debug('Rate limit key reset', {
        key: prefixedKey
      });
    } catch (error) {
      logger.error('Redis rate limit reset error', {
        key: prefixedKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Reset all keys (clear all rate limits)
   */
  async resetAll(): Promise<void> {
    try {
      // Use SCAN to find all rate limit keys
      const stream = this.client.getClient().scanStream({
        match: `${this.prefix}*`,
        count: 100
      });

      const pipeline = this.client.getClient().pipeline();
      let keyCount = 0;

      stream.on('data', (keys: string[]) => {
        if (keys.length) {
          keyCount += keys.length;
          keys.forEach(key => {
            pipeline.del(key);
          });
        }
      });

      stream.on('end', async () => {
        if (keyCount > 0) {
          await pipeline.exec();
          logger.info('Rate limit keys reset', { count: keyCount });
        }
      });

      stream.on('error', (error) => {
        logger.error('Redis scan error during reset', {
          error: error.message
        });
      });
    } catch (error) {
      logger.error('Redis rate limit reset all error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Initialize the store (required by interface but not needed for Redis)
   */
  async init?(_options: Options): Promise<void> {
    // Verify Redis connection
    try {
      await this.client.getClient().ping();
      logger.info('Redis rate limit store initialized');
    } catch (error) {
      logger.error('Redis rate limit store initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}