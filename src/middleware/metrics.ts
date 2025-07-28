/**
 * @fileoverview Prometheus metrics middleware for the AI Content Curator Agent
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: HTTP metrics, business metrics, Prometheus registry, custom counters/gauges/histograms
 * Main APIs: metricsMiddleware(), getMetrics(), record*() functions, metrics export
 * Constraints: Requires prom-client, logger utility
 * Patterns: Middleware pattern, metric collection, response interception, route normalization
 */

import { Request, Response, NextFunction } from 'express';
import * as promClient from 'prom-client';
import logger from '@utils/logger';

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ 
  register,
  prefix: 'ai_curator_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

/**
 * HTTP request duration histogram
 * Tracks request processing time by method, route, and status
 */
const httpRequestDuration = new promClient.Histogram({
  name: 'ai_curator_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

/**
 * HTTP request counter
 * Counts total requests by method, route, and status
 */
const httpRequestsTotal = new promClient.Counter({
  name: 'ai_curator_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

/**
 * Active HTTP requests gauge
 * Tracks currently processing requests
 */
const httpRequestsActive = new promClient.Gauge({
  name: 'ai_curator_http_requests_active',
  help: 'Number of active HTTP requests',
  labelNames: ['method', 'route'],
  registers: [register]
});

/**
 * Error counter by type
 * Tracks different error types in the application
 */
const errorCounter = new promClient.Counter({
  name: 'ai_curator_errors_total',
  help: 'Total number of errors by type',
  labelNames: ['error_type', 'error_code'],
  registers: [register]
});

// Business Metrics

/**
 * Content discovery metrics
 */
const contentDiscoveryCounter = new promClient.Counter({
  name: 'ai_curator_content_discovered_total',
  help: 'Total number of content items discovered',
  labelNames: ['source_type', 'source_name'],
  registers: [register]
});

const contentProcessingDuration = new promClient.Histogram({
  name: 'ai_curator_content_processing_duration_seconds',
  help: 'Time taken to process content items',
  labelNames: ['stage', 'source_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register]
});

/**
 * Tagging metrics
 */
const tagsGeneratedCounter = new promClient.Counter({
  name: 'ai_curator_tags_generated_total',
  help: 'Total number of tags generated',
  labelNames: ['tag_type', 'confidence_level'],
  registers: [register]
});

const taggingAccuracyGauge = new promClient.Gauge({
  name: 'ai_curator_tagging_accuracy',
  help: 'Tagging accuracy percentage',
  labelNames: ['model_version'],
  registers: [register]
});

/**
 * Vector database metrics
 */
const vectorOperationsCounter = new promClient.Counter({
  name: 'ai_curator_vector_operations_total',
  help: 'Total vector database operations',
  labelNames: ['operation_type', 'status'],
  registers: [register]
});

const vectorSearchDuration = new promClient.Histogram({
  name: 'ai_curator_vector_search_duration_seconds',
  help: 'Vector search query duration',
  labelNames: ['index_name'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register]
});

/**
 * Cache metrics
 */
const cacheHitRate = new promClient.Gauge({
  name: 'ai_curator_cache_hit_rate',
  help: 'Cache hit rate percentage',
  labelNames: ['cache_type'],
  registers: [register]
});

const cacheOperationsCounter = new promClient.Counter({
  name: 'ai_curator_cache_operations_total',
  help: 'Total cache operations',
  labelNames: ['operation', 'cache_type', 'status'],
  registers: [register]
});

/**
 * Rate limiting metrics
 */
const rateLimitExceeded = new promClient.Counter({
  name: 'ai_curator_rate_limit_exceeded_total',
  help: 'Total number of rate limit exceeded responses',
  labelNames: ['endpoint', 'method'],
  registers: [register]
});

const rateLimitChecks = new promClient.Counter({
  name: 'ai_curator_rate_limit_checks_total',
  help: 'Total number of rate limit checks performed',
  labelNames: ['tier', 'result'],
  registers: [register]
});

/**
 * API usage metrics
 */
const apiCallsCounter = new promClient.Counter({
  name: 'ai_curator_external_api_calls_total',
  help: 'Total external API calls',
  labelNames: ['api_name', 'endpoint', 'status'],
  registers: [register]
});

const apiResponseTime = new promClient.Histogram({
  name: 'ai_curator_external_api_response_time_seconds',
  help: 'External API response time',
  labelNames: ['api_name', 'endpoint'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

/**
 * System health metrics
 */
const systemHealthGauge = new promClient.Gauge({
  name: 'ai_curator_system_health',
  help: 'Overall system health score (0-100)',
  registers: [register]
});

const componentHealthGauge = new promClient.Gauge({
  name: 'ai_curator_component_health',
  help: 'Component health status',
  labelNames: ['component_name'],
  registers: [register]
});

/**
 * Normalize route paths for consistent metric labels
 * Replaces dynamic segments with placeholders
 */
export function normalizeRoute(path: string): string {
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/:uuid')
    .replace(/\/[a-f0-9]{24}/g, '/:objectId');
}

/**
 * Prometheus metrics collection middleware
 * Tracks HTTP request metrics automatically
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const route = normalizeRoute(req.originalUrl || req.url || 'unknown');
  const method = req.method;

  // Increment active requests
  httpRequestsActive.labels(method, route).inc();

  // Track response
  const originalSend = res.send;
  res.send = function (data): Response {
    const duration = (Date.now() - start) / 1000;
    const statusCode = res.statusCode.toString();

    // Record metrics
    httpRequestDuration.labels(method, route, statusCode).observe(duration);
    httpRequestsTotal.labels(method, route, statusCode).inc();
    httpRequestsActive.labels(method, route).dec();

    // Track errors
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
      errorCounter.labels(errorType, statusCode).inc();
    }

    // Log slow requests
    if (duration > 1) {
      logger.warn('Slow request detected', {
        method,
        route,
        duration,
        statusCode
      });
    }

    return originalSend.call(this, data);
  };

  next();
}

/**
 * Export metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Export the registry for custom metric registration
 */
export { register };

/**
 * Export individual metrics for use in application code
 */
export const metrics = {
  // HTTP metrics
  httpRequestDuration,
  httpRequestsTotal,
  httpRequestsActive,
  errorCounter,
  
  // Business metrics
  contentDiscoveryCounter,
  contentProcessingDuration,
  tagsGeneratedCounter,
  taggingAccuracyGauge,
  
  // Infrastructure metrics
  vectorOperationsCounter,
  vectorSearchDuration,
  cacheHitRate,
  cacheOperationsCounter,
  apiCallsCounter,
  apiResponseTime,
  
  // Rate limiting metrics
  rateLimitExceeded,
  rateLimitChecks,
  
  // Health metrics
  systemHealthGauge,
  componentHealthGauge
};

/**
 * Increment content discovery counter
 */
export function recordContentDiscovery(sourceType: string, sourceName: string): void {
  contentDiscoveryCounter.labels(sourceType, sourceName).inc();
}

/**
 * Record content processing duration
 */
export function recordContentProcessingTime(stage: string, sourceType: string, duration: number): void {
  contentProcessingDuration.labels(stage, sourceType).observe(duration);
}

/**
 * Record tag generation
 */
export function recordTagGeneration(tagType: string, confidence: 'high' | 'medium' | 'low'): void {
  tagsGeneratedCounter.labels(tagType, confidence).inc();
}

/**
 * Record vector operation
 */
export function recordVectorOperation(operation: string, success: boolean): void {
  const status = success ? 'success' : 'failure';
  vectorOperationsCounter.labels(operation, status).inc();
}

/**
 * Record vector search duration
 */
export function recordVectorSearchTime(indexName: string, duration: number): void {
  vectorSearchDuration.labels(indexName).observe(duration);
}

/**
 * Record cache operation
 */
export function recordCacheOperation(operation: string, cacheType: string, hit: boolean): void {
  const status = hit ? 'hit' : 'miss';
  cacheOperationsCounter.labels(operation, cacheType, status).inc();
}

/**
 * Update cache hit rate
 */
export function updateCacheHitRate(cacheType: string, hitRate: number): void {
  cacheHitRate.labels(cacheType).set(hitRate);
}

/**
 * Record external API call
 */
export function recordApiCall(apiName: string, endpoint: string, success: boolean): void {
  const status = success ? 'success' : 'failure';
  apiCallsCounter.labels(apiName, endpoint, status).inc();
}

/**
 * Record external API response time
 */
export function recordApiResponseTime(apiName: string, endpoint: string, duration: number): void {
  apiResponseTime.labels(apiName, endpoint).observe(duration);
}

/**
 * Update system health score
 */
export function updateSystemHealth(score: number): void {
  systemHealthGauge.set(Math.max(0, Math.min(100, score)));
}

/**
 * Update component health
 */
export function updateComponentHealth(component: string, isHealthy: boolean): void {
  componentHealthGauge.labels(component).set(isHealthy ? 1 : 0);
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.clear();
}