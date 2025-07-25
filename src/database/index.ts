/**
 * @fileoverview Database module exports and initialization
 *
 * Central module for database connections, repositories, and services.
 * Provides a clean interface for dependency injection and application setup.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

export * from './connection';
export * from './repositories/base';
export * from './repositories/content';

// Database service for dependency injection
export { DatabaseService } from './service';

// Migration system exports
export * from './migration-runner';
export * from './migration-service';
export * from './migration-cli';

// Type exports
export * from '@types/database';
