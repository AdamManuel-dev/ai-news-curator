/**
 * @fileoverview Admin routes for system management and maintenance operations
 * 
 * Features: API key rotation, system cleanup, health monitoring, maintenance tasks
 * Main APIs: /admin/api-keys/rotate-expiring, /admin/cleanup, /admin/system-status
 * Constraints: Requires admin role, rate limited, audit logging enabled
 * Patterns: Admin-only access, comprehensive logging, batch operations
 */

import { Router, Request, Response } from 'express';
import { container } from '@container/setup';
import { TOKENS } from '@container/tokens';
import { ApiKeyService } from '@services/auth/api-key';
import { authenticateJWT } from '@middleware/auth';
import { requireRole } from '@middleware/rbac';
import { AuthenticatedRequest } from '@middleware/index';
import { validate } from '@middleware/validation';
import logger from '@utils/logger';

const router = Router();

/**
 * All admin routes require authentication and admin role
 */
router.use(authenticateJWT);
router.use(requireRole('admin'));

/**
 * POST /admin/api-keys/rotate-expiring
 * 
 * Rotate API keys that are expiring soon
 * 
 * @route POST /admin/api-keys/rotate-expiring
 * @body {object} Rotation parameters
 * @returns {object} Rotation results
 * @access Admin
 */
router.post('/api-keys/rotate-expiring', validate({
  body: {
    type: 'object',
    properties: {
      daysBeforeExpiry: {
        type: 'integer',
        minimum: 1,
        maximum: 30,
        default: 7
      },
      autoRotate: {
        type: 'boolean',
        default: false
      },
      dryRun: {
        type: 'boolean',
        default: true
      }
    },
    additionalProperties: false
  }
}), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { daysBeforeExpiry = 7, autoRotate = false, dryRun = true } = req.body;
    const adminUserId = req.user!.id;

    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    
    // If dry run, just check without rotating
    const actualAutoRotate = dryRun ? false : autoRotate;
    
    const result = await apiKeyService.rotateExpiringKeys(daysBeforeExpiry, actualAutoRotate);

    logger.info('Admin API key rotation check performed', {
      adminUserId,
      daysBeforeExpiry,
      autoRotate: actualAutoRotate,
      dryRun,
      keysExpiring: result.notified.length,
      keysRotated: result.rotated,
      results: result.rotationResults.length
    });

    res.json({
      message: dryRun 
        ? 'Dry run completed - no keys were rotated' 
        : `Rotation ${autoRotate ? 'completed' : 'check completed'}`,
      operation: {
        dry_run: dryRun,
        auto_rotate: actualAutoRotate,
        days_before_expiry: daysBeforeExpiry
      },
      results: {
        keys_expiring_soon: result.notified.length,
        keys_rotated: result.rotated,
        users_notified: result.notified,
        rotation_details: result.rotationResults
      },
      performed_by: adminUserId,
      performed_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Admin API key rotation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      adminUserId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to perform API key rotation',
      code: 'ADMIN_ROTATION_ERROR'
    });
  }
});

/**
 * POST /admin/cleanup
 * 
 * Run system cleanup operations
 * 
 * @route POST /admin/cleanup
 * @body {object} Cleanup parameters
 * @returns {object} Cleanup results
 * @access Admin
 */
router.post('/cleanup', validate({
  body: {
    type: 'object',
    properties: {
      retentionDays: {
        type: 'integer',
        minimum: 1,
        maximum: 365,
        default: 90
      },
      dryRun: {
        type: 'boolean',
        default: true
      }
    },
    additionalProperties: false
  }
}), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { retentionDays = 90, dryRun = true } = req.body;
    const adminUserId = req.user!.id;

    if (dryRun) {
      // Simulate cleanup without actually deleting
      const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
      
      // Count what would be deleted
      const expiredKeysCount = await apiKeyService.db.query(`
        SELECT COUNT(*) as count
        FROM api_keys 
        WHERE expires_at IS NOT NULL 
          AND expires_at < NOW() - INTERVAL '${retentionDays} days'
          AND is_active = FALSE
      `);

      const oldLogsCount = await apiKeyService.db.query(`
        SELECT COUNT(*) as count
        FROM api_key_logs 
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `);

      logger.info('Admin cleanup dry run performed', {
        adminUserId,
        retentionDays,
        expiredKeysCount: expiredKeysCount.rows[0]?.count || 0,
        oldLogsCount: oldLogsCount.rows[0]?.count || 0
      });

      res.json({
        message: 'Dry run completed - no data was deleted',
        operation: {
          dry_run: true,
          retention_days: retentionDays
        },
        results: {
          expired_keys_found: parseInt(expiredKeysCount.rows[0]?.count || '0'),
          old_logs_found: parseInt(oldLogsCount.rows[0]?.count || '0'),
          total_items_to_delete: parseInt(expiredKeysCount.rows[0]?.count || '0') + parseInt(oldLogsCount.rows[0]?.count || '0')
        },
        performed_by: adminUserId,
        performed_at: new Date().toISOString()
      });
    } else {
      // Perform actual cleanup
      const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
      const result = await apiKeyService.cleanup(retentionDays);

      logger.info('Admin cleanup performed', {
        adminUserId,
        retentionDays,
        deletedKeys: result.deletedKeys,
        deletedLogs: result.deletedLogs
      });

      res.json({
        message: 'Cleanup completed successfully',
        operation: {
          dry_run: false,
          retention_days: retentionDays
        },
        results: {
          expired_keys_deleted: result.deletedKeys,
          old_logs_deleted: result.deletedLogs,
          total_items_deleted: result.deletedKeys + result.deletedLogs
        },
        performed_by: adminUserId,
        performed_at: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Admin cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      adminUserId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to perform cleanup',
      code: 'ADMIN_CLEANUP_ERROR'
    });
  }
});

/**
 * GET /admin/system-status
 * 
 * Get system status and health information
 * 
 * @route GET /admin/system-status
 * @returns {object} System status
 * @access Admin
 */
router.get('/system-status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminUserId = req.user!.id;
    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);

    // Get various system counts and health metrics
    const [activeKeysResult, expiredKeysResult, totalLogsResult] = await Promise.all([
      apiKeyService.db.query('SELECT COUNT(*) as count FROM api_keys WHERE is_active = TRUE'),
      apiKeyService.db.query('SELECT COUNT(*) as count FROM api_keys WHERE expires_at IS NOT NULL AND expires_at < NOW()'),
      apiKeyService.db.query('SELECT COUNT(*) as count FROM api_key_logs')
    ]);

    const systemStatus = {
      api_keys: {
        active: parseInt(activeKeysResult.rows[0]?.count || '0'),
        expired: parseInt(expiredKeysResult.rows[0]?.count || '0'),
        total_logs: parseInt(totalLogsResult.rows[0]?.count || '0')
      },
      system: {
        node_version: process.version,
        uptime_seconds: Math.floor(process.uptime()),
        memory_usage: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'unknown'
      },
      database: {
        connected: true // If we get here, DB is connected
      }
    };

    logger.info('Admin system status checked', {
      adminUserId,
      activeKeys: systemStatus.api_keys.active,
      expiredKeys: systemStatus.api_keys.expired
    });

    res.json({
      message: 'System status retrieved',
      status: systemStatus,
      checked_by: adminUserId,
      checked_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get system status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      adminUserId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve system status',
      code: 'ADMIN_STATUS_ERROR'
    });
  }
});

export const adminRouter = router;