/**
 * @fileoverview Database module exports and initialization
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Database connections, repositories, migrations, services
 * Main APIs: getDatabase(), DatabaseService, migration system exports
 * Constraints: Requires PostgreSQL connection, config module
 * Patterns: Central export module, dependency injection ready
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
