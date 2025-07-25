import { Request, Response } from 'express';
import { container, LOGGER } from '@container/index';
import { logError } from '@utils/logger';
import type { Logger } from 'winston';

export abstract class BaseController {
  protected logger: Logger;

  constructor() {
    this.logger = container.resolve<Logger>(LOGGER);
  }

  protected async handleRequest(
    req: Request,
    res: Response,
    handler: () => Promise<any>
  ): Promise<void> {
    try {
      const result = await handler();
      res.json({
        success: true,
        data: result,
        requestId: req.requestId,
      });
    } catch (error) {
      logError(error as Error, {
        controller: this.constructor.name,
        method: req.method,
        url: req.url,
        requestId: req.requestId,
      });

      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        requestId: req.requestId,
      });
    }
  }

  protected sendSuccess(res: Response, data: any, requestId?: string): void {
    res.json({
      success: true,
      data,
      requestId,
    });
  }

  protected sendError(
    res: Response,
    message: string,
    statusCode: number = 400,
    requestId?: string
  ): void {
    res.status(statusCode).json({
      success: false,
      error: message,
      requestId,
    });
  }
}

export * from './health';
export * from './enhanced-base';
