import { logError } from '@utils/logger';
import { container, LOGGER, CONFIG } from '@container/index';
import type { AppConfig } from '@config/index';
import type { Logger } from 'winston';
import type { 
  HealthCheckResult, 
  ServiceLifecycle, 
  CircuitBreakerOptions,
  ValidationSchema,
  ServiceMetrics,
  ServiceConfiguration
} from '../types/service';

export abstract class BaseService implements ServiceLifecycle, ServiceMetrics {
  protected logger: Logger;
  protected config: AppConfig;
  protected serviceName: string;
  private isInitialized = false;
  private initializationPromise?: Promise<void>;
  private serviceConfig: ServiceConfiguration;

  constructor(serviceConfig?: ServiceConfiguration) {
    this.logger = container.resolve<Logger>(LOGGER);
    this.config = container.resolve<AppConfig>(CONFIG);
    this.serviceName = this.constructor.name;
    this.serviceConfig = {
      enabled: true,
      timeout: 30000,
      retryAttempts: 3,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 300000,
      },
      metrics: {
        enabled: true,
        prefix: this.serviceName.toLowerCase(),
      },
      cache: {
        enabled: false,
        defaultTtl: 300,
      },
      ...serviceConfig,
    };
  }

  /**
   * Initialize the service (idempotent)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    await this.initializationPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      this.logInfo('Initializing service');
      await this.onInitialize();
      this.isInitialized = true;
      this.logInfo('Service initialized successfully');
    } catch (error) {
      this.logError('Service initialization failed', error);
      throw error;
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      this.logInfo('Shutting down service');
      await this.onShutdown();
      this.isInitialized = false;
      this.logInfo('Service shutdown completed');
    } catch (error) {
      this.logError('Service shutdown failed', error);
      throw error;
    }
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        return {
          status: 'unhealthy',
          details: { 
            error: 'Service not initialized',
            service: this.serviceName 
          },
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
        };
      }

      const result = await this.onHealthCheck();
      return {
        ...result,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          service: this.serviceName 
        },
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Template methods for subclasses to override
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclasses
  }

  protected async onShutdown(): Promise<void> {
    // Override in subclasses
  }

  protected async onHealthCheck(): Promise<HealthCheckResult> {
    return {
      status: 'healthy',
      details: {
        service: this.serviceName,
        initialized: this.isInitialized,
      },
    };
  }

  /**
   * Enhanced error handling with context and monitoring
   */
  protected async handleError(
    error: Error,
    context: string,
    additionalData?: Record<string, any>
  ): Promise<void> {
    const enrichedData = {
      service: this.serviceName,
      context,
      timestamp: new Date().toISOString(),
      ...additionalData,
    };

    logError(error, enrichedData);
    this.recordMetric('service.error', 1, { context, service: this.serviceName });
    
    // Optional: Send to monitoring/alerting systems
    await this.notifyError(error, enrichedData);
  }

  /**
   * Convenience method for logging errors with Error objects
   */
  protected logError(message: string, error?: Error | unknown, data?: Record<string, any>): void {
    const errorData = error instanceof Error ? {
      error: error.message,
      stack: error.stack,
    } : { error: String(error) };

    this.logger.error(message, {
      service: this.serviceName,
      ...errorData,
      ...data,
    });
  }

  protected logInfo(message: string, data?: Record<string, any>): void {
    this.logger.info(message, {
      service: this.serviceName,
      ...data,
    });
  }

  protected logDebug(message: string, data?: Record<string, any>): void {
    this.logger.debug(message, {
      service: this.serviceName,
      ...data,
    });
  }

  protected logWarn(message: string, data?: Record<string, any>): void {
    this.logger.warn(message, {
      service: this.serviceName,
      ...data,
    });
  }

  /**
   * Circuit breaker pattern support
   */
  protected async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    _options?: CircuitBreakerOptions
  ): Promise<T> {
    // Simple circuit breaker implementation
    // In production, consider using a library like opossum
    // TODO: Implement actual circuit breaker logic using options and config
    try {
      const result = await operation();
      this.recordMetric('circuit_breaker.success', 1);
      return result;
    } catch (error) {
      this.recordMetric('circuit_breaker.failure', 1);
      throw error;
    }
  }

  /**
   * Retry pattern with exponential backoff
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = this.serviceConfig.retryAttempts || 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        if (attempt > 1) {
          this.recordMetric('retry.success', 1, { attempt: attempt.toString() });
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        this.recordMetric('retry.attempt', 1, { attempt: attempt.toString() });
        
        if (attempt === maxAttempts) {
          this.recordMetric('retry.final_failure', 1);
          break;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Input validation helper
   */
  protected validateInput<T>(input: unknown, schema: ValidationSchema<T>): T {
    try {
      const result = schema.validate(input);
      this.recordMetric('validation.success', 1);
      return result;
    } catch (error) {
      this.recordMetric('validation.failure', 1);
      throw new Error(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Timeout wrapper for operations
   */
  protected async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number = this.serviceConfig.timeout || 30000
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  // ServiceMetrics implementation
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    if (!this.serviceConfig.metrics?.enabled) {
      return;
    }

    const metricName = this.serviceConfig.metrics.prefix 
      ? `${this.serviceConfig.metrics.prefix}.${name}`
      : name;

    // TODO: Implement actual metrics collection (Prometheus, StatsD, etc.)
    this.logDebug('Metric recorded', { 
      metric: metricName, 
      value, 
      tags: { service: this.serviceName, ...tags }
    });
  }

  incrementCounter(name: string, tags?: Record<string, string>): void {
    this.recordMetric(name, 1, tags);
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric(`${name}.histogram`, value, tags);
  }

  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric(`${name}.gauge`, value, tags);
  }

  /**
   * Get service configuration
   */
  protected getServiceConfig(): ServiceConfiguration {
    return { ...this.serviceConfig };
  }

  /**
   * Update service configuration
   */
  protected updateServiceConfig(updates: Partial<ServiceConfiguration>): void {
    this.serviceConfig = { ...this.serviceConfig, ...updates };
    this.logInfo('Service configuration updated', { updates });
  }

  /**
   * Check if service is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get service name
   */
  get name(): string {
    return this.serviceName;
  }

  /**
   * Private helper for error notification
   */
  private async notifyError(error: Error, metadata: Record<string, any>): Promise<void> {
    // TODO: Implement error notification (Slack, email, monitoring systems)
    // For now, just ensure we don't throw errors from error handling
    try {
      // Placeholder for error notification logic
      // Could use metadata for contextual information
      this.logger.debug('Error notification would be sent', { 
        error: error.message, 
        metadata 
      });
    } catch (notificationError) {
      this.logger.error('Failed to send error notification', { 
        originalError: error.message,
        notificationError: notificationError instanceof Error ? notificationError.message : String(notificationError)
      });
    }
  }
}

export * from './cache';
export * from './cache-manager';
