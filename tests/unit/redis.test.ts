import { RedisAdapter } from '@adapters/redis';

describe('RedisAdapter', () => {
  let redisAdapter: RedisAdapter;

  beforeEach(() => {
    redisAdapter = new RedisAdapter();
  });

  describe('Initialization', () => {
    it('should create RedisAdapter instance', () => {
      expect(redisAdapter).toBeInstanceOf(RedisAdapter);
      expect(redisAdapter.isConnected).toBe(false);
    });

    it('should have proper interface methods', () => {
      expect(typeof redisAdapter.connect).toBe('function');
      expect(typeof redisAdapter.disconnect).toBe('function');
      expect(typeof redisAdapter.get).toBe('function');
      expect(typeof redisAdapter.set).toBe('function');
      expect(typeof redisAdapter.delete).toBe('function');
      expect(typeof redisAdapter.exists).toBe('function');
      expect(typeof redisAdapter.clear).toBe('function');
      expect(typeof redisAdapter.keys).toBe('function');
      expect(typeof redisAdapter.increment).toBe('function');
      expect(typeof redisAdapter.decrement).toBe('function');
      expect(typeof redisAdapter.expire).toBe('function');
      expect(typeof redisAdapter.ttl).toBe('function');
    });
  });

  describe('Connection Management', () => {
    it('should handle connection gracefully when Redis is not available', async () => {
      // This test will attempt to connect to a non-existent Redis instance
      // It should not crash but should handle the error gracefully
      try {
        await redisAdapter.connect();
      } catch (error) {
        expect(error).toBeDefined();
        expect(redisAdapter.isConnected).toBe(false);
      }
    });

    it('should provide access to underlying client', () => {
      const client = redisAdapter.getClient();
      expect(client).toBeDefined();
      expect(typeof client.connect).toBe('function');
    });
  });

  afterEach(async () => {
    // Clean up any connections
    if (redisAdapter.isConnected) {
      await redisAdapter.disconnect();
    }
  });
});