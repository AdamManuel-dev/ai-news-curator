/**
 * @fileoverview Integration tests for Express application endpoints
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Health check endpoint testing, root API info testing, 404 handling, security headers validation
 * Main APIs: GET /health, GET /, 404 handler tests, security middleware tests
 * Constraints: Requires running Express app, uses supertest for HTTP assertions
 * Patterns: Uses Jest test framework, mocks Express app, validates response schemas
 */

import request from 'supertest';
import { app } from '../../src/index';

describe('Express App', () => {
  describe('GET /health', () => {
    it('should return 200 and health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
          version: '1.0.0',
          environment: 'test',
          dependencies: {
            redis: {
              status: expect.stringMatching(/^(connected|disconnected|error)$/),
            },
            memory: {
              percentage: expect.any(Number),
            },
          },
          checks: expect.arrayContaining([
            expect.objectContaining({
              name: 'redis',
              status: expect.stringMatching(/^(pass|fail|warn)$/),
            }),
            expect.objectContaining({
              name: 'memory',
              status: expect.stringMatching(/^(pass|fail|warn)$/),
            }),
          ]),
        },
      });
      expect(response.body.data.timestamp).toBeDefined();
      expect(response.body.data.uptime).toBeDefined();
    });
  });

  describe('GET /', () => {
    it('should return 200 and API info', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'AI Content Curator Agent API',
        version: '1.0.0',
        environment: 'test',
      });
    });
  });

  describe('GET /nonexistent', () => {
    it('should return 404', async () => {
      const response = await request(app)
        .get('/nonexistent')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Cannot GET /nonexistent',
      });
      expect(response.body.requestId).toBeDefined();
    });
  });

  describe('Security headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for security headers set by helmet
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });
  });
});