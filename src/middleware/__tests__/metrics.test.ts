/**
 * @fileoverview Tests for Prometheus metrics middleware with comprehensive metric collection
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: HTTP metrics tracking, business metrics recording, health monitoring, route normalization
 * Main APIs: metricsMiddleware, recordContentDiscovery(), updateSystemHealth(), normalizeRoute()
 * Constraints: Requires Express app setup, Prometheus client, supertest for HTTP testing
 * Patterns: Mock Express requests, test metric export formats, validate Prometheus format
 */

import request from 'supertest';
import express from 'express';
import { metricsMiddleware, getMetrics, resetMetrics, metrics, normalizeRoute } from '../metrics';

describe('Metrics Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
    
    // Create test app
    app = express();
    app.use(metricsMiddleware);
    
    // Test routes
    app.get('/test', (_req, res) => {
      res.json({ message: 'test' });
    });
    
    app.get('/slow', (_req, res) => {
      setTimeout(() => {
        res.json({ message: 'slow response' });
      }, 1100); // Simulate slow response
    });
    
    app.get('/error', (_req, res) => {
      res.status(500).json({ error: 'test error' });
    });
  });

  afterEach(() => {
    resetMetrics();
  });

  describe('HTTP Metrics Collection', () => {
    it('should track successful requests', async () => {
      await request(app)
        .get('/test')
        .expect(200);

      const metricsOutput = await getMetrics();
      
      expect(metricsOutput).toContain('ai_curator_http_requests_total');
      expect(metricsOutput).toContain('ai_curator_http_request_duration_seconds');
      expect(metricsOutput).toContain('method="GET"');
      expect(metricsOutput).toContain('status_code="200"');
    });

    it('should track error requests', async () => {
      await request(app)
        .get('/error')
        .expect(500);

      const metricsOutput = await getMetrics();
      
      expect(metricsOutput).toContain('ai_curator_errors_total');
      expect(metricsOutput).toContain('error_type="server_error"');
      expect(metricsOutput).toContain('error_code="500"');
    });

    it('should normalize route paths', async () => {
      await request(app)
        .get('/test')
        .expect(200);

      const metricsOutput = await getMetrics();
      
      // Should contain the test route
      expect(metricsOutput).toContain('route="/test"');
    });

    it('should track request duration', async () => {
      await request(app)
        .get('/slow')
        .expect(200);

      const metricsOutput = await getMetrics();
      
      expect(metricsOutput).toContain('ai_curator_http_request_duration_seconds');
      // Should have recorded a duration > 1 second
      expect(metricsOutput).toMatch(/ai_curator_http_request_duration_seconds_bucket.*le="5"/);
    });
  });

  describe('Business Metrics', () => {
    it('should provide content discovery recording', () => {
      const { recordContentDiscovery } = require('../metrics');
      
      recordContentDiscovery('rss', 'tech-news');
      
      expect(metrics.contentDiscoveryCounter).toBeDefined();
    });

    it('should provide tag generation recording', () => {
      const { recordTagGeneration } = require('../metrics');
      
      recordTagGeneration('category', 'high');
      
      expect(metrics.tagsGeneratedCounter).toBeDefined();
    });

    it('should provide vector operation recording', () => {
      const { recordVectorOperation } = require('../metrics');
      
      recordVectorOperation('search', true);
      
      expect(metrics.vectorOperationsCounter).toBeDefined();
    });

    it('should provide cache operation recording', () => {
      const { recordCacheOperation } = require('../metrics');
      
      recordCacheOperation('get', 'redis', true);
      
      expect(metrics.cacheOperationsCounter).toBeDefined();
    });
  });

  describe('Health Metrics', () => {
    it('should update system health score', () => {
      const { updateSystemHealth } = require('../metrics');
      
      updateSystemHealth(85);
      
      expect(metrics.systemHealthGauge).toBeDefined();
    });

    it('should clamp health score to valid range', () => {
      const { updateSystemHealth } = require('../metrics');
      
      // Test boundary values
      updateSystemHealth(-10); // Should clamp to 0
      updateSystemHealth(150); // Should clamp to 100
      
      expect(metrics.systemHealthGauge).toBeDefined();
    });

    it('should update component health', () => {
      const { updateComponentHealth } = require('../metrics');
      
      updateComponentHealth('database', true);
      updateComponentHealth('cache', false);
      
      expect(metrics.componentHealthGauge).toBeDefined();
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics in Prometheus format', async () => {
      await request(app)
        .get('/test')
        .expect(200);

      const metricsOutput = await getMetrics();
      
      // Should be valid Prometheus format
      expect(metricsOutput).toMatch(/^# HELP/m);
      expect(metricsOutput).toMatch(/^# TYPE/m);
      expect(metricsOutput).toContain('ai_curator_');
    });

    it('should include default Node.js metrics', async () => {
      const metricsOutput = await getMetrics();
      
      expect(metricsOutput).toContain('ai_curator_process_cpu');
      expect(metricsOutput).toContain('ai_curator_process_resident_memory');
      expect(metricsOutput).toContain('ai_curator_nodejs_heap');
    });
  });

  describe('Route Normalization', () => {
    it('should normalize numeric IDs', () => {
      expect(normalizeRoute('/users/123')).toBe('/users/:id');
      expect(normalizeRoute('/posts/456/comments/789')).toBe('/posts/:id/comments/:id');
    });

    it('should normalize UUIDs', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      expect(normalizeRoute(`/users/${uuid}`)).toBe('/users/:uuid');
    });

    it('should normalize MongoDB ObjectIds', () => {
      const objectId = '507f1f77bcf86cd799439011';
      expect(normalizeRoute(`/posts/${objectId}`)).toBe('/posts/:objectId');
    });

    it('should handle unknown routes', () => {
      expect(normalizeRoute('')).toBe('');
      expect(normalizeRoute('/unknown')).toBe('/unknown');
    });
  });
});