import { logError } from '@utils/logger';
import { container, LOGGER, CONFIG } from '@container/index';
import type { AppConfig } from '@config/index';
import type { Logger } from 'winston';

export abstract class BaseService {
  protected logger: Logger;

  protected config: AppConfig;

  constructor() {
    this.logger = container.resolve<Logger>(LOGGER);
    this.config = container.resolve<AppConfig>(CONFIG);
  }

  protected async handleError(
    error: Error,
    context: string,
    additionalData?: Record<string, any>
  ): Promise<void> {
    logError(error, {
      service: this.constructor.name,
      context,
      ...additionalData,
    });
  }

  protected logInfo(message: string, data?: Record<string, any>): void {
    this.logger.info(message, {
      service: this.constructor.name,
      ...data,
    });
  }

  protected logDebug(message: string, data?: Record<string, any>): void {
    this.logger.debug(message, {
      service: this.constructor.name,
      ...data,
    });
  }

  protected logWarn(message: string, data?: Record<string, any>): void {
    this.logger.warn(message, {
      service: this.constructor.name,
      ...data,
    });
  }
}

export * from './cache';
