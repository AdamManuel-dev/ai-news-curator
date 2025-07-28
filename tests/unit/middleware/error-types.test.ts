/**
 * @fileoverview Unit tests for error types and factory
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Custom error types, error factory methods, categorization
 * Main APIs: AppError, ValidationError, NotFoundError, ErrorFactory
 * Constraints: None
 * Patterns: Tests error inheritance, factory patterns, context handling
 */

import { 
  AppError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError,
  RateLimitError,
  ErrorFactory
} from '@middleware/errors';

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

  describe('RateLimitError', () => {
    it('should include retry after information', () => {
      const error = new RateLimitError('Too many requests', 3600);
      
      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(3600);
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

    it('should create invalid enum error', () => {
      const error = ErrorFactory.validation.invalidEnum('status', ['active', 'inactive'], 'pending');
      
      expect(error.message).toBe('status has invalid value');
      expect(error.context).toEqual({
        field: 'status',
        validValues: ['active', 'inactive'],
        provided: 'pending'
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

  describe('rate limit errors', () => {
    it('should create API limit exceeded error', () => {
      const error = ErrorFactory.rateLimit.apiLimitExceeded(1000, 'hour', 3600);
      
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.message).toBe('API rate limit exceeded: 1000 requests per hour');
      expect(error.retryAfter).toBe(3600);
      expect(error.context).toEqual({ limit: 1000, window: 'hour' });
    });

    it('should create user limit exceeded error', () => {
      const error = ErrorFactory.rateLimit.userLimitExceeded('user-123', 100, 1800);
      
      expect(error.message).toBe('User rate limit exceeded: 100 requests per hour');
      expect(error.retryAfter).toBe(1800);
      expect(error.context).toEqual({ userId: 'user-123', limit: 100 });
    });
  });

  describe('database errors', () => {
    it('should create connection failed error', () => {
      const error = ErrorFactory.database.connectionFailed('ECONNREFUSED');
      
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.message).toBe('Database connection failed');
      expect(error.context).toEqual({ originalError: 'ECONNREFUSED' });
    });

    it('should create query failed error', () => {
      const error = ErrorFactory.database.queryFailed('SELECT * FROM users', 'syntax error');
      
      expect(error.message).toBe('Database query failed');
      expect(error.context).toEqual({ 
        query: 'SELECT * FROM users',
        originalError: 'syntax error'
      });
    });
  });

  describe('business logic errors', () => {
    it('should create invalid operation error', () => {
      const error = ErrorFactory.business.invalidOperation('delete', 'Cannot delete published content');
      
      expect(error.message).toBe('Invalid operation: delete. Cannot delete published content');
      expect(error.context).toEqual({
        operation: 'delete',
        reason: 'Cannot delete published content'
      });
    });

    it('should create precondition failed error', () => {
      const error = ErrorFactory.business.preconditionFailed('User must be verified', { userId: '123' });
      
      expect(error.message).toBe('Precondition failed: User must be verified');
      expect(error.context).toEqual({ userId: '123' });
    });
  });
});