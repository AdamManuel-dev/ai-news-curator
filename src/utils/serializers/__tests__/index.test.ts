/**
 * @fileoverview Tests for response serialization utilities with comprehensive formatting
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Response serialization, pagination handling, error formatting, field filtering, data transforms
 * Main APIs: success(), paginated(), error(), validationError(), notFound(), unauthorized()
 * Constraints: Requires Express request/response objects, serialization options, API versioning
 * Patterns: Mock Express objects, test response formats, validate status codes and headers
 */

import { Request, Response } from 'express';
import { ResponseSerializer, SerializationOptions, PaginationOptions } from '../index';

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
  requestId: 'test-request-id',
  method: 'GET',
  path: '/api/test',
  get: jest.fn().mockReturnValue('application/json'),
  ip: '127.0.0.1',
  query: {},
  params: {},
  ...overrides
});

const createMockResponse = (): Partial<Response> => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn()
  };
  return res;
};

describe('ResponseSerializer', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let serializer: ResponseSerializer;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    serializer = new ResponseSerializer(req as Request, res as Response);
  });

  describe('success', () => {
    it('should send successful response with data', () => {
      const testData = { id: 1, name: 'test' };
      
      serializer.success(testData);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: testData,
          requestId: 'test-request-id',
          timestamp: expect.any(String),
          meta: expect.objectContaining({
            executionTime: expect.any(Number),
            version: expect.any(String)
          })
        })
      );
    });

    it('should apply serialization options', () => {
      const testData = { id: 1, name: 'test', secret: 'hidden' };
      const options: SerializationOptions = {
        excludeFields: ['secret']
      };
      
      serializer.success(testData, { serializationOptions: options });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data).not.toHaveProperty('secret');
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('name');
    });

    it('should include custom metadata', () => {
      const testData = { id: 1 };
      const customMeta = { cached: true, cacheExpiry: '2024-01-01T00:00:00Z' };
      
      serializer.success(testData, { meta: customMeta });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta).toMatchObject(customMeta);
    });

    it('should handle custom status code', () => {
      const testData = { id: 1 };
      
      serializer.success(testData, { statusCode: 201 });

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('paginated', () => {
    it('should send paginated response with correct metadata', () => {
      const testData = [{ id: 1 }, { id: 2 }];
      const pagination: PaginationOptions = {
        page: 2,
        pageSize: 10,
        totalCount: 25
      };
      
      serializer.paginated(testData, pagination);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data).toEqual(testData);
      expect(response.meta.pagination).toEqual({
        page: 2,
        pageSize: 10,
        totalCount: 25,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
        nextPage: 3,
        previousPage: 1
      });
    });

    it('should handle first page pagination', () => {
      const testData = [{ id: 1 }];
      const pagination: PaginationOptions = {
        page: 1,
        pageSize: 10,
        totalCount: 5
      };
      
      serializer.paginated(testData, pagination);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta.pagination).toMatchObject({
        page: 1,
        hasNext: false,
        hasPrevious: false,
        nextPage: undefined,
        previousPage: undefined
      });
    });

    it('should handle last page pagination', () => {
      const testData = [{ id: 1 }];
      const pagination: PaginationOptions = {
        page: 3,
        pageSize: 10,
        totalCount: 25
      };
      
      serializer.paginated(testData, pagination);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta.pagination).toMatchObject({
        page: 3,
        hasNext: false,
        hasPrevious: true,
        nextPage: undefined,
        previousPage: 2
      });
    });
  });

  describe('error', () => {
    it('should send error response with string message', () => {
      serializer.error('Test error message');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: {
            message: 'Test error message',
            details: {}
          },
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        })
      );
    });

    it('should send error response with Error object', () => {
      const error = new Error('Test error');
      
      serializer.error(error);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error).toMatchObject({
        message: 'Test error',
        code: 'Error',
        details: {}
      });
    });

    it('should include stack trace in development', () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';
      
      const error = new Error('Test error');
      serializer.error(error, { includeStack: true });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error.stack).toBeDefined();
      
      process.env['NODE_ENV'] = originalEnv;
    });

    it('should handle custom status code', () => {
      serializer.error('Test error', { statusCode: 404 });

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should include additional details', () => {
      const details = { field: 'value', context: 'test' };
      
      serializer.error('Test error', { details });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error.details).toMatchObject(details);
    });
  });

  describe('validationError', () => {
    it('should send validation error with field errors', () => {
      const errors = {
        name: ['Name is required'],
        email: ['Email is invalid', 'Email must be unique']
      };
      
      serializer.validationError(errors);

      expect(res.status).toHaveBeenCalledWith(422);
      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error).toMatchObject({
        message: 'Validation failed',
        code: 'ValidationError',
        details: { errors }
      });
    });

    it('should accept custom validation message', () => {
      const errors = { field: ['Error message'] };
      const customMessage = 'Custom validation failed';
      
      serializer.validationError(errors, customMessage);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error.message).toBe(customMessage);
    });
  });

  describe('convenience methods', () => {
    it('should send not found response', () => {
      serializer.notFound('User');

      expect(res.status).toHaveBeenCalledWith(404);
      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error.message).toBe('User not found');
    });

    it('should send unauthorized response', () => {
      serializer.unauthorized();

      expect(res.status).toHaveBeenCalledWith(401);
      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error.message).toBe('Unauthorized');
    });

    it('should send forbidden response', () => {
      serializer.forbidden('Access denied');

      expect(res.status).toHaveBeenCalledWith(403);
      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error.message).toBe('Access denied');
    });

    it('should send rate limit exceeded response', () => {
      const retryAfter = 60;
      
      serializer.rateLimitExceeded(retryAfter);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.error.message).toBe('Rate limit exceeded');
      expect(response.error.details.retryAfter).toBe(60);
    });
  });

  describe('field filtering', () => {
    it('should include only specified fields', () => {
      const testData = { id: 1, name: 'test', email: 'test@example.com', secret: 'hidden' };
      const options: SerializationOptions = {
        includeFields: ['id', 'name']
      };
      
      serializer.success(testData, { serializationOptions: options });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(Object.keys(response.data)).toEqual(['id', 'name']);
    });

    it('should exclude specified fields', () => {
      const testData = { id: 1, name: 'test', email: 'test@example.com', secret: 'hidden' };
      const options: SerializationOptions = {
        excludeFields: ['secret', 'email']
      };
      
      serializer.success(testData, { serializationOptions: options });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('name');
      expect(response.data).not.toHaveProperty('secret');
      expect(response.data).not.toHaveProperty('email');
    });

    it('should handle array data with field filtering', () => {
      const testData = [
        { id: 1, name: 'test1', secret: 'hidden1' },
        { id: 2, name: 'test2', secret: 'hidden2' }
      ];
      const options: SerializationOptions = {
        excludeFields: ['secret']
      };
      
      serializer.success(testData, { serializationOptions: options });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      response.data.forEach((item: any) => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).not.toHaveProperty('secret');
      });
    });
  });

  describe('compact format', () => {
    it('should remove null and undefined values in compact format', () => {
      const testData = {
        id: 1,
        name: 'test',
        description: null,
        metadata: undefined,
        nested: {
          value: 'keep',
          empty: null
        }
      };
      const options: SerializationOptions = {
        format: 'compact'
      };
      
      serializer.success(testData, { serializationOptions: options });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('name');
      expect(response.data).not.toHaveProperty('description');
      expect(response.data).not.toHaveProperty('metadata');
      expect(response.data.nested).toHaveProperty('value');
      expect(response.data.nested).not.toHaveProperty('empty');
    });
  });

  describe('API version handling', () => {
    it('should extract version from API-Version header', () => {
      req.get = jest.fn().mockImplementation((header: string) => {
        if (header === 'API-Version') return 'v2';
        return undefined;
      });
      
      serializer.success({ id: 1 });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta.version).toBe('v2');
    });

    it('should extract version from Accept header', () => {
      req.get = jest.fn().mockImplementation((header: string) => {
        if (header === 'Accept') return 'application/vnd.api+json;version=3';
        return undefined;
      });
      
      serializer.success({ id: 1 });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta.version).toBe('3');
    });

    it('should default to v1 when no version specified', () => {
      req.get = jest.fn().mockReturnValue(undefined);
      
      serializer.success({ id: 1 });

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta.version).toBe('v1');
    });
  });
});