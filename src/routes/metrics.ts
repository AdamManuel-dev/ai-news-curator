/**
 * @fileoverview Prometheus metrics endpoint for monitoring
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Prometheus format metrics, metrics health check
 * Main APIs: GET /metrics, GET /metrics/health
 * Constraints: Should be protected in production, IP whitelist recommended
 * Patterns: Prometheus exposition format, access logging in production
 */

import { Router, Request, Response } from 'express';
import { getMetrics } from '@middleware/metrics';
import logger from '@utils/logger';
import { config } from '@config/index';

const router = Router();

/**
 * GET /metrics
 * 
 * Returns application metrics in Prometheus exposition format.
 * 
 * Security considerations:
 * - In production, this endpoint should be protected (IP whitelist, auth, etc.)
 * - Consider exposing on a separate port for internal access only
 * - Metrics may contain sensitive information about system internals
 * 
 * @route GET /metrics
 * @returns {string} Prometheus formatted metrics
 * @access Internal/Monitoring Systems Only
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Log metrics access in production for security auditing
    if (config.nodeEnv === 'production') {
      logger.info('Metrics endpoint accessed', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString()
      });
    }

    // Get metrics in Prometheus format
    const metrics = await getMetrics();
    
    // Set appropriate content type for Prometheus
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', { error });
    res.status(500).json({ 
      error: 'Failed to generate metrics',
      message: config.nodeEnv === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * GET /metrics/health
 * 
 * Simple health check for the metrics system itself.
 * Useful for monitoring the monitoring system.
 * 
 * @route GET /metrics/health
 * @returns {object} Health status of metrics system
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    // Try to get metrics to ensure system is working
    await getMetrics();
    
    res.json({
      status: 'healthy',
      message: 'Metrics system is operational',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Metrics system health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      message: 'Metrics system is not operational',
      error: config.nodeEnv === 'development' ? (error as Error).message : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

export const metricsRouter = router;