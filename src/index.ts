/**
 * @fileoverview Express application entry point for AI content curator
 * 
 * Features: Security headers, CORS, rate limiting, auth, metrics, health checks
 * Main APIs: startServer(), /health, /auth, /api-keys, /roles, /metrics
 * Constraints: Requires config vars, Redis for rate limiting, 10mb body limit
 * Patterns: Graceful shutdown, global error handling, middleware composition
 */

import 'reflect-metadata';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { config } from '@config/index';
import { errorHandler, notFoundHandler, requestLogger, sanitizeInput, metricsMiddleware, serializerMiddleware, rateLimitMiddleware, authRateLimit } from '@middleware/index';
import logger, { logStream } from '@utils/logger';
import { createHttpsServer, configureTLSSecurity, validateTLSConfig, getTLSConfigSummary } from '@utils/tls';
import { healthRouter } from '@routes/health';
import { metricsRouter } from '@routes/metrics';
import { authRouter } from '@routes/auth';
import { apiKeysRouter } from '@routes/api-keys';
import { rolesRouter, poolMonitorRouter } from '@routes/index';
import { rateLimitRouter } from '@routes/rate-limit';
import { adminRouter } from '@routes/admin';
import '@container/setup'; // Initialize dependency injection container

// Load environment variables from .env file
dotenv.config();

/**
 * Express application instance with comprehensive middleware stack.
 * Configured for production-ready deployment with security, logging,
 * and error handling.
 */
const app = express();

// Configure TLS security settings
configureTLSSecurity(app);

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

// Apply global rate limiting
app.use(rateLimitMiddleware());

// Metrics middleware (after rate limiting to track limited requests)
app.use(metricsMiddleware);
app.use(serializerMiddleware);

// Health check routes (no rate limiting)
app.use('/health', healthRouter);

// Metrics endpoint for Prometheus scraping (no rate limiting)
app.use('/metrics', metricsRouter);

// Rate limit info endpoint
app.use('/rate-limit', rateLimitRouter);

// Authentication routes with strict rate limiting
app.use('/auth', authRateLimit, authRouter);

// API key management routes
app.use('/api-keys', apiKeysRouter);

// Role management routes
app.use('/roles', rolesRouter);

// Admin management routes
app.use('/admin', adminRouter);

// Database pool monitoring routes
app.use('/pool', poolMonitorRouter);

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
 * Starts the Express server with HTTP and optionally HTTPS.
 *
 * Initializes HTTP server and HTTPS server (if configured) with comprehensive
 * logging and error handling for both protocols.
 *
 * @returns {void}
 *
 * @example
 * ```typescript
 * // Start the server
 * startServer();
 * // Server will be available at http://localhost:3000 and https://localhost:3443
 * ```
 *
 * @since 1.0.0
 */
const startServer = (): void => {
  // Validate TLS configuration if HTTPS is enabled
  if (config.https.enabled) {
    const validation = validateTLSConfig();
    if (!validation.valid) {
      logger.error('Invalid TLS configuration', {
        errors: validation.errors
      });
      process.exit(1);
    }
    
    logger.info('TLS configuration validated', getTLSConfigSummary());
  }

  // Start HTTP server
  const httpServer = app.listen(config.port, () => {
    logger.info('HTTP server started successfully', {
      port: config.port,
      protocol: 'http',
      environment: config.nodeEnv,
      logLevel: config.logLevel,
      timestamp: new Date().toISOString(),
    });
  });

  // Start HTTPS server if enabled
  if (config.https.enabled) {
    const httpsServer = createHttpsServer(app);
    
    if (httpsServer) {
      httpsServer.listen(config.https.port, () => {
        logger.info('HTTPS server started successfully', {
          port: config.https.port,
          protocol: 'https',
          environment: config.nodeEnv,
          forceHttps: config.https.forceHttps,
          trustProxy: config.https.trustProxy,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle HTTPS server errors
      httpsServer.on('error', (error: any) => {
        logger.error('HTTPS server error', {
          error: error.message,
          code: error.code,
          port: config.https.port
        });
        
        if (error.code === 'EADDRINUSE') {
          logger.error(`HTTPS port ${config.https.port} is already in use`);
          process.exit(1);
        }
      });

      // Graceful HTTPS server shutdown
      process.on('SIGTERM', () => {
        logger.info('SIGTERM signal received: closing HTTPS server');
        httpsServer.close(() => {
          logger.info('HTTPS server closed');
        });
      });

      process.on('SIGINT', () => {
        logger.info('SIGINT signal received: closing HTTPS server');
        httpsServer.close(() => {
          logger.info('HTTPS server closed');
        });
      });
    } else {
      logger.error('Failed to create HTTPS server - falling back to HTTP only');
    }
  }

  // Handle HTTP server errors
  httpServer.on('error', (error: any) => {
    logger.error('HTTP server error', {
      error: error.message,
      code: error.code,
      port: config.port
    });
    
    if (error.code === 'EADDRINUSE') {
      logger.error(`HTTP port ${config.port} is already in use`);
      process.exit(1);
    }
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
