/**
 * @fileoverview Centralized logging utility with Winston integration
 * @lastmodified 2025-07-28T01:43:24Z
 * 
 * Features: Structured logging, multiple transports, environment-specific formats, helper functions
 * Main APIs: logger instance, logRequestStart(), logRequestEnd(), logError(), logApiCall()
 * Constraints: Requires Winston, config for log levels and environment
 * Patterns: Singleton logger, structured JSON logging, helper function exports
 */

import winston from 'winston';
import { config } from '@config/index';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'white',
  debug: 'blue',
  silly: 'grey',
};

winston.addColors(colors);

// Custom format for structured logging
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    return JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      message,
      ...meta,
    });
  })
);

// Development format with colors
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaString = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

// Define which transports to use
const transports: winston.transport[] = [];

// Console transport for all environments
if (config.nodeEnv === 'development') {
  transports.push(
    new winston.transports.Console({
      level: config.enableDebugLogging ? 'debug' : 'info',
      format: developmentFormat,
    })
  );
} else {
  transports.push(
    new winston.transports.Console({
      level: config.logLevel,
      format,
    })
  );
}

// File transports for production
if (config.nodeEnv === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: config.logLevel || 'info',
  levels,
  format,
  transports,
  exitOnError: false,
});

/**
 * Stream object with write function for Morgan HTTP request logging.
 * 
 * Redirects Morgan's HTTP logs through Winston at 'http' level for
 * consistent log formatting and transport handling.
 * 
 * @since 1.0.0
 */
export const logStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

/**
 * Logs the start of an HTTP request with method, URL and request ID.
 * 
 * @param method - HTTP method (GET, POST, etc.)
 * @param url - Request URL path
 * @param requestId - Optional unique request identifier
 * 
 * @example
 * ```typescript
 * logRequestStart('GET', '/api/users', 'req-123');
 * ```
 * 
 * @since 1.0.0
 */
export const logRequestStart = (method: string, url: string, requestId?: string): void => {
  logger.info('Request started', {
    method,
    url,
    requestId,
    event: 'request_start',
  });
};

/**
 * Logs the completion of an HTTP request with response metrics.
 * 
 * @param method - HTTP method
 * @param url - Request URL path
 * @param statusCode - HTTP response status code
 * @param responseTime - Request duration in milliseconds
 * @param requestId - Optional unique request identifier
 * 
 * @example
 * ```typescript
 * logRequestEnd('GET', '/api/users', 200, 150, 'req-123');
 * ```
 * 
 * @since 1.0.0
 */
export const logRequestEnd = (
  method: string,
  url: string,
  statusCode: number,
  responseTime: number,
  requestId?: string
): void => {
  logger.info('Request completed', {
    method,
    url,
    statusCode,
    responseTime,
    requestId,
    event: 'request_end',
  });
};

/**
 * Logs application errors with stack traces and additional context.
 * 
 * @param error - Error object to log
 * @param context - Additional context data to include
 * 
 * @example
 * ```typescript
 * logError(new Error('Database connection failed'), { userId: '123' });
 * ```
 * 
 * @since 1.0.0
 */
export const logError = (error: Error, context?: Record<string, any>): void => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    event: 'application_error',
    ...context,
  });
};

/**
 * Logs external API calls with timing and error information.
 * 
 * @param api - API name or identifier
 * @param method - API method or endpoint
 * @param status - Call status (start, success, error)
 * @param duration - Optional call duration in milliseconds
 * @param error - Optional error object if call failed
 * 
 * @example
 * ```typescript
 * logApiCall('redis', 'get', 'success', 25);
 * logApiCall('external-api', 'fetch-data', 'error', 5000, error);
 * ```
 * 
 * @since 1.0.0
 */
export const logApiCall = (
  api: string,
  method: string,
  status: 'start' | 'success' | 'error',
  duration?: number,
  error?: Error
): void => {
  const logData = {
    api,
    method,
    status,
    event: 'external_api_call',
    ...(duration && { duration }),
    ...(error && { error: error.message }),
  };

  if (status === 'error') {
    logger.error('External API call failed', logData);
  } else {
    logger.info('External API call', logData);
  }
};

/**
 * Logs business events for analytics and monitoring.
 * 
 * @param event - Business event name
 * @param data - Event data and context
 * 
 * @example
 * ```typescript
 * logBusinessEvent('user_registered', { userId: '123', plan: 'premium' });
 * ```
 * 
 * @since 1.0.0
 */
export const logBusinessEvent = (event: string, data: Record<string, any>): void => {
  logger.info('Business event', {
    event,
    ...data,
  });
};

/**
 * Logs performance metrics for monitoring and alerting.
 * 
 * @param metric - Metric name
 * @param value - Metric value
 * @param unit - Unit of measurement
 * @param context - Optional additional context
 * 
 * @example
 * ```typescript
 * logPerformanceMetric('api_response_time', 150, 'ms', { endpoint: '/users' });
 * ```
 * 
 * @since 1.0.0
 */
export const logPerformanceMetric = (
  metric: string,
  value: number,
  unit: string,
  context?: Record<string, any>
): void => {
  logger.info('Performance metric', {
    metric,
    value,
    unit,
    event: 'performance_metric',
    ...context,
  });
};

export default logger;
