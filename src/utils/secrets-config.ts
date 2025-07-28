/**
 * @fileoverview Utility to integrate secrets manager with application configuration
 * @lastmodified 2025-07-27T18:45:00Z
 * 
 * Features: Configuration loading with secrets override, validation, initialization
 * Main APIs: loadConfigWithSecrets(), validateSecrets(), initializeSecrets()
 * Constraints: Requires secrets backend setup, validates required secrets
 * Patterns: Config override pattern, async initialization, environment detection
 */

import { secretsManager, FileSecretBackend, getConfigWithSecrets } from '@/services/secrets';
import { AWSSecretsManagerBackend } from '@/services/secrets/aws-backend';
import logger from '@/utils/logger';
import { config as originalConfig } from '@/config';

let configInitialized = false;
let enhancedConfig: any = null;

/**
 * Initialize secrets backends based on environment
 */
export async function initializeSecretsBackends(): Promise<void> {
  try {
    // Always register file backend for development and local secrets
    const fileBackend = new FileSecretBackend('./secrets');
    secretsManager.registerBackend('file', fileBackend);

    // Register AWS Secrets Manager in production/staging
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
      try {
        const awsRegion = process.env.AWS_REGION || 'us-east-1';
        const secretsPrefix = process.env.AWS_SECRETS_PREFIX || `ai-curator/${process.env.NODE_ENV}/`;
        
        const awsBackend = new AWSSecretsManagerBackend(awsRegion, secretsPrefix);
        secretsManager.registerBackend('aws', awsBackend);
        
        // Use AWS as primary backend in production
        if (process.env.NODE_ENV === 'production') {
          secretsManager.setDefaultBackend('aws');
        }
        
        logger.info('AWS Secrets Manager backend registered');
      } catch (error) {
        logger.warn('Failed to initialize AWS Secrets Manager, falling back to file backend:', error);
      }
    }

    // In development, use file backend by default
    if (process.env.NODE_ENV === 'development') {
      secretsManager.setDefaultBackend('file');
    }

    logger.info('Secrets backends initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize secrets backends:', error);
    throw error;
  }
}

/**
 * Load configuration with secrets override
 */
export async function loadConfigWithSecrets(): Promise<any> {
  if (!configInitialized) {
    await initializeSecretsBackends();
    enhancedConfig = await getConfigWithSecrets();
    configInitialized = true;
    
    logger.info('Configuration loaded with secrets integration');
  }
  
  return enhancedConfig;
}

/**
 * Get the enhanced configuration (initialize if needed)
 */
export async function getEnhancedConfig(): Promise<any> {
  if (!enhancedConfig) {
    return await loadConfigWithSecrets();
  }
  return enhancedConfig;
}

/**
 * Validate that all required secrets are available
 */
export async function validateRequiredSecrets(): Promise<void> {
  const validation = await secretsManager.validateConfiguration();
  
  if (!validation.valid) {
    logger.error('Secrets validation failed:', validation.errors);
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Required secrets are missing: ${validation.errors.join(', ')}`);
    } else {
      logger.warn('Some secrets are missing in development mode. Application may have limited functionality.');
    }
  } else {
    logger.info('All required secrets are configured correctly');
  }
}

/**
 * Initialize default secrets for development
 */
export async function initializeDefaultSecrets(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  try {
    const defaultSecrets = [
      {
        key: 'JWT_SECRET',
        value: 'dev-jwt-secret-change-in-production-' + Math.random().toString(36),
        metadata: {
          description: 'JWT signing secret for development',
          environment: 'development',
          rotationInterval: 90,
        },
      },
      {
        key: 'JWT_REFRESH_SECRET',
        value: 'dev-refresh-secret-change-in-production-' + Math.random().toString(36),
        metadata: {
          description: 'JWT refresh token secret for development',
          environment: 'development',
          rotationInterval: 90,
        },
      },
      {
        key: 'DB_PASSWORD',
        value: 'dev-postgres-password',
        metadata: {
          description: 'PostgreSQL password for development',
          environment: 'development',
        },
      },
    ];

    for (const secret of defaultSecrets) {
      const existing = await secretsManager.getSecret(secret.key, 'file');
      if (!existing) {
        await secretsManager.setSecret(secret.key, secret.value, secret.metadata, 'file');
        logger.info(`Initialized default secret: ${secret.key}`);
      }
    }

    logger.info('Default development secrets initialized');
  } catch (error) {
    logger.error('Failed to initialize default secrets:', error);
  }
}

/**
 * Rotate secrets that are due for rotation
 */
export async function rotateExpiredSecrets(): Promise<void> {
  try {
    const backends = process.env.NODE_ENV === 'production' ? ['aws', 'file'] : ['file'];
    
    for (const backend of backends) {
      try {
        const rotatedKeys = await secretsManager.rotateExpiredSecrets(backend);
        if (rotatedKeys.length > 0) {
          logger.info(`Rotated ${rotatedKeys.length} expired secrets in ${backend} backend:`, rotatedKeys);
        }
      } catch (error) {
        logger.error(`Failed to rotate secrets in ${backend} backend:`, error);
      }
    }
  } catch (error) {
    logger.error('Failed to rotate expired secrets:', error);
  }
}

/**
 * Get a specific secret with fallback to multiple backends
 */
export async function getSecretWithFallback(key: string): Promise<string | null> {
  const backends = process.env.NODE_ENV === 'production' 
    ? ['aws', 'file', 'environment'] 
    : ['file', 'environment'];

  for (const backend of backends) {
    try {
      const value = await secretsManager.getSecret(key, backend);
      if (value) {
        return value;
      }
    } catch (error) {
      logger.debug(`Failed to get secret ${key} from ${backend} backend:`, error);
    }
  }

  return null;
}

/**
 * Setup secrets management during application startup
 */
export async function setupSecretsManagement(): Promise<void> {
  try {
    logger.info('Setting up secrets management...');
    
    // Initialize backends
    await initializeSecretsBackends();
    
    // Initialize default secrets in development
    await initializeDefaultSecrets();
    
    // Validate required secrets
    await validateRequiredSecrets();
    
    // Load configuration with secrets
    await loadConfigWithSecrets();
    
    logger.info('Secrets management setup completed successfully');
  } catch (error) {
    logger.error('Failed to setup secrets management:', error);
    
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
}

/**
 * Gracefully shutdown secrets management
 */
export async function shutdownSecretsManagement(): Promise<void> {
  try {
    // Perform any cleanup if needed
    logger.info('Secrets management shutdown completed');
  } catch (error) {
    logger.error('Error during secrets management shutdown:', error);
  }
}

// Export the secrets manager instance for direct access
export { secretsManager };