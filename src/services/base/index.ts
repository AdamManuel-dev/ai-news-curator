/**
 * @fileoverview Base service and repository classes
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Service/repository base classes, type exports, enhanced functionality
 * Main APIs: CacheableService, DatabaseService, EventEmittingService, BaseRepository
 * Constraints: None
 * Patterns: Barrel exports, type re-exports, service composition
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