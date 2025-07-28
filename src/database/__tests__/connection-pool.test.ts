/**
 * @fileoverview Tests for enhanced database connection pool
 * @lastmodified 2025-07-27T18:58:00Z
 * 
 * Features: Pool lifecycle, circuit breaker, monitoring, error handling
 * Main APIs: EnhancedConnectionPool test suite
 * Constraints: Mock database, controlled error scenarios
 * Patterns: Unit tests, integration tests, error simulation
 */

import { EnhancedConnectionPool, ConnectionPoolOptions } from '../connection-pool';
import { Pool, PoolClient } from 'pg';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
    options: {
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  })),
}));

describe('EnhancedConnectionPool', () => {
  let pool: EnhancedConnectionPool;
  let mockPgPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;

  const defaultOptions: ConnectionPoolOptions = {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    username: 'test_user',
    password: 'test_pass',
    ssl: false,
    poolSize: 10,
    connectionTimeout: 5000,
    queryTimeout: 30000,
    monitoringEnabled: false, // Disable for tests
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    mockPgPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0,
      options: {
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      },
    } as unknown as jest.Mocked<Pool>;

    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPgPool);
    
    pool = new EnhancedConnectionPool(defaultOptions);
  });

  afterEach(async () => {
    if (pool) {
      await pool.close();
    }
  });

  describe('Pool Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          user: 'test_user',
          password: 'test_pass',
          ssl: false,
          min: 2,
          max: 10,
        })
      );
    });

    it('should set up event handlers', () => {
      expect(mockPgPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPgPool.on).toHaveBeenCalledWith('acquire', expect.any(Function));
      expect(mockPgPool.on).toHaveBeenCalledWith('remove', expect.any(Function));
      expect(mockPgPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should initialize metrics correctly', () => {
      const metrics = pool.getMetrics();
      expect(metrics).toMatchObject({
        totalConnections: 5,
        idleConnections: 3,
        activeConnections: 2,
        waitingClients: 0,
        totalQueries: 0,
        failedQueries: 0,
        averageQueryTime: 0,
        connectionErrors: 0,
        poolStatus: 'healthy',
      });
    });
  });

  describe('Query Execution', () => {
    it('should execute queries successfully', async () => {
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 };
      mockPgPool.query.mockResolvedValue(mockResult);

      const result = await pool.query('SELECT * FROM users');

      expect(mockPgPool.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result).toEqual(mockResult);
    });

    it('should execute queries with parameters', async () => {
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 };
      mockPgPool.query.mockResolvedValue(mockResult);

      const result = await pool.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPgPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result).toEqual(mockResult);
    });

    it('should update metrics on successful queries', async () => {
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 };
      mockPgPool.query.mockResolvedValue(mockResult);

      await pool.query('SELECT * FROM users');

      const metrics = pool.getMetrics();
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.failedQueries).toBe(0);
      expect(metrics.averageQueryTime).toBeGreaterThan(0);
    });

    it('should handle query errors and update metrics', async () => {
      const error = new Error('Query failed');
      mockPgPool.query.mockRejectedValue(error);

      await expect(pool.query('INVALID SQL')).rejects.toThrow('Query failed');

      const metrics = pool.getMetrics();
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.failedQueries).toBe(1);
    });

    it('should reject queries when circuit breaker is open', async () => {
      // Simulate multiple errors to trigger circuit breaker
      const error = new Error('Connection failed');
      mockPgPool.query.mockRejectedValue(error);

      // Create pool with low threshold for testing
      const testPool = new EnhancedConnectionPool({
        ...defaultOptions,
        circuitBreakerThreshold: 2,
        monitoringEnabled: false,
      });

      // Generate enough errors to open circuit breaker
      await expect(testPool.query('SELECT 1')).rejects.toThrow();
      await expect(testPool.query('SELECT 1')).rejects.toThrow();

      // Trigger error event to simulate connection errors
      const errorHandler = mockPgPool.on.mock.calls.find(call => call[0] === 'error')?.[1];
      if (errorHandler) {
        errorHandler(error);
        errorHandler(error);
        errorHandler(error);
      }

      // Next query should be rejected due to circuit breaker
      await expect(testPool.query('SELECT 1')).rejects.toThrow('circuit breaker is open');

      await testPool.close();
    });
  });

  describe('Transaction Handling', () => {
    it('should execute transactions successfully', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockClient.query.mockResolvedValue(mockResult);

      const result = await pool.withTransaction(async (client) => {
        await client.query('INSERT INTO users (name) VALUES ($1)', ['John']);
        return { success: true };
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO users (name) VALUES ($1)', ['John']);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should rollback transactions on error', async () => {
      const error = new Error('Transaction failed');
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(error); // Failed query

      await expect(
        pool.withTransaction(async (client) => {
          await client.query('INVALID SQL');
        })
      ).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Health Checks', () => {
    it('should pass health check when database is available', async () => {
      mockPgPool.query.mockResolvedValue({ rows: [{ health: 1 }], rowCount: 1 });

      const isHealthy = await pool.checkHealth();

      expect(isHealthy).toBe(true);
      expect(mockPgPool.query).toHaveBeenCalledWith('SELECT 1 as health, NOW() as timestamp');
    });

    it('should fail health check when database is unavailable', async () => {
      mockPgPool.query.mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await pool.checkHealth();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Circuit Breaker', () => {
    let testPool: EnhancedConnectionPool;

    beforeEach(() => {
      testPool = new EnhancedConnectionPool({
        ...defaultOptions,
        circuitBreakerThreshold: 2,
        enableAutoRecovery: false,
        monitoringEnabled: false,
      });
    });

    afterEach(async () => {
      await testPool.close();
    });

    it('should open circuit breaker after threshold errors', (done) => {
      testPool.on('circuitBreakerOpened', () => {
        const metrics = testPool.getMetrics();
        expect(metrics.poolStatus).toBe('degraded');
        done();
      });

      // Simulate connection errors
      const errorHandler = mockPgPool.on.mock.calls.find(call => call[0] === 'error')?.[1];
      if (errorHandler) {
        errorHandler(new Error('Error 1'));
        errorHandler(new Error('Error 2'));
        errorHandler(new Error('Error 3')); // Should trigger circuit breaker
      }
    });

    it('should allow manual circuit breaker reset', () => {
      // Open circuit breaker
      const errorHandler = mockPgPool.on.mock.calls.find(call => call[0] === 'error')?.[1];
      if (errorHandler) {
        errorHandler(new Error('Error 1'));
        errorHandler(new Error('Error 2'));
        errorHandler(new Error('Error 3'));
      }

      testPool.resetCircuitBreaker();

      const metrics = testPool.getMetrics();
      expect(metrics.connectionErrors).toBe(0);
    });
  });

  describe('Query History and Analysis', () => {
    beforeEach(async () => {
      // Execute some test queries
      mockPgPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Fast query
        .mockImplementationOnce(() => new Promise(resolve => 
          setTimeout(() => resolve({ rows: [], rowCount: 0 }), 100)
        )) // Slow query
        .mockRejectedValueOnce(new Error('Failed query')); // Failed query

      await pool.query('SELECT 1');
      
      try {
        await pool.query('SELECT * FROM large_table');
      } catch {
        // Expected slow query
      }

      try {
        await pool.query('INVALID SQL');
      } catch {
        // Expected failure
      }
    });

    it('should track query history', () => {
      const history = pool.getQueryHistory();
      expect(history).toHaveLength(3);
      expect(history[0].query).toContain('SELECT 1');
      expect(history[0].success).toBe(true);
    });

    it('should identify slow queries', () => {
      const slowQueries = pool.getSlowQueries(50); // 50ms threshold
      expect(slowQueries.length).toBeGreaterThanOrEqual(1);
      expect(slowQueries[0].duration).toBeGreaterThan(50);
    });

    it('should track failed queries', () => {
      const failedQueries = pool.getFailedQueries();
      expect(failedQueries.length).toBeGreaterThanOrEqual(1);
      expect(failedQueries[0].success).toBe(false);
      expect(failedQueries[0].error).toBeDefined();
    });
  });

  describe('Pool Lifecycle', () => {
    it('should close pool gracefully', async () => {
      await pool.close();
      expect(mockPgPool.end).toHaveBeenCalled();
    });

    it('should handle close errors', async () => {
      mockPgPool.end.mockRejectedValue(new Error('Close failed'));
      
      await expect(pool.close()).rejects.toThrow('Close failed');
    });

    it('should provide access to underlying pool', () => {
      const underlyingPool = pool.getUnderlyingPool();
      expect(underlyingPool).toBe(mockPgPool);
    });
  });

  describe('Client Management', () => {
    it('should provide client access for advanced operations', async () => {
      const client = await pool.getClient();
      expect(client).toBe(mockClient);
      expect(mockPgPool.connect).toHaveBeenCalled();
    });

    it('should reject client requests when circuit breaker is open', async () => {
      // Open circuit breaker
      const errorHandler = mockPgPool.on.mock.calls.find(call => call[0] === 'error')?.[1];
      if (errorHandler) {
        for (let i = 0; i < 6; i++) {
          errorHandler(new Error(`Error ${i}`));
        }
      }

      await expect(pool.getClient()).rejects.toThrow('circuit breaker is open');
    });
  });

  describe('Event Emission', () => {
    it('should emit events for pool lifecycle', (done) => {
      let eventsReceived = 0;
      const expectedEvents = ['clientConnected', 'clientAcquired', 'clientRemoved'];

      expectedEvents.forEach(event => {
        pool.on(event, () => {
          eventsReceived++;
          if (eventsReceived === expectedEvents.length) {
            done();
          }
        });
      });

      // Simulate events
      const connectHandler = mockPgPool.on.mock.calls.find(call => call[0] === 'connect')?.[1];
      const acquireHandler = mockPgPool.on.mock.calls.find(call => call[0] === 'acquire')?.[1];
      const removeHandler = mockPgPool.on.mock.calls.find(call => call[0] === 'remove')?.[1];

      if (connectHandler) connectHandler(mockClient);
      if (acquireHandler) acquireHandler(mockClient);
      if (removeHandler) removeHandler(mockClient);
    });
  });
});