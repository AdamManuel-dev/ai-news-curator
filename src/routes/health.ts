/**
 * @fileoverview Health check endpoints for application monitoring
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Basic and detailed health status reporting
 * Main APIs: GET /, GET /detailed
 * Constraints: Depends on HealthController from container
 * Patterns: Lazy loading controller to avoid circular dependencies
 */

import { Router, Request, Response } from 'express';
import { container, HEALTH_CONTROLLER } from '@container/index';
import type { HealthController } from '@controllers/health';

const router = Router();

// Basic health check endpoint
router.get('/', (req: Request, res: Response) => {
  // Lazy load the health controller to avoid circular dependency issues
  const healthController = container.resolve<HealthController>(HEALTH_CONTROLLER);
  return healthController.getHealthStatus(req, res);
});

// Detailed health check endpoint
router.get('/detailed', (req: Request, res: Response) => {
  // Lazy load the health controller to avoid circular dependency issues
  const healthController = container.resolve<HealthController>(HEALTH_CONTROLLER);
  return healthController.getDetailedHealthStatus(req, res);
});

export { router as healthRouter };
