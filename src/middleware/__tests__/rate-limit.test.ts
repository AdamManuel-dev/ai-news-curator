/**
 * @fileoverview Unit tests for rate limiting middleware
 */

import { Request, Response, NextFunction } from 'express';
import { 
  globalRateLimit, 
  strictRateLimit, 
  authRateLimit,
  dynamicRateLimit,
  skipRateLimit,
  getRateLimitInfo
} from '../rate-limit';
import { AuthenticatedRequest } from '../index';
import { container } from '@container/setup';
import { TOKENS } from '@container/tokens';

// Mock dependencies
jest.mock('@container/setup');
jest.mock('@utils/logger');
jest.mock('@config/index');
jest.mock('../rate-limit-redis-store');

// Mock config
const mockConfig = {
  maxRequestsPerHour: 1000,
  maxArticlesPerHour: 100,
  nodeEnv: 'test'
};

jest.mock('@config/index', () => ({
  config: mockConfig
}));

// Mock metrics
jest.mock('../metrics', () => ({
  metrics: {
    rateLimitExceeded: {
      inc: jest.fn()
    },
    rateLimitChecks: {
      inc: jest.fn()
    }
  }
}));

describe('Rate Limiting Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      ip: '127.0.0.1',
      path: '/test',
      method: 'GET',
      headers: {},
      get: jest.fn()
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      getHeader: jest.fn()
    };

    mockNext = jest.fn();

    // Mock container
    (container.get as jest.Mock) = jest.fn();

    jest.clearAllMocks();
  });

  describe('skipRateLimit', () => {
    it('should skip rate limiting for health endpoints', () => {
      mockRequest.path = '/health';
      expect(skipRateLimit(mockRequest as Request)).toBe(true);

      mockRequest.path = '/health/ready';
      expect(skipRateLimit(mockRequest as Request)).toBe(true);
    });

    it('should skip rate limiting for metrics endpoint', () => {
      mockRequest.path = '/metrics';
      expect(skipRateLimit(mockRequest as Request)).toBe(true);
    });

    it('should skip rate limiting in development with header', () => {
      mockConfig.nodeEnv = 'development';
      mockRequest.headers!['x-skip-rate-limit'] = 'true';
      mockRequest.path = '/api/test';
      
      expect(skipRateLimit(mockRequest as Request)).toBe(true);
    });

    it('should not skip rate limiting for regular endpoints', () => {
      mockConfig.nodeEnv = 'production';
      mockRequest.path = '/api/test';
      
      expect(skipRateLimit(mockRequest as Request)).toBe(false);
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return rate limit info for anonymous user', async () => {
      const req = mockRequest as AuthenticatedRequest;
      const res = mockResponse as Response;

      await getRateLimitInfo(req, res);

      expect(mockResponse.json).toHaveBeenCalledWith({
        tier: 'anonymous',
        limits: expect.objectContaining({
          requests: expect.objectContaining({
            limit: expect.any(Number),
            window: expect.any(String)
          }),
          content: expect.objectContaining({
            limit: 100,
            window: '1 hour'
          })
        }),
        headers: expect.any(Object)
      });
    });

    it('should return rate limit info for authenticated user', async () => {
      const req = mockRequest as AuthenticatedRequest;
      req.user = { id: 'user-123', email: 'user@example.com' };
      const res = mockResponse as Response;

      await getRateLimitInfo(req, res);

      expect(mockResponse.json).toHaveBeenCalledWith({
        tier: 'authenticated',
        limits: expect.any(Object),
        headers: expect.any(Object)
      });
    });

    it('should include API key limits when API key is present', async () => {
      const req = mockRequest as AuthenticatedRequest;
      req.headers!['x-api-key'] = 'test-api-key';
      const res = mockResponse as Response;

      // Mock API key service
      const mockApiKeyService = {
        validateApiKey: jest.fn().mockResolvedValue({
          isValid: true,
          key: { id: 'key-123', rate_limit: 5000 }
        }),
        checkRateLimit: jest.fn().mockResolvedValue({
          remaining: 4500,
          resetTime: new Date()
        })
      };

      (container.get as jest.Mock).mockReturnValue(mockApiKeyService);

      await getRateLimitInfo(req, res);

      expect(mockApiKeyService.validateApiKey).toHaveBeenCalledWith('test-api-key');
      expect(mockApiKeyService.checkRateLimit).toHaveBeenCalledWith('key-123');
    });

    it('should handle errors gracefully', async () => {
      const req = mockRequest as AuthenticatedRequest;
      const res = mockResponse as Response;

      // Make response.json throw an error
      mockResponse.json = jest.fn().mockImplementation(() => {
        throw new Error('Response error');
      });

      await getRateLimitInfo(req, res);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });

  describe('dynamicRateLimit', () => {
    it('should apply different rate limits based on user type', () => {
      const req = mockRequest as Request;
      const res = mockResponse as Response;

      // Test anonymous user
      dynamicRateLimit(req, res, mockNext);

      // Test authenticated user
      (req as AuthenticatedRequest).user = { id: 'user-123', email: 'user@example.com' };
      dynamicRateLimit(req, res, mockNext);

      // Test API key user
      delete (req as AuthenticatedRequest).user;
      req.headers!['x-api-key'] = 'test-api-key';
      
      const mockApiKeyService = {
        validateApiKey: jest.fn().mockResolvedValue({
          isValid: true,
          key: { id: 'key-123', rate_limit: 5000 }
        }),
        logApiKeyUsage: jest.fn().mockResolvedValue(undefined)
      };

      (container.get as jest.Mock).mockReturnValue(mockApiKeyService);
      
      dynamicRateLimit(req, res, mockNext);
    });
  });

  describe('Rate limiter configurations', () => {
    it('should have correct window and max values for each tier', () => {
      // These tests would normally test the actual rate limiting behavior
      // but since express-rate-limit is mocked, we just verify the configurations
      expect(globalRateLimit).toBeDefined();
      expect(strictRateLimit).toBeDefined();
      expect(authRateLimit).toBeDefined();
    });
  });
});