/**
 * @fileoverview Route module exports aggregator
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Centralized exports for all route modules
 * Main APIs: Re-exports from health, metrics, auth, api-keys, rate-limit, admin, roles, pool-monitor
 * Constraints: None - simple export aggregation
 * Patterns: Named exports for routers, default exports re-exported with aliases
 */

export * from './health';
export * from './metrics';
export * from './auth';
export * from './api-keys';
export * from './rate-limit';
export * from './admin';
export { default as rolesRouter } from './roles';
export { default as poolMonitorRouter } from './pool-monitor';
