/**
 * @fileoverview Tests for EnhancedBaseController
 */

import { Request, Response, NextFunction } from 'express';
import { EnhancedBaseController, ControllerOptions } from '../enhanced-base';
import { container } from '@container/index';

// Mock the container and logger
jest.mock('@container/index', () => ({
  container: {
    resolve: jest.fn()
  }
}));

// Mock logger
const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
};

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
  requestId: 'test-request-id',
  method: 'GET',
  url: '/api/test',
  path: '/api/test',
  get: jest.fn().mockReturnValue('application/json'),
  ip: '127.0.0.1',
  query: {},
  params: {},
  body: {},
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

// Test controller implementation
class TestController extends EnhancedBaseController {
  async testHandler(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, async () => {
      return { message: 'success', data: 'test' };
    });
  }

  async testPaginatedHandler(req: Request, res: Response): Promise<void> {
    await this.handlePaginatedRequest(req, res, async ({ page, pageSize }) => {
      const data = Array.from({ length: pageSize }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
      return {
        data,
        totalCount: 50
      };
    });
  }

  async testCreateHandler(req: Request, res: Response): Promise<void> {
    await this.handleCreate(req, res, async (data) => {
      return { id: 'new-id', ...data };
    });
  }

  async testUpdateHandler(req: Request, res: Response): Promise<void> {
    await this.handleUpdate(req, res, async (id, data) => {
      if (id === 'nonexistent') return null;
      return { id, ...data, updated: true };
    });
  }

  async testDeleteHandler(req: Request, res: Response): Promise<void> {
    await this.handleDelete(req, res, async (id) => {
      return id !== 'nonexistent';
    });
  }

  async testGetByIdHandler(req: Request, res: Response): Promise<void> {
    await this.handleGetById(req, res, async (id) => {
      if (id === 'nonexistent') return null;
      return { id, name: `Item ${id}` };
    });
  }

  async testErrorHandler(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, async () => {
      throw new Error('Test error');
    });
  }

  async testValidationErrorHandler(req: Request, res: Response): Promise<void> {
    await this.handleRequest(req, res, async () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      throw error;
    });
  }

  public testWithErrorHandling(req: Request, res: Response, next: NextFunction): Promise<void> {
    const handler = this.withErrorHandling(async (_req, _res, _next) => {
      throw new Error('Handler error');
    });
    return handler(req, res, next);
  }

  // Expose protected methods for testing
  public testHandleRequest = this.handleRequest;
  public testHandleCreate = this.handleCreate;
}

describe('EnhancedBaseController', () => {
  let controller: TestController;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    (container.resolve as jest.Mock).mockReturnValue(mockLogger);
    
    controller = new TestController();
    req = createMockRequest();
    res = createMockResponse();
    next = jest.fn();
  });

  describe('handleRequest', () => {
    it('should handle successful request', async () => {
      await controller.testHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { message: 'success', data: 'test' },
          requestId: 'test-request-id',
          meta: expect.objectContaining({
            executionTime: expect.any(Number)
          })
        })
      );
    });

    it('should handle request with custom options', async () => {
      const options: ControllerOptions = {
        serialization: { format: 'compact' },
        transforms: { dateFormat: 'iso' },
        caching: { ttl: 3600 }
      };

      await controller.testHandleRequest(req as Request, res as Response, async () => {
        return { message: 'success' };
      }, options);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta).toHaveProperty('cacheExpiry');
    });

    it('should handle errors and log them', async () => {
      await controller.testErrorHandler(req as Request, res as Response);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Request handler error',
        expect.objectContaining({
          error: 'Test error',
          controller: 'TestController',
          method: 'GET',
          url: '/api/test',
          requestId: 'test-request-id'
        })
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Test error'
          })
        })
      );
    });

    it('should determine correct error status code', async () => {
      await controller.testValidationErrorHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(422);
    });
  });

  describe('handlePaginatedRequest', () => {
    it('should handle paginated request with default pagination', async () => {
      await controller.testPaginatedHandler(req as Request, res as Response);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data).toHaveLength(20); // Default page size
      expect(response.meta.pagination).toMatchObject({
        page: 1,
        pageSize: 20,
        totalCount: 50,
        totalPages: 3,
        hasNext: true,
        hasPrevious: false
      });
    });

    it('should handle paginated request with custom pagination parameters', async () => {
      req.query = { page: '2', pageSize: '10' };

      await controller.testPaginatedHandler(req as Request, res as Response);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data).toHaveLength(10);
      expect(response.meta.pagination).toMatchObject({
        page: 2,
        pageSize: 10,
        totalCount: 50,
        totalPages: 5,
        hasNext: true,
        hasPrevious: true,
        nextPage: 3,
        previousPage: 1
      });
    });

    it('should enforce maximum page size', async () => {
      req.query = { pageSize: '200' }; // Exceeds max of 100

      await controller.testPaginatedHandler(req as Request, res as Response);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta.pagination.pageSize).toBe(100);
    });

    it('should enforce minimum page and page size', async () => {
      req.query = { page: '0', pageSize: '0' };

      await controller.testPaginatedHandler(req as Request, res as Response);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta.pagination.page).toBe(1);
      expect(response.meta.pagination.pageSize).toBe(1);
    });

    it('should extract filters and sorting from request', async () => {
      req.query = {
        category: 'tech',
        status: 'active',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        q: 'search term',
        sortBy: 'name',
        sortOrder: 'desc'
      };

      await controller.testPaginatedHandler(req as Request, res as Response);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.meta.filters).toMatchObject({
        category: 'tech',
        status: 'active',
        dateRange: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        search: 'search term'
      });
      expect(response.meta.sorting).toMatchObject({
        field: 'name',
        direction: 'desc'
      });
    });
  });

  describe('handleCreate', () => {
    it('should handle successful resource creation', async () => {
      req.body = { name: 'New Item', description: 'Test item' };

      await controller.testCreateHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            id: 'new-id',
            name: 'New Item',
            description: 'Test item'
          }
        })
      );
    });

    it('should handle creation errors', async () => {
      await controller.testHandleCreate(req as Request, res as Response, async () => {
        throw new Error('Creation failed');
      });

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('handleUpdate', () => {
    it('should handle successful resource update', async () => {
      req.params = { id: 'test-id' };
      req.body = { name: 'Updated Item' };

      await controller.testUpdateHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            id: 'test-id',
            name: 'Updated Item',
            updated: true
          }
        })
      );
    });

    it('should handle missing resource ID', async () => {
      req.params = {};

      await controller.testUpdateHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Resource ID is required'
          })
        })
      );
    });

    it('should handle resource not found', async () => {
      req.params = { id: 'nonexistent' };

      await controller.testUpdateHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Resource not found'
          })
        })
      );
    });
  });

  describe('handleDelete', () => {
    it('should handle successful resource deletion', async () => {
      req.params = { id: 'test-id' };

      await controller.testDeleteHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { deleted: true }
        })
      );
    });

    it('should handle missing resource ID', async () => {
      req.params = {};

      await controller.testDeleteHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle resource not found', async () => {
      req.params = { id: 'nonexistent' };

      await controller.testDeleteHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('handleGetById', () => {
    it('should handle successful resource retrieval', async () => {
      req.params = { id: 'test-id' };

      await controller.testGetByIdHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            id: 'test-id',
            name: 'Item test-id'
          }
        })
      );
    });

    it('should handle missing resource ID', async () => {
      req.params = {};

      await controller.testGetByIdHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle resource not found', async () => {
      req.params = { id: 'nonexistent' };

      await controller.testGetByIdHandler(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('withErrorHandling', () => {
    it('should catch and handle errors in wrapped handlers', async () => {
      await controller.testWithErrorHandling(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Handler error'
          })
        })
      );
    });
  });

  describe('data transformations', () => {
    it('should apply date transformations when specified', async () => {
      const options: ControllerOptions = {
        transforms: {
          dateFormat: 'unix',
          timezone: 'UTC'
        }
      };

      const testData = {
        id: 1,
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-16T15:45:00Z'
      };

      await controller.handleRequest(req as Request, res as Response, async () => testData, options);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(typeof response.data.createdAt).toBe('number');
      expect(typeof response.data.updatedAt).toBe('number');
    });

    it('should apply URL sanitization when specified', async () => {
      const options: ControllerOptions = {
        transforms: {
          urlSanitization: true
        }
      };

      const testData = {
        id: 1,
        url: 'example.com',
        avatar: 'javascript:alert("xss")'
      };

      await controller.handleRequest(req as Request, res as Response, async () => testData, options);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data.url).toBe('https://example.com/');
      expect(response.data.avatar).toBe('');
    });

    it('should remove nulls when includeNulls is false', async () => {
      const options: ControllerOptions = {
        transforms: {
          includeNulls: false
        }
      };

      const testData = {
        id: 1,
        name: 'test',
        description: null,
        metadata: undefined
      };

      await controller.handleRequest(req as Request, res as Response, async () => testData, options);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('name');
      expect(response.data).not.toHaveProperty('description');
      expect(response.data).not.toHaveProperty('metadata');
    });

    it('should convert keys to camelCase when specified', async () => {
      const options: ControllerOptions = {
        transforms: {
          camelCaseKeys: true
        }
      };

      const testData = {
        user_id: 1,
        first_name: 'John',
        last_name: 'Doe'
      };

      await controller.handleRequest(req as Request, res as Response, async () => testData, options);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.data).toHaveProperty('userId');
      expect(response.data).toHaveProperty('firstName');
      expect(response.data).toHaveProperty('lastName');
    });
  });

  describe('error status code determination', () => {
    const errorCases = [
      { errorName: 'ValidationError', expectedStatus: 422 },
      { errorName: 'NotFoundError', expectedStatus: 404 },
      { errorName: 'UnauthorizedError', expectedStatus: 401 },
      { errorName: 'ForbiddenError', expectedStatus: 403 },
      { errorName: 'ConflictError', expectedStatus: 409 },
      { errorName: 'RateLimitError', expectedStatus: 429 }
    ];

    errorCases.forEach(({ errorName, expectedStatus }) => {
      it(`should return ${expectedStatus} for ${errorName}`, async () => {
        await controller.testHandleRequest(req as Request, res as Response, async () => {
          const error = new Error('Test error');
          error.name = errorName;
          throw error;
        });

        expect(res.status).toHaveBeenCalledWith(expectedStatus);
      });
    });

    it('should return custom status code when error has statusCode property', async () => {
      await controller.testHandleRequest(req as Request, res as Response, async () => {
        const error = new Error('Custom error') as any;
        error.statusCode = 418;
        throw error;
      });

      expect(res.status).toHaveBeenCalledWith(418);
    });

    it('should return 500 for unknown errors', async () => {
      await controller.testHandleRequest(req as Request, res as Response, async () => {
        throw new Error('Unknown error');
      });

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});