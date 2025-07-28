/**
 * @fileoverview Database connection pool monitoring API endpoints
 * @lastmodified 2025-07-27T18:58:00Z
 * 
 * Features: Pool metrics, alerts, dashboard data, manual controls
 * Main APIs: GET /pool/metrics, GET /pool/dashboard, POST /pool/reset
 * Constraints: Admin role required, rate limiting applied
 * Patterns: REST API, role-based access, comprehensive monitoring data
 */

import { Router, Request, Response } from 'express';
import { getConnectionPool } from '@database/connection-pool';
import { getPoolMonitor } from '@database/pool-monitor';
import { requirePermission } from '@middleware/rbac';
import { rateLimitMiddleware } from '@middleware/rate-limit';
import logger from '@utils/logger';

const router = Router();

/**
 * Get current pool metrics
 */
router.get('/metrics', 
  requirePermission('system:read'),
  rateLimitMiddleware.api,
  async (req: Request, res: Response) => {
    try {
      const pool = getConnectionPool();
      const metrics = pool.getMetrics();
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get pool metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve pool metrics',
        code: 'POOL_METRICS_ERROR',
      });
    }
  }
);

/**
 * Get comprehensive dashboard data
 */
router.get('/dashboard',
  requirePermission('system:read'),
  rateLimitMiddleware.api,
  async (req: Request, res: Response) => {
    try {
      const monitor = getPoolMonitor();
      const dashboard = await monitor.getDashboard();
      
      res.json({
        success: true,
        data: dashboard,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get pool dashboard', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve pool dashboard',
        code: 'POOL_DASHBOARD_ERROR',
      });
    }
  }
);

/**
 * Get slow queries
 */
router.get('/slow-queries',
  requirePermission('system:read'),
  rateLimitMiddleware.api,
  async (req: Request, res: Response) => {
    try {
      const { threshold = 1000, limit = 50 } = req.query;
      const pool = getConnectionPool();
      
      const slowQueries = pool.getSlowQueries(
        Number(threshold),
        Number(limit)
      );
      
      res.json({
        success: true,
        data: {
          queries: slowQueries,
          threshold: Number(threshold),
          count: slowQueries.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get slow queries', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve slow queries',
        code: 'SLOW_QUERIES_ERROR',
      });
    }
  }
);

/**
 * Get failed queries
 */
router.get('/failed-queries',
  requirePermission('system:read'),
  rateLimitMiddleware.api,
  async (req: Request, res: Response) => {
    try {
      const { limit = 50 } = req.query;
      const pool = getConnectionPool();
      
      const failedQueries = pool.getFailedQueries(Number(limit));
      
      res.json({
        success: true,
        data: {
          queries: failedQueries,
          count: failedQueries.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get failed queries', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve failed queries',
        code: 'FAILED_QUERIES_ERROR',
      });
    }
  }
);

/**
 * Get query history
 */
router.get('/query-history',
  requirePermission('system:read'),
  rateLimitMiddleware.api,
  async (req: Request, res: Response) => {
    try {
      const { limit = 100 } = req.query;
      const pool = getConnectionPool();
      
      const queryHistory = pool.getQueryHistory(Number(limit));
      
      res.json({
        success: true,
        data: {
          queries: queryHistory,
          count: queryHistory.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get query history', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve query history',
        code: 'QUERY_HISTORY_ERROR',
      });
    }
  }
);

/**
 * Get active alerts
 */
router.get('/alerts',
  requirePermission('system:read'),
  rateLimitMiddleware.api,
  async (req: Request, res: Response) => {
    try {
      const monitor = getPoolMonitor();
      const alerts = monitor.getActiveAlerts();
      
      res.json({
        success: true,
        data: {
          alerts,
          count: alerts.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get alerts', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve alerts',
        code: 'ALERTS_ERROR',
      });
    }
  }
);

/**
 * Perform manual health check
 */
router.post('/health-check',
  requirePermission('system:write'),
  rateLimitMiddleware.expensive,
  async (req: Request, res: Response) => {
    try {
      const pool = getConnectionPool();
      const isHealthy = await pool.checkHealth();
      const metrics = pool.getMetrics();
      
      res.json({
        success: true,
        data: {
          healthy: isHealthy,
          status: metrics.poolStatus,
          metrics,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Manual health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        code: 'HEALTH_CHECK_ERROR',
      });
    }
  }
);

/**
 * Reset circuit breaker
 */
router.post('/reset-circuit-breaker',
  requirePermission('system:write'),
  rateLimitMiddleware.expensive,
  async (req: Request, res: Response) => {
    try {
      const pool = getConnectionPool();
      pool.resetCircuitBreaker();
      
      logger.info('Circuit breaker manually reset', {
        adminUser: req.user?.id,
        timestamp: new Date().toISOString(),
      });
      
      res.json({
        success: true,
        message: 'Circuit breaker has been reset',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to reset circuit breaker', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUser: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to reset circuit breaker',
        code: 'CIRCUIT_BREAKER_RESET_ERROR',
      });
    }
  }
);

/**
 * Resolve an alert
 */
router.post('/alerts/:alertId/resolve',
  requirePermission('system:write'),
  rateLimitMiddleware.api,
  async (req: Request, res: Response) => {
    try {
      const { alertId } = req.params;
      const monitor = getPoolMonitor();
      
      const resolved = monitor.resolveAlert(alertId);
      
      if (resolved) {
        logger.info('Alert manually resolved', {
          alertId,
          adminUser: req.user?.id,
          timestamp: new Date().toISOString(),
        });
        
        res.json({
          success: true,
          message: 'Alert has been resolved',
          alertId,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Alert not found or already resolved',
          code: 'ALERT_NOT_FOUND',
        });
      }
    } catch (error) {
      logger.error('Failed to resolve alert', {
        alertId: req.params.alertId,
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUser: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to resolve alert',
        code: 'ALERT_RESOLVE_ERROR',
      });
    }
  }
);

/**
 * Get pool connection details (for debugging)
 */
router.get('/connections',
  requirePermission('system:admin'),
  rateLimitMiddleware.expensive,
  async (req: Request, res: Response) => {
    try {
      const pool = getConnectionPool();
      const underlyingPool = pool.getUnderlyingPool();
      
      // Get basic pool information
      const poolInfo = {
        totalCount: underlyingPool.totalCount,
        idleCount: underlyingPool.idleCount,
        waitingCount: underlyingPool.waitingCount,
        options: {
          max: underlyingPool.options.max,
          min: underlyingPool.options.min,
          idleTimeoutMillis: underlyingPool.options.idleTimeoutMillis,
          connectionTimeoutMillis: underlyingPool.options.connectionTimeoutMillis,
        },
      };
      
      res.json({
        success: true,
        data: poolInfo,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get connection details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminUser: req.user?.id,
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve connection details',
        code: 'CONNECTION_DETAILS_ERROR',
      });
    }
  }
);

export default router;