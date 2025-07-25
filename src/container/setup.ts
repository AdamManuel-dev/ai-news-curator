import 'reflect-metadata';
import { config } from '@config/index';
import logger from '@utils/logger';
import { redisAdapter } from '@adapters/redis';
import { CacheService } from '@services/cache';
import { CacheManager } from '@services/cache-manager';
import { redisHealthService } from '@services/redis-health';
import { DatabaseService } from '@database/service';
import { DatabaseConnection } from '@database/connection';
import { HealthController } from '@controllers/health';
import { pineconeService } from '@services/vectordb';
import { OAuthService } from '@services/auth/oauth';
import { ApiKeyService } from '@services/auth/api-key';
import { container } from './Container';
import { TOKENS } from './tokens';

// Configure the dependency injection container
export function setupContainer(): void {
  // Register configuration
  container.registerInstance(TOKENS.CONFIG, config);

  // Register logger
  container.registerInstance(TOKENS.LOGGER, logger);

  // Register Redis adapter
  container.registerInstance(TOKENS.REDIS_ADAPTER, redisAdapter);

  // Register Database Service
  container.registerSingleton(TOKENS.DATABASE_SERVICE, DatabaseService);

  // Register Cache Service
  container.registerSingleton(TOKENS.CACHE_SERVICE, CacheService);

  // Register Cache Manager (factory function)
  container.registerFactory(TOKENS.CACHE_MANAGER, () => {
    const cacheService = container.resolve<CacheService>(TOKENS.CACHE_SERVICE);
    return new CacheManager(cacheService);
  });

  // Register Redis Health Service
  container.registerInstance(TOKENS.REDIS_HEALTH_SERVICE, redisHealthService);

  // Register Vector Database Service
  container.registerInstance(TOKENS.VECTOR_DB, pineconeService);
  container.registerInstance(TOKENS.PINECONE_CLIENT, pineconeService);

  // Register Database Connection
  container.registerFactory(TOKENS.DATABASE, () => {
    return new DatabaseConnection(config.database);
  });

  // Register Authentication Services
  container.registerFactory(TOKENS.OAUTH_SERVICE, () => {
    const db = container.resolve<DatabaseConnection>(TOKENS.DATABASE);
    return new OAuthService(db);
  });

  container.registerFactory(TOKENS.API_KEY_SERVICE, () => {
    const db = container.resolve<DatabaseConnection>(TOKENS.DATABASE);
    return new ApiKeyService(db);
  });

  // Register Controllers
  container.registerSingleton(TOKENS.HEALTH_CONTROLLER, HealthController);

  // Register basic services that will be implemented later
  // These are placeholders for now

  // Note: As we implement more services, we'll add them here
  // For now, we just register the core dependencies
}

// Initialize container setup
setupContainer();

// Export container for use in tests and other modules
export { container };
