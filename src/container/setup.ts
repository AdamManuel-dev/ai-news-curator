import 'reflect-metadata';
import { config } from '@config/index';
import logger from '@utils/logger';
import { redisAdapter } from '@adapters/redis';
import { CacheService } from '@services/cache';
import { HealthController } from '@controllers/health';
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

  // Register Cache Service
  container.registerSingleton(TOKENS.CACHE_SERVICE, CacheService);

  // Register Controllers
  container.registerSingleton(TOKENS.HEALTH_CONTROLLER, HealthController);

  // Register basic services that will be implemented later
  // These are placeholders for now

  // Note: As we implement more services, we'll add them here
  // For now, we just register the core dependencies
}

// Initialize container setup
setupContainer();
