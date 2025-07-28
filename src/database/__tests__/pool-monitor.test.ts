/**
 * @fileoverview Tests for database connection pool monitoring
 * @lastmodified 2025-07-27T18:58:00Z
 * 
 * Features: Alert generation, threshold monitoring, dashboard data
 * Main APIs: PoolMonitor test suite  
 * Constraints: Mock Redis, controlled metric scenarios
 * Patterns: Unit tests, event testing, alert simulation
 */

import { PoolMonitor, MonitoringAlert } from '../pool-monitor';
import { PoolMetrics } from '../connection-pool';
import { createClient } from 'redis';

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    quit: jest.fn(),
    isOpen: false,
    zAdd: jest.fn(),
    expire: jest.fn(),
    zRangeByScore: jest.fn(),
    zRemRangeByScore: jest.fn(),
  })),
}));

// Mock connection pool
jest.mock('../connection-pool', () => ({
  getConnectionPool: jest.fn(() => ({
    getMetrics: jest.fn(),
    getSlowQueries: jest.fn(() => []),
    getFailedQueries: jest.fn(() => []),
    on: jest.fn(),
  })),
}));

describe('PoolMonitor', () => {
  let monitor: PoolMonitor;
  let mockRedisClient: any;
  let mockConnectionPool: any;

  const defaultMetrics: PoolMetrics = {
    totalConnections: 10,
    idleConnections: 5,
    activeConnections: 5,
    waitingClients: 0,
    totalQueries: 100,
    failedQueries: 2,
    averageQueryTime: 250,
    connectionErrors: 0,
    lastHealthCheck: new Date(),
    uptimeSeconds: 3600,
    poolStatus: 'healthy',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRedisClient = {
      connect: jest.fn(),
      quit: jest.fn(),
      isOpen: false,
      zAdd: jest.fn(),
      expire: jest.fn(),
      zRangeByScore: jest.fn(() => Promise.resolve([])),
      zRemRangeByScore: jest.fn(),
    };

    mockConnectionPool = {
      getMetrics: jest.fn(() => defaultMetrics),
      getSlowQueries: jest.fn(() => []),
      getFailedQueries: jest.fn(() => []),
      on: jest.fn(),
    };

    (createClient as jest.Mock).mockReturnValue(mockRedisClient);
    
    const { getConnectionPool } = require('../connection-pool');
    (getConnectionPool as jest.Mock).mockReturnValue(mockConnectionPool);

    monitor = new PoolMonitor({
      enabled: true,
      checkIntervalMs: 1000,
      thresholds: {
        maxConnectionUtilization: 0.8,
        maxAverageQueryTime: 500,
        maxErrorRate: 0.05,
        maxWaitingClients: 5,
        minHealthCheckSuccess: 0.8,
      },
    });
  });

  afterEach(async () => {
    await monitor.stop();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const newMonitor = new PoolMonitor();
      expect(newMonitor).toBeDefined();
    });

    it('should set up event handlers for connection pool', () => {
      expect(mockConnectionPool.on).toHaveBeenCalledWith('circuitBreakerOpened', expect.any(Function));
      expect(mockConnectionPool.on).toHaveBeenCalledWith('circuitBreakerClosed', expect.any(Function));
      expect(mockConnectionPool.on).toHaveBeenCalledWith('healthCheckFailed', expect.any(Function));
      expect(mockConnectionPool.on).toHaveBeenCalledWith('healthCheckPassed', expect.any(Function));
    });
  });

  describe('Alert Generation', () => {
    beforeEach(async () => {
      await monitor.start();
    });

    it('should create alert for high connection utilization', (done) => {
      const highUtilizationMetrics = {
        ...defaultMetrics,
        totalConnections: 10,
        activeConnections: 9, // 90% utilization
      };

      mockConnectionPool.getMetrics.mockReturnValue(highUtilizationMetrics);

      monitor.on('alert', (alert: MonitoringAlert) => {
        expect(alert.type).toBe('connection_shortage');
        expect(alert.severity).toBe('critical');
        expect(alert.message).toContain('High connection utilization');
        done();
      });

      // Trigger monitoring check
      (monitor as any).performMonitoringCheck();
    });

    it('should create alert for high average query time', (done) => {
      const slowQueryMetrics = {
        ...defaultMetrics,
        averageQueryTime: 1500, // Above 500ms threshold
      };

      mockConnectionPool.getMetrics.mockReturnValue(slowQueryMetrics);

      monitor.on('alert', (alert: MonitoringAlert) => {
        expect(alert.type).toBe('high_latency');
        expect(alert.severity).toBe('high');
        expect(alert.message).toContain('High average query time');
        done();
      });

      (monitor as any).performMonitoringCheck();
    });

    it('should create alert for high error rate', (done) => {
      const highErrorMetrics = {
        ...defaultMetrics,
        totalQueries: 100,
        failedQueries: 10, // 10% error rate
      };

      mockConnectionPool.getMetrics.mockReturnValue(highErrorMetrics);

      monitor.on('alert', (alert: MonitoringAlert) => {
        expect(alert.type).toBe('error_rate');
        expect(alert.severity).toBe('high');
        expect(alert.message).toContain('High query error rate');
        done();
      });

      (monitor as any).performMonitoringCheck();
    });

    it('should create alert for too many waiting clients', (done) => {
      const waitingClientsMetrics = {
        ...defaultMetrics,
        waitingClients: 15, // Above 5 threshold
      };

      mockConnectionPool.getMetrics.mockReturnValue(waitingClientsMetrics);

      monitor.on('alert', (alert: MonitoringAlert) => {
        expect(alert.type).toBe('connection_shortage');
        expect(alert.severity).toBe('high');
        expect(alert.message).toContain('High number of waiting clients');
        done();
      });

      (monitor as any).performMonitoringCheck();
    });
  });

  describe('Health Check Monitoring', () => {
    beforeEach(async () => {
      await monitor.start();
    });

    it('should track health check failures', () => {
      const healthCheckHandler = mockConnectionPool.on.mock.calls
        .find(call => call[0] === 'healthCheckFailed')?.[1];

      if (healthCheckHandler) {
        healthCheckHandler(new Error('Database unavailable'));
      }

      // Check that failure was recorded
      const lastChecks = (monitor as any).lastHealthChecks;
      expect(lastChecks[lastChecks.length - 1]).toBe(false);
    });

    it('should create alert for low health check success rate', (done) => {
      const healthCheckFailedHandler = mockConnectionPool.on.mock.calls
        .find(call => call[0] === 'healthCheckFailed')?.[1];

      if (healthCheckFailedHandler) {
        // Simulate multiple failures
        for (let i = 0; i < 8; i++) {
          healthCheckFailedHandler(new Error(`Failure ${i}`));
        }
      }

      monitor.on('alert', (alert: MonitoringAlert) => {
        if (alert.type === 'health_check_failed') {
          expect(alert.severity).toBe('critical');
          expect(alert.message).toContain('Low health check success rate');
          done();
        }
      });
    });

    it('should resolve health check alerts on success', () => {
      // First create some failures
      const healthCheckFailedHandler = mockConnectionPool.on.mock.calls
        .find(call => call[0] === 'healthCheckFailed')?.[1];
      
      if (healthCheckFailedHandler) {
        healthCheckFailedHandler(new Error('Failure'));
      }

      // Then simulate success
      const healthCheckPassedHandler = mockConnectionPool.on.mock.calls
        .find(call => call[0] === 'healthCheckPassed')?.[1];

      if (healthCheckPassedHandler) {
        healthCheckPassedHandler();
      }

      const lastChecks = (monitor as any).lastHealthChecks;
      expect(lastChecks[lastChecks.length - 1]).toBe(true);
    });
  });

  describe('Circuit Breaker Events', () => {
    beforeEach(async () => {
      await monitor.start();
    });

    it('should create alert when circuit breaker opens', (done) => {
      monitor.on('alert', (alert: MonitoringAlert) => {
        expect(alert.type).toBe('circuit_breaker');
        expect(alert.severity).toBe('critical');
        expect(alert.message).toContain('circuit breaker has opened');
        done();
      });

      const circuitBreakerHandler = mockConnectionPool.on.mock.calls
        .find(call => call[0] === 'circuitBreakerOpened')?.[1];

      if (circuitBreakerHandler) {
        circuitBreakerHandler();
      }
    });

    it('should resolve circuit breaker alerts when closed', () => {
      // First open circuit breaker
      const openHandler = mockConnectionPool.on.mock.calls
        .find(call => call[0] === 'circuitBreakerOpened')?.[1];
      
      if (openHandler) {
        openHandler();
      }

      // Then close it
      const closeHandler = mockConnectionPool.on.mock.calls
        .find(call => call[0] === 'circuitBreakerClosed')?.[1];

      if (closeHandler) {
        closeHandler();
      }

      // Check that alerts are resolved
      const activeAlerts = monitor.getActiveAlerts();
      const circuitBreakerAlerts = activeAlerts.filter(a => a.type === 'circuit_breaker');
      expect(circuitBreakerAlerts).toHaveLength(0);
    });
  });

  describe('Dashboard Data', () => {
    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      await monitor.start();
    });

    it('should generate comprehensive dashboard data', async () => {
      const dashboard = await monitor.getDashboard();

      expect(dashboard).toHaveProperty('currentMetrics');
      expect(dashboard).toHaveProperty('alerts');
      expect(dashboard).toHaveProperty('trends');
      expect(dashboard).toHaveProperty('slowQueries');
      expect(dashboard).toHaveProperty('failedQueries');
      expect(dashboard).toHaveProperty('recommendations');
    });

    it('should provide recommendations based on metrics', async () => {
      const highUtilizationMetrics = {
        ...defaultMetrics,
        totalConnections: 10,
        activeConnections: 9,
        averageQueryTime: 1500,
        waitingClients: 8,
      };

      mockConnectionPool.getMetrics.mockReturnValue(highUtilizationMetrics);

      const dashboard = await monitor.getDashboard();
      const recommendations = dashboard.recommendations;

      expect(recommendations).toContain('Consider increasing the maximum pool size to handle high connection demand');
      expect(recommendations).toContain('Review slow queries and consider adding database indexes or query optimization');
      expect(recommendations).toContain('High number of waiting clients suggests need for connection pool tuning');
    });

    it('should indicate healthy status when no issues', async () => {
      const dashboard = await monitor.getDashboard();
      const recommendations = dashboard.recommendations;

      expect(recommendations).toContain('Database pool is operating within normal parameters');
    });
  });

  describe('Alert Management', () => {
    beforeEach(async () => {
      await monitor.start();
    });

    it('should retrieve active alerts', () => {
      // Create a test alert
      (monitor as any).createAlert({
        type: 'connection_shortage',
        severity: 'high',
        message: 'Test alert',
      });

      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].type).toBe('connection_shortage');
      expect(activeAlerts[0].resolved).toBe(false);
    });

    it('should manually resolve alerts', () => {
      // Create a test alert
      (monitor as any).createAlert({
        type: 'high_latency',
        severity: 'medium',
        message: 'Test alert',
      });

      const activeAlerts = monitor.getActiveAlerts();
      const alertId = activeAlerts[0].id;

      const resolved = monitor.resolveAlert(alertId);
      expect(resolved).toBe(true);

      const updatedAlerts = monitor.getActiveAlerts();
      expect(updatedAlerts).toHaveLength(0);
    });

    it('should return false when resolving non-existent alert', () => {
      const resolved = monitor.resolveAlert('non-existent-id');
      expect(resolved).toBe(false);
    });
  });

  describe('Redis Integration', () => {
    beforeEach(async () => {
      mockRedisClient.isOpen = true;
      await monitor.start();
    });

    it('should store metrics in Redis', async () => {
      await (monitor as any).storeMetrics(defaultMetrics);

      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        'pool_monitor:metrics',
        expect.arrayContaining([
          expect.objectContaining({
            score: expect.any(Number),
            value: expect.any(String),
          }),
        ])
      );
    });

    it('should handle Redis connection failures gracefully', async () => {
      mockRedisClient.isOpen = false;
      
      // Should not throw error
      await expect((monitor as any).storeMetrics(defaultMetrics)).resolves.toBeUndefined();
    });

    it('should retrieve trends from Redis', async () => {
      const mockMetrics = [
        JSON.stringify({
          timestamp: Date.now() - 3600000,
          averageQueryTime: 200,
          totalConnections: 10,
          activeConnections: 5,
          totalQueries: 50,
          failedQueries: 1,
        }),
        JSON.stringify({
          timestamp: Date.now(),
          averageQueryTime: 300,
          totalConnections: 10,
          activeConnections: 6,
          totalQueries: 60,
          failedQueries: 2,
        }),
      ];

      mockRedisClient.zRangeByScore.mockResolvedValue(mockMetrics);

      const trends = await (monitor as any).getTrends();

      expect(trends.queryTimes).toHaveLength(2);
      expect(trends.connectionUtilization).toHaveLength(2);
      expect(trends.errorRates).toHaveLength(2);
    });
  });

  describe('Lifecycle Management', () => {
    it('should start monitoring when enabled', async () => {
      await monitor.start();
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should handle Redis connection failure on start', async () => {
      mockRedisClient.connect.mockRejectedValue(new Error('Redis unavailable'));
      
      // Should not throw error
      await expect(monitor.start()).resolves.toBeUndefined();
    });

    it('should stop monitoring gracefully', async () => {
      await monitor.start();
      await monitor.stop();
      
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should not start if disabled', async () => {
      const disabledMonitor = new PoolMonitor({ enabled: false });
      await disabledMonitor.start();
      
      expect(mockRedisClient.connect).not.toHaveBeenCalled();
    });

    it('should prevent multiple starts', async () => {
      await monitor.start();
      await monitor.start(); // Second start should be ignored
      
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    });
  });
});