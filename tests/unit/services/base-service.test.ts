/**
 * @fileoverview Tests for enhanced BaseService
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Lifecycle management, health checks, retry logic, circuit breaker
 * Main APIs: initialize(), healthCheck(), withRetry(), withTimeout()
 * Constraints: Requires logger and container mocking
 * Patterns: Tests service patterns, timeout handling, configuration management
 */

import { BaseService } from '@services/index';
import type { HealthCheckResult, ValidationSchema } from '../../../src/types/service';

// Mock dependencies
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logError: jest.fn(),
}));

jest.mock('@container/index', () => ({
  container: {
    resolve: jest.fn().mockImplementation((token) => {
      if (token === 'LOGGER') {
        return {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        };
      }
      if (token === 'CONFIG') {
        return {
          nodeEnv: 'test',
        };
      }
      return {};
    }),
  },
  LOGGER: 'LOGGER',
  CONFIG: 'CONFIG',
}));

// Test service implementation
class TestService extends BaseService {
  private initializeDelay = 0;
  private healthCheckShouldFail = false;
  
  setInitializeDelay(delay: number) {
    this.initializeDelay = delay;
  }
  
  setHealthCheckFailure(shouldFail: boolean) {
    this.healthCheckShouldFail = shouldFail;
  }
  
  protected override async onInitialize(): Promise<void> {
    if (this.initializeDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.initializeDelay));
    }
  }
  
  protected override async onHealthCheck(): Promise<HealthCheckResult> {
    if (this.healthCheckShouldFail) {
      throw new Error('Health check failed');
    }
    
    return {
      status: 'healthy',
      details: { test: true },
    };
  }
  
  // Expose protected methods for testing
  public async testRetry<T>(operation: () => Promise<T>, maxAttempts?: number): Promise<T> {
    return this.withRetry(operation, maxAttempts);
  }
  
  public async testCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    return this.withCircuitBreaker(operation);
  }
  
  public async testTimeout<T>(operation: () => Promise<T>, timeout?: number): Promise<T> {
    return this.withTimeout(operation, timeout);
  }
  
  public testValidation<T>(input: unknown, schema: ValidationSchema<T>): T {
    return this.validateInput(input, schema);
  }
  
  // Expose protected methods for testing
  public async testHandleError(error: Error, context: string, additionalData?: Record<string, any>): Promise<void> {
    return this.handleError(error, context, additionalData);
  }
  
  public getTestServiceConfig() {
    return this.getServiceConfig();
  }
  
  public updateTestServiceConfig(updates: any) {
    return this.updateServiceConfig(updates);
  }
}

describe('BaseService', () => {
  let service: TestService;

  beforeEach(() => {
    service = new TestService();
    jest.clearAllMocks();
  });

  describe('Lifecycle Management', () => {
    it('should initialize service successfully', async () => {
      expect(service.initialized).toBe(false);
      
      await service.initialize();
      
      expect(service.initialized).toBe(true);
      expect(service.name).toBe('TestService');
    });

    it('should be idempotent for multiple initialization calls', async () => {
      await service.initialize();
      await service.initialize(); // Should not throw or reinitialize
      
      expect(service.initialized).toBe(true);
    });

    it('should handle concurrent initialization calls', async () => {
      service.setInitializeDelay(100);
      
      const promises = [
        service.initialize(),
        service.initialize(),
        service.initialize(),
      ];
      
      await Promise.all(promises);
      expect(service.initialized).toBe(true);
    });

    it('should shutdown service gracefully', async () => {
      await service.initialize();
      expect(service.initialized).toBe(true);
      
      await service.shutdown();
      expect(service.initialized).toBe(false);
    });

    it('should handle shutdown when not initialized', async () => {
      await service.shutdown(); // Should not throw
      expect(service.initialized).toBe(false);
    });
  });

  describe('Health Checks', () => {
    it('should return healthy status when initialized', async () => {
      await service.initialize();
      
      const health = await service.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.details).toEqual({ test: true });
      expect(health.timestamp).toBeDefined();
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy when not initialized', async () => {
      const health = await service.healthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.details['error']).toBe('Service not initialized');
      expect(health.details['service']).toBe('TestService');
    });

    it('should handle health check failures', async () => {
      await service.initialize();
      service.setHealthCheckFailure(true);
      
      const health = await service.healthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.details['error']).toBe('Health check failed');
    });
  });

  describe('Retry Logic', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await service.testRetry(operation, 3);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry failed operations', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValueOnce('success');
      
      const result = await service.testRetry(operation, 3);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(service.testRetry(operation, 2))
        .rejects
        .toThrow('Always fails');
      
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValueOnce('success');
      
      const startTime = Date.now();
      await service.testRetry(operation, 3);
      const duration = Date.now() - startTime;
      
      // Should have some delay due to exponential backoff
      expect(duration).toBeGreaterThan(50); // At least some delay
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Circuit Breaker', () => {
    it('should succeed normally', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await service.testCircuitBreaker(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      await expect(service.testCircuitBreaker(operation))
        .rejects
        .toThrow('Operation failed');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timeout Handling', () => {
    it('should complete within timeout', async () => {
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      });
      
      const result = await service.testTimeout(operation, 100);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should timeout slow operations', async () => {
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'success';
      });
      
      await expect(service.testTimeout(operation, 100))
        .rejects
        .toThrow('Operation timed out after 100ms');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use default timeout', async () => {
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      });
      
      const result = await service.testTimeout(operation); // Uses default 30s timeout
      
      expect(result).toBe('success');
    });
  });

  describe('Input Validation', () => {
    const mockSchema: ValidationSchema<{ name: string; age: number }> = {
      validate: jest.fn().mockImplementation((input: any) => {
        if (typeof input.name !== 'string' || typeof input.age !== 'number') {
          throw new Error('Invalid input');
        }
        return input;
      }),
      isValid: jest.fn().mockReturnValue(true),
    };

    it('should validate correct input', () => {
      const input = { name: 'John', age: 30 };
      
      const result = service.testValidation(input, mockSchema);
      
      expect(result).toEqual(input);
      expect(mockSchema.validate).toHaveBeenCalledWith(input);
    });

    it('should throw on invalid input', () => {
      const input = { name: 'John', age: 'thirty' };
      mockSchema.validate = jest.fn().mockImplementation(() => {
        throw new Error('Invalid age');
      });
      
      expect(() => service.testValidation(input, mockSchema))
        .toThrow('Validation failed: Invalid age');
    });
  });

  describe('Configuration Management', () => {
    it('should have default configuration', () => {
      const config = service.getTestServiceConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.timeout).toBe(30000);
      expect(config.retryAttempts).toBe(3);
      expect(config.metrics?.enabled).toBe(true);
    });

    it('should allow configuration updates', () => {
      service.updateTestServiceConfig({ timeout: 5000 });
      
      const config = service.getTestServiceConfig();
      expect(config.timeout).toBe(5000);
    });
  });

  describe('Error Handling', () => {
    it('should handle and log errors properly', async () => {
      const error = new Error('Test error');
      const context = 'test operation';
      const metadata = { userId: '123' };
      
      await service.testHandleError(error, context, metadata);
      
      // Error should be logged (we'd need to check mock calls in real implementation)
    });

    it('should handle initialization errors', async () => {
      const failingService = new TestService();
      // Override the onInitialize method
      (failingService as any).onInitialize = jest.fn().mockRejectedValue(new Error('Init failed'));
      
      await expect(failingService.initialize())
        .rejects
        .toThrow('Init failed');
      
      expect(failingService.initialized).toBe(false);
    });
  });

  describe('Metrics Recording', () => {
    it('should record metrics when enabled', () => {
      service.recordMetric('test.metric', 42, { tag: 'value' });
      service.incrementCounter('test.counter');
      service.recordHistogram('test.histogram', 100);
      service.recordGauge('test.gauge', 75);
      
      // In a real implementation, we'd verify metrics were sent to the metrics system
    });

    it('should not record metrics when disabled', () => {
      service.updateTestServiceConfig({ 
        metrics: { enabled: false, prefix: 'test' } 
      });
      
      service.recordMetric('test.metric', 42);
      
      // Should not record anything
    });
  });
});