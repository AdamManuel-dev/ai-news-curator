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

// Create a stream object with a 'write' function for Morgan middleware
export const logStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

// Helper functions for common logging patterns
export const logRequestStart = (method: string, url: string, requestId?: string): void => {
  logger.info('Request started', {
    method,
    url,
    requestId,
    event: 'request_start',
  });
};

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

export const logError = (error: Error, context?: Record<string, any>): void => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    event: 'application_error',
    ...context,
  });
};

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

export const logBusinessEvent = (event: string, data: Record<string, any>): void => {
  logger.info('Business event', {
    event,
    ...data,
  });
};

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
