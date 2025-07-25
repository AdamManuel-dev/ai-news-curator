/**
 * @fileoverview Service base types and interfaces
 * 
 * Defines common interfaces and types for service layer architecture
 * including health checks, lifecycle management, and monitoring.
 */

// Health check result interface
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: Record<string, any>;
  timestamp?: string;
  responseTime?: number;
}

// Service lifecycle interface
export interface ServiceLifecycle {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
}

// Circuit breaker configuration
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
}

// Validation schema interface
export interface ValidationSchema<T> {
  validate(input: unknown): T;
  isValid(input: unknown): boolean;
}

// Metrics interface
export interface ServiceMetrics {
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
  incrementCounter(name: string, tags?: Record<string, string>): void;
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
  recordGauge(name: string, value: number, tags?: Record<string, string>): void;
}

// Service configuration interface
export interface ServiceConfiguration {
  enabled?: boolean;
  timeout?: number;
  retryAttempts?: number;
  circuitBreaker?: CircuitBreakerOptions;
  metrics?: {
    enabled: boolean;
    prefix?: string;
  };
  cache?: {
    enabled: boolean;
    defaultTtl?: number;
  };
}

// Base entity interface for repositories
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Repository query options
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  filters?: Record<string, any>;
}

// Audit log entry
export interface AuditLogEntry {
  id: string;
  tableName: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  userId?: string;
  changes?: Record<string, any>;
  timestamp: Date;
}

// Event interface for event-driven services
export interface ServiceEvent {
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
  correlationId?: string;
}