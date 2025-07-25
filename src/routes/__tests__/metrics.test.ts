/**
 * @fileoverview Tests for metrics endpoint routes
 */

import request from 'supertest';
import express from 'express';
import { metricsRouter } from '../metrics';
import { resetMetrics } from '@middleware/metrics';

// Mock config
jest.mock('@config/index', () => ({
  config: {
    nodeEnv: 'test'
  }
}));

// Mock logger
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('Metrics Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    resetMetrics();
    
    app = express();
    app.use('/metrics', metricsRouter);
  });

  afterEach(() => {
    resetMetrics();
    jest.clearAllMocks();
  });

  describe('GET /metrics', () => {
    it('should return metrics in Prometheus format', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('ai_curator_');
    });

    it('should set correct Content-Type header', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
    });

    it('should handle metrics generation errors gracefully', async () => {
      // Mock getMetrics to throw an error
      const metricsModule = require('@middleware/metrics');
      const originalGetMetrics = metricsModule.getMetrics;
      metricsModule.getMetrics = jest.fn().mockRejectedValue(new Error('Metrics error'));

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to generate metrics',
        message: 'Metrics error'
      });

      // Restore original function
      metricsModule.getMetrics = originalGetMetrics;
    });
  });

  describe('GET /metrics/health', () => {
    it('should return healthy status when metrics system is working', async () => {
      const response = await request(app)
        .get('/metrics/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        message: 'Metrics system is operational'
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return unhealthy status when metrics system fails', async () => {
      // Mock getMetrics to throw an error
      const metricsModule = require('@middleware/metrics');
      const originalGetMetrics = metricsModule.getMetrics;
      metricsModule.getMetrics = jest.fn().mockRejectedValue(new Error('System failure'));

      const response = await request(app)
        .get('/metrics/health')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'unhealthy',
        message: 'Metrics system is not operational',
        error: 'System failure'
      });
      expect(response.body.timestamp).toBeDefined();

      // Restore original function
      metricsModule.getMetrics = originalGetMetrics;
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      // Mock production environment
      jest.doMock('@config/index', () => ({
        config: {
          nodeEnv: 'production'
        }
      }));
    });

    afterEach(() => {
      jest.dontMock('@config/index');
    });

    it('should log metrics access in production', async () => {
      const logger = require('@utils/logger');

      await request(app)
        .get('/metrics')
        .set('User-Agent', 'Prometheus/2.0')
        .expect(200);

      expect(logger.info).toHaveBeenCalledWith(
        'Metrics endpoint accessed',
        expect.objectContaining({
          userAgent: 'Prometheus/2.0',
          timestamp: expect.any(String)
        })
      );
    });

    it('should not expose error details in production', async () => {
      // Mock getMetrics to throw an error
      const metricsModule = require('@middleware/metrics');
      metricsModule.getMetrics = jest.fn().mockRejectedValue(new Error('Internal error'));

      const response = await request(app)
        .get('/metrics')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Failed to generate metrics'
        // message should be undefined in production
      });
    });
  });

  describe('Security Considerations', () => {
    it('should handle requests without user agent', async () => {
      await request(app)
        .get('/metrics')
        .expect(200);

      // Should not throw errors when user-agent is undefined
    });

    it('should handle malformed requests gracefully', async () => {
      await request(app)
        .get('/metrics')
        .set('X-Malformed-Header', 'invalid\r\nheader')
        .expect(200);
    });
  });

  describe('Metrics Content Validation', () => {
    it('should include standard HTTP metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('ai_curator_http_requests_total');
      expect(response.text).toContain('ai_curator_http_request_duration_seconds');
    });

    it('should include business metrics definitions', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('ai_curator_content_discovered_total');
      expect(response.text).toContain('ai_curator_tags_generated_total');
      expect(response.text).toContain('ai_curator_vector_operations_total');
    });

    it('should include system health metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('ai_curator_system_health');
      expect(response.text).toContain('ai_curator_component_health');
    });

    it('should include Node.js default metrics with prefix', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('ai_curator_process_cpu');
      expect(response.text).toContain('ai_curator_nodejs_heap');
    });
  });
});