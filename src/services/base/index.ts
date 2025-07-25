/**
 * @fileoverview Base service and repository classes
 * 
 * Exports all enhanced base classes for building robust, scalable services
 * and repositories with built-in caching, auditing, events, and monitoring.
 */

// Service base classes
export { BaseService } from '@services/index';
export { CacheableService } from './CacheableService';
export { DatabaseService } from './DatabaseService';
export { EventEmittingService } from './EventEmittingService';

// Repository base classes
export { BaseRepository } from '@database/repositories/base';
export { AuditableRepository } from '@database/repositories/base/AuditableRepository';
export { CacheableRepository } from '@database/repositories/base/CacheableRepository';

// Type exports
export type {
  HealthCheckResult,
  ServiceLifecycle,
  CircuitBreakerOptions,
  ValidationSchema,
  ServiceMetrics,
  ServiceConfiguration,
  ServiceEvent,
  AuditLogEntry,
  BaseEntity,
} from '@types/service';

export type {
  CacheableServiceConfig,
} from './CacheableService';

export type {
  DatabaseServiceConfig,
  DatabaseConnection,
} from './DatabaseService';

export type {
  EventEmittingServiceConfig,
  EventMetadata,
  DomainEvent,
} from './EventEmittingService';

export type {
  AuditContext,
  AuditableEntity,
} from '@database/repositories/base/AuditableRepository';

export type {
  CacheableRepositoryConfig,
} from '@database/repositories/base/CacheableRepository';