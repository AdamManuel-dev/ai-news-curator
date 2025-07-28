/**
 * @fileoverview Unit tests for authentication middleware with JWT and API key validation
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: JWT authentication, optional JWT auth, API key validation, role-based access control
 * Main APIs: authenticateJWT(), optionalAuthenticateJWT(), authenticateAPIKey(), requireRole()
 * Constraints: Requires OAuth service mock, container dependency injection, Express mocks
 * Patterns: Mock middleware functions, test auth headers, validate error responses
 */

import { Response, NextFunction } from 'express';
import { authenticateJWT, optionalAuthenticateJWT, authenticateAPIKey, requireRole } from '../auth';
import { container } from '@container/setup';
import { OAuthService } from '@services/auth/oauth';
import { AuthenticatedRequest } from '../index';

// Mock dependencies
jest.mock('@container/setup');
jest.mock('@utils/logger');

describe('Authentication Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockOAuthService: jest.Mocked<OAuthService>;

  beforeEach(() => {
    mockRequest = {
      headers: {
        authorization: undefined
      } as any,
      path: '/test',
      ip: '127.0.0.1'
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn()
    };

    mockNext = jest.fn();

    mockOAuthService = {
      verifyAccessToken: jest.fn(),
      generateAuthUrl: jest.fn(),
      exchangeCodeForToken: jest.fn(),
      fetchUserInfo: jest.fn(),
      authenticateUser: jest.fn(),
      refreshAccessToken: jest.fn(),
      getAvailableProviders: jest.fn()
    } as any;

    // Mock container resolution
    (container.get as jest.Mock) = jest.fn().mockReturnValue(mockOAuthService);

    jest.clearAllMocks();
  });

  describe('authenticateJWT', () => {
    it('should authenticate valid JWT token', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'user@example.com'
      };

      (mockRequest.headers as any).authorization = 'Bearer valid-token';
      mockOAuthService.verifyAccessToken.mockResolvedValue(mockUser as any);

      await authenticateJWT(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toEqual({
        id: 'user-id',
        email: 'user@example.com'
      });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      await authenticateJWT(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authorization header required',
        code: 'MISSING_AUTH_HEADER'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid authorization format', async () => {
      (mockRequest.headers as any).authorization = 'Invalid format';

      await authenticateJWT(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid authorization format. Use: Bearer <token>',
        code: 'INVALID_AUTH_FORMAT'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid JWT token', async () => {
      (mockRequest.headers as any).authorization = 'Bearer invalid-token';
      mockOAuthService.verifyAccessToken.mockRejectedValue(new Error('Invalid token'));

      await authenticateJWT(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuthenticateJWT', () => {
    it('should authenticate valid token when provided', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'user@example.com'
      };

      (mockRequest.headers as any).authorization = 'Bearer valid-token';
      mockOAuthService.verifyAccessToken.mockResolvedValue(mockUser as any);

      await optionalAuthenticateJWT(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toEqual({
        id: 'user-id',
        email: 'user@example.com'
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without authentication when no token provided', async () => {
      await optionalAuthenticateJWT(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should continue without authentication when invalid token provided', async () => {
      (mockRequest.headers as any).authorization = 'Bearer invalid-token';
      mockOAuthService.verifyAccessToken.mockRejectedValue(new Error('Invalid token'));

      await optionalAuthenticateJWT(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('authenticateAPIKey', () => {
    it('should reject request without API key header', async () => {
      await authenticateAPIKey(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'API key required',
        code: 'MISSING_API_KEY'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      (mockRequest.headers as any)['x-api-key'] = 'invalid-key';

      await authenticateAPIKey(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should reject unauthenticated request', async () => {
      const middleware = requireRole(['admin']);

      await middleware(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject user without required role', async () => {
      mockRequest.user = { id: 'user-id', email: 'user@example.com' };
      
      const middleware = requireRole(['admin']);

      await middleware(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});