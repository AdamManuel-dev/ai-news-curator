# Testing Guide

## Overview

This guide covers testing strategies, frameworks, and best practices for the AI Content Curator Agent. Our testing approach ensures reliability, maintainability, and confidence in code changes.

## Testing Philosophy

- **Test Pyramid**: More unit tests, fewer integration tests, minimal E2E tests
- **Test-Driven Development**: Write tests before implementation when appropriate
- **Behavior-Driven**: Test behavior, not implementation details
- **Fast Feedback**: Tests should run quickly and provide clear feedback
- **Reliable**: Tests should be deterministic and not flaky

## Testing Stack

- **Framework**: Jest 29+
- **Assertion Library**: Jest built-in assertions
- **Mocking**: Jest mocks and manual mocks
- **HTTP Testing**: Supertest
- **Coverage**: Istanbul (built into Jest)
- **Test Runner**: Jest with TypeScript support

## Test Structure

### Directory Organization

```
tests/
├── unit/                 # Unit tests
│   ├── adapters/
│   │   └── redis.test.ts
│   ├── services/
│   │   └── cache.test.ts
│   ├── controllers/
│   │   └── health.test.ts
│   └── utils/
│       └── logger.test.ts
├── integration/          # Integration tests
│   ├── api/
│   │   └── health.test.ts
│   └── services/
│       └── cache-integration.test.ts
├── e2e/                 # End-to-end tests
│   └── workflows/
│       └── content-discovery.test.ts
├── fixtures/            # Test data
│   ├── users.json
│   └── content.json
├── helpers/             # Test utilities
│   ├── container.ts
│   ├── database.ts
│   └── mocks.ts
├── setup.ts            # Global test setup
└── teardown.ts         # Global test teardown
```

### Naming Conventions

- **Test Files**: `*.test.ts` or `*.spec.ts`
- **Test Suites**: Descriptive names matching the module under test
- **Test Cases**: Should read like specifications

```typescript
describe('CacheService', () => {
  describe('get()', () => {
    it('should return cached value when key exists', () => {
      // Test implementation
    });

    it('should return null when key does not exist', () => {
      // Test implementation
    });

    it('should throw error when Redis is unavailable', () => {
      // Test implementation
    });
  });
});
```

## Unit Testing

### Characteristics

- Test individual functions or classes in isolation
- Fast execution (< 1ms per test)
- No external dependencies (database, network, filesystem)
- High code coverage target (>90%)

### Example: Service Unit Test

```typescript
// tests/unit/services/cache.test.ts
import { CacheService, ICacheService } from '@services/cache';
import { ICacheAdapter } from '@adapters/redis';
import { createTestContainer } from '@tests/helpers/container';

describe('CacheService', () => {
  let cacheService: ICacheService;
  let mockRedisAdapter: jest.Mocked<ICacheAdapter>;

  beforeEach(() => {
    const container = createTestContainer();
    mockRedisAdapter = container.resolve<jest.Mocked<ICacheAdapter>>('REDIS_ADAPTER');
    cacheService = container.resolve<ICacheService>('CACHE_SERVICE');
  });

  describe('get', () => {
    it('should return cached value when key exists', async () => {
      // Arrange
      const key = 'test-key';
      const expectedValue = { data: 'test-data' };
      mockRedisAdapter.get.mockResolvedValue(expectedValue);

      // Act
      const result = await cacheService.get(key);

      // Assert
      expect(result).toEqual(expectedValue);
      expect(mockRedisAdapter.get).toHaveBeenCalledWith(key);
    });

    it('should return null when key does not exist', async () => {
      // Arrange
      const key = 'non-existent-key';
      mockRedisAdapter.get.mockResolvedValue(null);

      // Act
      const result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
      expect(mockRedisAdapter.get).toHaveBeenCalledWith(key);
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      const key = 'test-key';
      const error = new Error('Redis connection failed');
      mockRedisAdapter.get.mockRejectedValue(error);

      // Act
      const result = await cacheService.get(key);

      // Assert
      expect(result).toBeNull();
      expect(mockRedisAdapter.get).toHaveBeenCalledWith(key);
    });
  });

  describe('set', () => {
    it('should store value with TTL', async () => {
      // Arrange
      const key = 'test-key';
      const value = { data: 'test-data' };
      const ttl = 3600;
      mockRedisAdapter.set.mockResolvedValue();

      // Act
      await cacheService.set(key, value, ttl);

      // Assert
      expect(mockRedisAdapter.set).toHaveBeenCalledWith(key, value, ttl);
    });

    it('should store value without TTL when not provided', async () => {
      // Arrange
      const key = 'test-key';
      const value = { data: 'test-data' };
      mockRedisAdapter.set.mockResolvedValue();

      // Act
      await cacheService.set(key, value);

      // Assert
      expect(mockRedisAdapter.set).toHaveBeenCalledWith(key, value, undefined);
    });
  });

  describe('getOrSet', () => {
    it('should return cached value when available', async () => {
      // Arrange
      const key = 'test-key';
      const cachedValue = { data: 'cached-data' };
      const fetcher = jest.fn().mockResolvedValue({ data: 'fresh-data' });
      mockRedisAdapter.get.mockResolvedValue(cachedValue);

      // Act
      const result = await cacheService.getOrSet(key, fetcher);

      // Assert
      expect(result).toEqual(cachedValue);
      expect(fetcher).not.toHaveBeenCalled();
      expect(mockRedisAdapter.set).not.toHaveBeenCalled();
    });

    it('should fetch and cache value when not in cache', async () => {
      // Arrange
      const key = 'test-key';
      const freshValue = { data: 'fresh-data' };
      const fetcher = jest.fn().mockResolvedValue(freshValue);
      const ttl = 3600;
      
      mockRedisAdapter.get.mockResolvedValue(null);
      mockRedisAdapter.set.mockResolvedValue();

      // Act
      const result = await cacheService.getOrSet(key, fetcher, ttl);

      // Assert
      expect(result).toEqual(freshValue);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(mockRedisAdapter.set).toHaveBeenCalledWith(key, freshValue, ttl);
    });
  });
});
```

### Example: Controller Unit Test

```typescript
// tests/unit/controllers/health.test.ts
import { HealthController } from '@controllers/health';
import { ICacheAdapter } from '@adapters/redis';
import { createTestContainer } from '@tests/helpers/container';
import { Request, Response } from 'express';

describe('HealthController', () => {
  let healthController: HealthController;
  let mockRedisAdapter: jest.Mocked<ICacheAdapter>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    const container = createTestContainer();
    mockRedisAdapter = container.resolve<jest.Mocked<ICacheAdapter>>('REDIS_ADAPTER');
    healthController = container.resolve<HealthController>('HEALTH_CONTROLLER');

    mockRequest = {
      requestId: 'test-request-id',
    };

    mockResponse = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when all dependencies are working', async () => {
      // Arrange
      mockRedisAdapter.set.mockResolvedValue();
      mockRedisAdapter.get.mockResolvedValue('ok');
      mockRedisAdapter.delete.mockResolvedValue();

      // Act
      await healthController.getHealthStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'healthy',
          version: '1.0.0',
          dependencies: expect.objectContaining({
            redis: expect.objectContaining({
              status: 'connected',
            }),
          }),
        }),
        requestId: 'test-request-id',
      });
    });

    it('should return unhealthy status when Redis is down', async () => {
      // Arrange
      mockRedisAdapter.set.mockRejectedValue(new Error('Connection failed'));

      // Act
      await healthController.getHealthStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          status: 'unhealthy',
          dependencies: expect.objectContaining({
            redis: expect.objectContaining({
              status: 'error',
            }),
          }),
        }),
        requestId: 'test-request-id',
      });
    });
  });
});
```

## Integration Testing

### Characteristics

- Test interaction between multiple components
- May use real dependencies (database, cache)
- Slower than unit tests but faster than E2E
- Verify component integration works correctly

### Example: API Integration Test

```typescript
// tests/integration/api/health.test.ts
import request from 'supertest';
import { app } from '@/index';
import { setupTestDatabase, cleanupTestDatabase } from '@tests/helpers/database';

describe('Health API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
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
          ]),
        },
        requestId: expect.any(String),
      });

      expect(response.body.data.uptime).toBeGreaterThan(0);
      expect(response.body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('should handle high concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app).get('/health').expect(200)
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.body.success).toBe(true);
        expect(response.body.requestId).toBeDefined();
      });

      // All request IDs should be unique
      const requestIds = responses.map(r => r.body.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(requestIds.length);
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body.data.checks.length).toBeGreaterThan(0);
      
      // Should include all basic health checks
      const checkNames = response.body.data.checks.map(check => check.name);
      expect(checkNames).toContain('redis');
      expect(checkNames).toContain('memory');
    });
  });
});
```

### Example: Service Integration Test

```typescript
// tests/integration/services/cache-integration.test.ts
import { CacheService } from '@services/cache';
import { RedisAdapter } from '@adapters/redis';
import { createIntegrationContainer } from '@tests/helpers/container';

describe('CacheService Integration', () => {
  let cacheService: CacheService;
  let redisAdapter: RedisAdapter;

  beforeAll(async () => {
    const container = createIntegrationContainer();
    redisAdapter = container.resolve('REDIS_ADAPTER');
    cacheService = container.resolve('CACHE_SERVICE');
    
    await redisAdapter.connect();
  });

  afterAll(async () => {
    await redisAdapter.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await redisAdapter.clear();
  });

  it('should store and retrieve complex objects', async () => {
    const testData = {
      id: 'test-123',
      name: 'Test Content',
      tags: ['ai', 'ml', 'tutorial'],
      metadata: {
        author: 'Test Author',
        publishedAt: new Date('2024-01-01'),
      },
    };

    await cacheService.set('complex-object', testData, 3600);
    const retrieved = await cacheService.get('complex-object');

    expect(retrieved).toEqual(testData);
  });

  it('should handle TTL expiration', async () => {
    await cacheService.set('expiring-key', 'test-value', 1); // 1 second TTL
    
    // Value should be available immediately
    let value = await cacheService.get('expiring-key');
    expect(value).toBe('test-value');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Value should be expired
    value = await cacheService.get('expiring-key');
    expect(value).toBeNull();
  });

  it('should handle cache-aside pattern correctly', async () => {
    let fetchCount = 0;
    const fetcher = jest.fn().mockImplementation(() => {
      fetchCount++;
      return Promise.resolve(`fetched-data-${fetchCount}`);
    });

    // First call should fetch data
    const result1 = await cacheService.getOrSet('cache-aside-test', fetcher, 3600);
    expect(result1).toBe('fetched-data-1');
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Second call should use cached data
    const result2 = await cacheService.getOrSet('cache-aside-test', fetcher, 3600);
    expect(result2).toBe('fetched-data-1');
    expect(fetcher).toHaveBeenCalledTimes(1); // Still only called once
  });
});
```

## End-to-End Testing

### Characteristics

- Test complete user workflows
- Use real services and infrastructure
- Slowest tests but highest confidence
- Focus on critical user journeys

### Example: E2E Test

```typescript
// tests/e2e/workflows/content-discovery.test.ts
import request from 'supertest';
import { app } from '@/index';
import { setupE2EEnvironment, cleanupE2EEnvironment } from '@tests/helpers/e2e';

describe('Content Discovery Workflow', () => {
  beforeAll(async () => {
    await setupE2EEnvironment();
  });

  afterAll(async () => {
    await cleanupE2EEnvironment();
  });

  it('should complete full content discovery workflow', async () => {
    // 1. Check system health
    await request(app)
      .get('/health')
      .expect(200)
      .expect(res => {
        expect(res.body.data.status).toBe('healthy');
      });

    // 2. Submit content for analysis (when implemented)
    const analysisResponse = await request(app)
      .post('/api/v1/content/analyze')
      .send({
        url: 'https://example.com/test-article',
        options: {
          includeSummary: true,
          extractTags: true,
        },
      })
      .expect(200);

    const contentId = analysisResponse.body.data.id;
    expect(contentId).toBeDefined();

    // 3. Retrieve analyzed content
    await request(app)
      .get(`/api/v1/content/${contentId}`)
      .expect(200)
      .expect(res => {
        expect(res.body.data.tags).toBeDefined();
        expect(res.body.data.summary).toBeDefined();
      });

    // 4. Search for content
    await request(app)
      .get('/api/v1/search')
      .query({ q: 'test article', limit: 10 })
      .expect(200)
      .expect(res => {
        expect(res.body.data.results).toBeInstanceOf(Array);
        expect(res.body.data.totalResults).toBeGreaterThan(0);
      });
  });
});
```

## Test Utilities and Helpers

### Test Container Setup

```typescript
// tests/helpers/container.ts
import { Container } from '@container/Container';
import { TOKENS } from '@container/tokens';

export function createTestContainer(): Container {
  const container = new Container();

  // Register test doubles
  container.registerInstance(TOKENS.LOGGER, createTestLogger());
  container.registerInstance(TOKENS.CONFIG, createTestConfig());
  container.registerInstance(TOKENS.REDIS_ADAPTER, createMockRedisAdapter());

  return container;
}

export function createIntegrationContainer(): Container {
  const container = new Container();

  // Register real services for integration testing
  container.registerInstance(TOKENS.LOGGER, createTestLogger());
  container.registerInstance(TOKENS.CONFIG, createTestConfig());
  container.registerInstance(TOKENS.REDIS_ADAPTER, new RedisAdapter());

  return container;
}

function createTestLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
}

function createTestConfig() {
  return {
    nodeEnv: 'test',
    port: 3001,
    redis: {
      host: 'localhost',
      port: 6379,
      db: 15, // Use different DB for testing
    },
    logLevel: 'silent',
  };
}
```

### Mock Factories

```typescript
// tests/helpers/mocks.ts
import { ICacheAdapter } from '@adapters/redis';

export function createMockRedisAdapter(): jest.Mocked<ICacheAdapter> {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    clear: jest.fn().mockResolvedValue(undefined),
    keys: jest.fn().mockResolvedValue([]),
    increment: jest.fn().mockResolvedValue(1),
    decrement: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(undefined),
    ttl: jest.fn().mockResolvedValue(-1),
    isConnected: false,
    getClient: jest.fn(),
  };
}

export function createMockHealthController() {
  return {
    getHealthStatus: jest.fn(),
    getDetailedHealthStatus: jest.fn(),
  };
}
```

### Test Data Fixtures

```typescript
// tests/fixtures/content.ts
export const contentFixtures = {
  validContent: {
    id: 'content-123',
    title: 'Understanding Machine Learning',
    url: 'https://example.com/ml-guide',
    summary: 'A comprehensive guide to machine learning concepts...',
    tags: ['machine-learning', 'tutorial', 'beginner'],
    score: 0.85,
    publishedAt: '2024-01-15T10:00:00.000Z',
    source: {
      name: 'Tech Blog',
      type: 'blog',
      reputation: 0.9,
    },
  },

  invalidContent: {
    id: '',
    title: '',
    url: 'invalid-url',
    tags: [],
  },

  contentList: [
    {
      id: 'content-1',
      title: 'AI Fundamentals',
      tags: ['ai', 'fundamentals'],
      score: 0.9,
    },
    {
      id: 'content-2',
      title: 'Deep Learning Basics',
      tags: ['deep-learning', 'basics'],
      score: 0.8,
    },
  ],
};
```

## Test Configuration

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  
  // Test patterns
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
    '**/?(*.)+(spec|test).ts'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Exclude main entry point
    '!src/**/*.interface.ts', // Exclude interface files
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Test setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globalTeardown: '<rootDir>/tests/teardown.ts',

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@adapters/(.*)$': '<rootDir>/src/adapters/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@container/(.*)$': '<rootDir>/src/container/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },

  // Performance
  testTimeout: 10000,
  maxWorkers: '50%',
  
  // Debugging
  verbose: true,
  collectCoverage: false, // Enable only when needed
};
```

### Test Setup and Teardown

```typescript
// tests/setup.ts
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  
  // Initialize test database
  await setupTestDatabase();
});

// Global test teardown
afterAll(async () => {
  await cleanupTestDatabase();
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});
```

## Running Tests

### NPM Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:debug": "jest --runInBand --no-cache --detectOpenHandles"
  }
}
```

### Running Specific Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- cache.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should return cached value"

# Run tests in specific directory
npm run test:unit

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Debug mode
npm run test:debug
```

## Best Practices

### Test Design

1. **AAA Pattern**: Arrange, Act, Assert
2. **Descriptive Names**: Test names should describe expected behavior
3. **Single Responsibility**: One assertion per test when possible
4. **Independent Tests**: Tests should not depend on each other
5. **Fast Execution**: Unit tests should be very fast

### Mocking Guidelines

1. **Mock External Dependencies**: Always mock external services
2. **Don't Mock What You Own**: Test your own code, mock external dependencies
3. **Verify Interactions**: Assert that mocks are called correctly
4. **Reset Mocks**: Clear mock state between tests

### Coverage Guidelines

1. **Target 80%+ Coverage**: Aim for high coverage but don't chase 100%
2. **Focus on Critical Paths**: Ensure important business logic is tested
3. **Test Edge Cases**: Include error conditions and boundary cases
4. **Ignore Generated Code**: Exclude generated files from coverage

## Continuous Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linting
        run: npm run lint
      
      - name: Run type checking
        run: npm run type-check
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          REDIS_HOST: localhost
          REDIS_PORT: 6379
      
      - name: Generate coverage
        run: npm run test:coverage
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

This comprehensive testing guide ensures high-quality, reliable code through systematic testing practices and automation.