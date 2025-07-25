/**
 * @fileoverview Main Express application entry point for the AI Content Curator Agent.
 *
 * This file sets up the Express server with comprehensive middleware stack including:
 * - Security headers and CORS configuration
 * - Request logging and sanitization
 * - Health monitoring endpoints
 * - Error handling and graceful shutdown
 *
 * The application follows a layered architecture with dependency injection
 * and provides RESTful APIs for content discovery and curation.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import 'reflect-metadata';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { config } from '@config/index';
import { errorHandler, notFoundHandler, requestLogger, sanitizeInput, metricsMiddleware, serializerMiddleware } from '@middleware/index';
import logger, { logStream } from '@utils/logger';
import { healthRouter } from '@routes/health';
import { metricsRouter } from '@routes/metrics';
import { authRouter } from '@routes/auth';
import { apiKeysRouter } from '@routes/api-keys';
import '@container/setup'; // Initialize dependency injection container

// Load environment variables from .env file
dotenv.config();

/**
 * Express application instance with comprehensive middleware stack.
 * Configured for production-ready deployment with security, logging,
 * and error handling.
 */
const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// CORS configuration
app.use(
  cors({
    origin:
      config.nodeEnv === 'production'
        ? ['https://yourdomain.com'] // Replace with actual domains
        : true, // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', { stream: logStream }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom middleware
app.use(requestLogger);
app.use(sanitizeInput);
app.use(metricsMiddleware);
app.use(serializerMiddleware);

// Health check routes
app.use('/health', healthRouter);

// Metrics endpoint for Prometheus scraping
app.use('/metrics', metricsRouter);

// Authentication routes
app.use('/auth', authRouter);

// API key management routes
app.use('/api-keys', apiKeysRouter);

// API routes will be added here
app.get('/', (_req, res) => {
  logger.info('Root endpoint accessed');
  res.json({
    message: 'AI Content Curator Agent API',
    version: '1.0.0',
    environment: config.nodeEnv,
  });
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

/**
 * Starts the Express server on the configured port.
 *
 * Initializes the HTTP server and logs startup information including
 * port, environment, and log level for debugging purposes.
 *
 * @returns {void}
 *
 * @example
 * ```typescript
 * // Start the server
 * startServer();
 * // Server will be available at http://localhost:3000
 * ```
 *
 * @since 1.0.0
 */
const startServer = (): void => {
  app.listen(config.port, () => {
    logger.info('Server started successfully', {
      port: config.port,
      environment: config.nodeEnv,
      logLevel: config.logLevel,
      timestamp: new Date().toISOString(),
    });
  });
};

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Unhandled error logging
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise: promise.toString(),
  });
});

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

export { app, startServer };
