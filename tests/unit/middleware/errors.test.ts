/**
 * @fileoverview Unit tests for error handling middleware
 * 
 * Tests custom error types, error handling middleware, and error factory methods
 * to ensure proper error categorization and HTTP response formatting.
 */

import { Request, Response, NextFunction } from 'express';
import { 
  AppError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError,
  errorHandler,
  asyncHandler,
  ErrorFactory
} from '@middleware/errors';
import { AuthenticatedRequest } from '@middleware/index';

// Mock logger
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock config
jest.mock('@config/index', () => ({
  config: {
    nodeEnv: 'test',
  },
}));

describe('Error Types', () => {
  describe('AppError', () => {
    it('should create error with correct properties', () => {
      const error = new ValidationError('Test validation error', { field: 'email' });
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test validation error');
      expect(error.statusCode).toBe(400);
      expect(error.category).toBe('validation');
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ field: 'email' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should maintain proper inheritance chain', () => {
      const validationError = new ValidationError('Validation failed');
      const notFoundError = new NotFoundError('User', '123');
      const databaseError = new DatabaseError('Connection failed');
      
      expect(validationError).toBeInstanceOf(AppError);
      expect(notFoundError).toBeInstanceOf(AppError);
      expect(databaseError).toBeInstanceOf(AppError);
    });
  });

  describe('NotFoundError', () => {
    it('should format message correctly with identifier', () => {
      const error = new NotFoundError('User', '123');
      expect(error.message).toBe("User with identifier '123' not found");
      expect(error.statusCode).toBe(404);
    });

    it('should format message correctly without identifier', () => {
      const error = new NotFoundError('Configuration');
      expect(error.message).toBe('Configuration not found');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('ExternalServiceError', () => {
    it('should handle retryable service errors', () => {
      const error = new ExternalServiceError('OpenAI', 'API timeout', true);
      
      expect(error.serviceName).toBe('OpenAI');
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('API timeout');
    });

    it('should handle non-retryable service errors', () => {
      const error = new ExternalServiceError('OpenAI', 'Invalid API key', false);
      
      expect(error.serviceName).toBe('OpenAI');
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(502);
    });
  });
});

describe('Error Factory', () => {
  describe('content errors', () => {
    it('should create content not found error', () => {
      const error = ErrorFactory.content.notFound('content-123');
      
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe("Content with identifier 'content-123' not found");
      expect(error.context).toEqual({ contentId: 'content-123' });
    });

    it('should create content already exists error', () => {
      const error = ErrorFactory.content.alreadyExists('https://example.com/article');
      
      expect(error.message).toBe('Content with this URL already exists');
      expect(error.context).toEqual({ url: 'https://example.com/article' });
    });

    it('should create quality too low error', () => {
      const error = ErrorFactory.content.qualityTooLow(0.3, 0.6);
      
      expect(error.message).toBe('Content quality below threshold');
      expect(error.context).toEqual({ 
        score: 0.3, 
        threshold: 0.6,
        message: 'Content was rejected due to low quality score'
      });
    });
  });

  describe('validation errors', () => {
    it('should create required field error', () => {
      const error = ErrorFactory.validation.required('email');
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('email is required');
    });

    it('should create out of range error', () => {
      const error = ErrorFactory.validation.outOfRange('score', 0, 1, 1.5);
      
      expect(error.message).toBe('score is out of range');
      expect(error.context).toEqual({
        field: 'score',
        min: 0,
        max: 1,
        provided: 1.5
      });
    });
  });

  describe('external service errors', () => {
    it('should create OpenAI error', () => {
      const error = ErrorFactory.external.openaiError('Rate limit exceeded');
      
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error.serviceName).toBe('OpenAI');
      expect(error.message).toBe('OpenAI API error: Rate limit exceeded');
      expect(error.retryable).toBe(true);
    });

    it('should create non-retryable API error', () => {
      const error = ErrorFactory.external.anthropicError('Invalid API key', false);
      
      expect(error.serviceName).toBe('Anthropic');
      expect(error.retryable).toBe(false);
    });
  });
});

describe('Error Handler Middleware', () => {
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: NextFunction;
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;
  let setSpy: jest.Mock;

  beforeEach(() => {
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });
    setSpy = jest.fn();

    mockRequest = {
      method: 'GET',
      originalUrl: '/api/test',
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
      user: { id: 'user-123', email: 'test@example.com' },
      body: {},
      query: {},
      params: {},
    };

    mockResponse = {
      status: statusSpy,
      json: jsonSpy,
      set: setSpy,
      removeHeader: jest.fn(),
      headersSent: false,
    };

    mockNext = jest.fn();
  });

  it('should handle AppError correctly', () => {
    const error = new ValidationError('Invalid input', { field: 'email' });
    
    errorHandler(error, mockRequest, mockResponse, mockNext);
    
    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Invalid input',
          code: 'ValidationError',
          category: 'validation',
        }),
      })
    );
  });

  it('should handle generic Error correctly', () => {
    const error = new Error('Something went wrong');
    
    errorHandler(error, mockRequest, mockResponse, mockNext);
    
    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'InternalServerError',
          category: 'internal',
        }),
      })
    );
  });

  it('should set rate limit headers for RateLimitError', () => {
    const error = ErrorFactory.rateLimit.apiLimitExceeded(1000, 'hour', 3600);
    
    errorHandler(error, mockRequest, mockResponse, mockNext);
    
    expect(setSpy).toHaveBeenCalledWith('Retry-After', '3600');
    expect(setSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '1000');
    expect(setSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
  });

  it('should not process if response already sent', () => {
    mockResponse.headersSent = true;
    const error = new ValidationError('Test error');
    
    errorHandler(error, mockRequest, mockResponse, mockNext);
    
    expect(mockNext).toHaveBeenCalledWith(error);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('should include request ID in response when provided', () => {
    mockRequest.headers['x-request-id'] = 'req-123';
    const error = new ValidationError('Test error');
    
    errorHandler(error, mockRequest, mockResponse, mockNext);
    
    expect(setSpy).toHaveBeenCalledWith('X-Request-ID', 'req-123');
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          requestId: 'req-123',
        }),
      })
    );
  });
});

describe('Async Handler', () => {
  it('should catch async errors and pass to next', async () => {
    const error = new Error('Async error');
    const asyncFn = jest.fn().mockRejectedValue(error);
    const mockNext = jest.fn();
    
    const wrappedFn = asyncHandler(asyncFn);
    
    await wrappedFn({} as Request, {} as Response, mockNext);
    
    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('should handle successful async operations', async () => {
    const asyncFn = jest.fn().mockResolvedValue(undefined);
    const mockNext = jest.fn();
    
    const wrappedFn = asyncHandler(asyncFn);
    
    await wrappedFn({} as Request, {} as Response, mockNext);
    
    expect(asyncFn).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });
});

describe('Error Normalization', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      originalUrl: '/api/test',
      headers: {},
      body: {},
      query: {},
      params: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnValue({ json: jest.fn() }),
      set: jest.fn(),
      removeHeader: jest.fn(),
      headersSent: false,
    };

    mockNext = jest.fn();
  });

  it('should handle database connection errors', () => {
    const error = new Error('ECONNREFUSED: Connection refused');
    
    errorHandler(error, mockRequest, mockResponse, mockNext);
    
    expect(mockResponse.status).toHaveBeenCalledWith(500);
  });

  it('should handle timeout errors', () => {
    const error = new Error('Request timeout after 30000ms');
    
    errorHandler(error, mockRequest, mockResponse, mockNext);
    
    expect(mockResponse.status).toHaveBeenCalledWith(408);
  });

  it('should handle unknown error types', () => {
    const error = 'String error';
    
    errorHandler(error, mockRequest, mockResponse, mockNext);
    
    expect(mockResponse.status).toHaveBeenCalledWith(500);
  });
});