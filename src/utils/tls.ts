/**
 * @fileoverview TLS/HTTPS configuration utilities for secure server setup
 * @lastmodified 2025-01-27T22:45:00Z
 * 
 * Features: SSL certificate loading, HTTPS server creation, security headers, proxy trust
 * Main APIs: loadTLSOptions(), createHttpsServer(), enforceHttpsMiddleware()
 * Constraints: Requires valid certificates, file system access, Node.js HTTPS module
 * Patterns: Certificate validation, graceful fallbacks, security-first configuration
 */

import fs from 'fs';
import https from 'https';
import { Express } from 'express';
import { config } from '@config/index';
import logger from './logger';

/**
 * TLS certificate options
 */
export interface TLSOptions {
  key?: string | Buffer;
  cert?: string | Buffer;
  ca?: string | Buffer;
  passphrase?: string;
}

/**
 * HTTPS server configuration
 */
export interface HttpsServerConfig {
  options: TLSOptions;
  port: number;
  enabled: boolean;
}

/**
 * Load TLS certificate files from disk
 */
export function loadTLSOptions(): TLSOptions | null {
  const { https: httpsConfig } = config;

  if (!httpsConfig.enabled) {
    logger.debug('HTTPS is disabled');
    return null;
  }

  const options: TLSOptions = {};

  try {
    // Load private key
    if (httpsConfig.keyPath) {
      if (!fs.existsSync(httpsConfig.keyPath)) {
        throw new Error(`TLS private key file not found: ${httpsConfig.keyPath}`);
      }
      options.key = fs.readFileSync(httpsConfig.keyPath, 'utf8');
      logger.debug('TLS private key loaded successfully');
    } else {
      throw new Error('TLS_KEY_PATH is required when HTTPS is enabled');
    }

    // Load certificate
    if (httpsConfig.certPath) {
      if (!fs.existsSync(httpsConfig.certPath)) {
        throw new Error(`TLS certificate file not found: ${httpsConfig.certPath}`);
      }
      options.cert = fs.readFileSync(httpsConfig.certPath, 'utf8');
      logger.debug('TLS certificate loaded successfully');
    } else {
      throw new Error('TLS_CERT_PATH is required when HTTPS is enabled');
    }

    // Load CA bundle (optional)
    if (httpsConfig.caPath) {
      if (fs.existsSync(httpsConfig.caPath)) {
        options.ca = fs.readFileSync(httpsConfig.caPath, 'utf8');
        logger.debug('TLS CA bundle loaded successfully');
      } else {
        logger.warn(`TLS CA bundle file not found: ${httpsConfig.caPath}`);
      }
    }

    // Set passphrase if provided
    if (httpsConfig.passphrase) {
      options.passphrase = httpsConfig.passphrase;
      logger.debug('TLS passphrase configured');
    }

    return options;
  } catch (error) {
    logger.error('Failed to load TLS options', {
      error: error instanceof Error ? error.message : 'Unknown error',
      keyPath: httpsConfig.keyPath,
      certPath: httpsConfig.certPath,
      caPath: httpsConfig.caPath
    });
    return null;
  }
}

/**
 * Create HTTPS server with the provided Express app
 */
export function createHttpsServer(app: Express): https.Server | null {
  const tlsOptions = loadTLSOptions();
  
  if (!tlsOptions) {
    return null;
  }

  try {
    const httpsServer = https.createServer(tlsOptions, app);
    
    // Configure server options
    httpsServer.timeout = 30000; // 30 seconds
    httpsServer.keepAliveTimeout = 5000; // 5 seconds
    httpsServer.headersTimeout = 10000; // 10 seconds

    logger.info('HTTPS server created successfully', {
      port: config.https.port,
      hasKey: !!tlsOptions.key,
      hasCert: !!tlsOptions.cert,
      hasCA: !!tlsOptions.ca,
      hasPassphrase: !!tlsOptions.passphrase
    });

    return httpsServer;
  } catch (error) {
    logger.error('Failed to create HTTPS server', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

/**
 * Middleware to enforce HTTPS redirects
 */
export function enforceHttpsMiddleware() {
  return (req: any, res: any, next: any) => {
    // Check if we should enforce HTTPS
    if (!config.https.forceHttps) {
      return next();
    }

    // Skip enforcement for health checks and localhost
    if (req.path === '/health' || req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
      return next();
    }

    // Check if request is already secure
    const isSecure = req.secure || 
                    req.headers['x-forwarded-proto'] === 'https' ||
                    req.headers['x-forwarded-ssl'] === 'on';

    if (!isSecure) {
      const httpsUrl = `https://${req.get('Host')}${req.originalUrl}`;
      
      logger.info('Redirecting to HTTPS', {
        originalUrl: req.originalUrl,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      return res.redirect(301, httpsUrl);
    }

    next();
  };
}

/**
 * Configure Express app for HTTPS/TLS security
 */
export function configureTLSSecurity(app: Express): void {
  const { https: httpsConfig } = config;

  // Trust proxy if configured (for load balancers, CDNs)
  if (httpsConfig.trustProxy) {
    app.set('trust proxy', true);
    logger.info('Express configured to trust proxy headers');
  }

  // Add security headers for HTTPS
  app.use((req, res, next) => {
    // Strict Transport Security (HSTS)
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Secure cookie settings in production
    if (config.nodeEnv === 'production') {
      res.setHeader('Set-Cookie', res.getHeader('Set-Cookie') + '; Secure; SameSite=Strict');
    }

    next();
  });

  // Apply HTTPS enforcement middleware if enabled
  if (httpsConfig.forceHttps) {
    app.use(enforceHttpsMiddleware());
    logger.info('HTTPS enforcement enabled');
  }
}

/**
 * Validate TLS configuration
 */
export function validateTLSConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { https: httpsConfig } = config;

  if (!httpsConfig.enabled) {
    return { valid: true, errors: [] };
  }

  // Check required fields
  if (!httpsConfig.keyPath) {
    errors.push('TLS_KEY_PATH is required when HTTPS is enabled');
  }

  if (!httpsConfig.certPath) {
    errors.push('TLS_CERT_PATH is required when HTTPS is enabled');
  }

  // Check file existence
  if (httpsConfig.keyPath && !fs.existsSync(httpsConfig.keyPath)) {
    errors.push(`TLS private key file does not exist: ${httpsConfig.keyPath}`);
  }

  if (httpsConfig.certPath && !fs.existsSync(httpsConfig.certPath)) {
    errors.push(`TLS certificate file does not exist: ${httpsConfig.certPath}`);
  }

  if (httpsConfig.caPath && !fs.existsSync(httpsConfig.caPath)) {
    errors.push(`TLS CA bundle file does not exist: ${httpsConfig.caPath}`);
  }

  // Validate port
  if (httpsConfig.port < 1 || httpsConfig.port > 65535) {
    errors.push(`Invalid HTTPS port: ${httpsConfig.port}`);
  }

  // Check for port conflicts
  if (httpsConfig.port === config.port) {
    errors.push('HTTPS port cannot be the same as HTTP port');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get TLS configuration summary for logging
 */
export function getTLSConfigSummary(): Record<string, any> {
  const { https: httpsConfig } = config;

  return {
    enabled: httpsConfig.enabled,
    port: httpsConfig.port,
    forceHttps: httpsConfig.forceHttps,
    trustProxy: httpsConfig.trustProxy,
    hasKeyPath: !!httpsConfig.keyPath,
    hasCertPath: !!httpsConfig.certPath,
    hasCAPath: !!httpsConfig.caPath,
    hasPassphrase: !!httpsConfig.passphrase
  };
}