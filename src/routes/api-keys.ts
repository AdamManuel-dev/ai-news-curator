/**
 * @fileoverview API key management routes.
 * 
 * Provides endpoints for creating, managing, and monitoring API keys
 * for service-to-service authentication.
 * 
 * @module routes/api-keys
 */

import { Router, Request, Response } from 'express';
import { container } from '@container/setup';
import { TOKENS } from '@container/tokens';
import { ApiKeyService, CreateApiKeyParams } from '@services/auth/api-key';
import { authenticateJWT } from '@middleware/auth';
import { AuthenticatedRequest } from '@middleware/index';
import { validate } from '@middleware/validation';
import logger from '@utils/logger';

const router = Router();

/**
 * All API key routes require authentication
 */
router.use(authenticateJWT);

/**
 * GET /api-keys
 * 
 * List user's API keys
 * 
 * @route GET /api-keys
 * @returns {object} List of user's API keys (without raw keys)
 * @access Private
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    
    const apiKeys = await apiKeyService.getUserApiKeys(userId);

    // Remove sensitive data before sending
    const sanitizedKeys = apiKeys.map(key => ({
      id: key.id,
      name: key.name,
      permissions: key.permissions,
      rate_limit: key.rate_limit,
      is_active: key.is_active,
      last_used_at: key.last_used_at,
      expires_at: key.expires_at,
      created_at: key.created_at,
      // Show partial key for identification
      key_preview: `${key.key_hash.substring(0, 8)}...`
    }));

    logger.info('API keys listed', {
      userId,
      count: sanitizedKeys.length
    });

    res.json({
      keys: sanitizedKeys,
      total: sanitizedKeys.length
    });
  } catch (error) {
    logger.error('Failed to list API keys', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve API keys',
      code: 'API_KEYS_LIST_ERROR'
    });
  }
});

/**
 * POST /api-keys
 * 
 * Create a new API key
 * 
 * @route POST /api-keys
 * @body {object} API key creation parameters
 * @returns {object} Created API key with raw key (only shown once)
 * @access Private
 */
router.post('/', validate({
  body: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: '^[a-zA-Z0-9\\s\\-_]+$'
      },
      description: {
        type: 'string',
        maxLength: 500
      },
      permissions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['read', 'write', 'admin', 'content:read', 'content:write', 'users:read', 'metrics:read']
        },
        uniqueItems: true,
        maxItems: 10
      },
      rateLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 10000
      },
      expiresInDays: {
        type: 'integer',
        minimum: 1,
        maximum: 365
      }
    },
    required: ['name'],
    additionalProperties: false
  }
}), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, description, permissions = ['read'], rateLimit = 1000, expiresInDays } = req.body;

    // Calculate expiration date if specified
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const createParams: CreateApiKeyParams = {
      name,
      userId,
      permissions,
      rateLimit,
      expiresAt,
      description
    };

    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    const { apiKey, rawKey } = await apiKeyService.createApiKey(createParams);

    logger.info('API key created', {
      keyId: apiKey.id,
      userId,
      name,
      permissions: permissions.length,
      expiresAt: expiresAt?.toISOString()
    });

    res.status(201).json({
      message: 'API key created successfully',
      key: {
        id: apiKey.id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        rate_limit: apiKey.rate_limit,
        expires_at: apiKey.expires_at,
        created_at: apiKey.created_at,
        // Raw key only shown once
        raw_key: rawKey
      },
      security_notice: 'Store this key securely. It will not be shown again.'
    });
  } catch (error) {
    logger.error('Failed to create API key', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      name: req.body?.name
    });

    res.status(500).json({
      error: 'Failed to create API key',
      code: 'API_KEY_CREATE_ERROR'
    });
  }
});

/**
 * GET /api-keys/:keyId/usage
 * 
 * Get usage statistics for an API key
 * 
 * @route GET /api-keys/:keyId/usage
 * @param {string} keyId - API key ID
 * @query {number} days - Number of days to analyze (default: 30)
 * @returns {object} Usage statistics
 * @access Private
 */
router.get('/:keyId/usage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { keyId } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const userId = req.user!.id;

    // Verify key belongs to user
    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    const userKeys = await apiKeyService.getUserApiKeys(userId);
    const keyExists = userKeys.some(key => key.id === keyId);

    if (!keyExists) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'API_KEY_NOT_FOUND'
      });
    }

    const usage = await apiKeyService.getApiKeyUsage(keyId, days);

    logger.info('API key usage retrieved', {
      keyId,
      userId,
      days,
      totalRequests: usage.totalRequests
    });

    res.json({
      usage,
      period: {
        days,
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get API key usage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      keyId: req.params.keyId,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve API key usage',
      code: 'API_KEY_USAGE_ERROR'
    });
  }
});

/**
 * PATCH /api-keys/:keyId
 * 
 * Update an API key
 * 
 * @route PATCH /api-keys/:keyId
 * @param {string} keyId - API key ID
 * @body {object} API key updates
 * @returns {object} Updated API key
 * @access Private
 */
router.patch('/:keyId', validate({
  body: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: '^[a-zA-Z0-9\\s\\-_]+$'
      },
      permissions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['read', 'write', 'admin', 'content:read', 'content:write', 'users:read', 'metrics:read']
        },
        uniqueItems: true,
        maxItems: 10
      },
      rateLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 10000
      },
      isActive: {
        type: 'boolean'
      }
    },
    additionalProperties: false,
    minProperties: 1
  }
}), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = req.user!.id;
    const updates = req.body;

    // Verify key belongs to user
    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    const userKeys = await apiKeyService.getUserApiKeys(userId);
    const keyExists = userKeys.some(key => key.id === keyId);

    if (!keyExists) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'API_KEY_NOT_FOUND'
      });
    }

    // Map request body to service format
    const serviceUpdates: any = {};
    if (updates.name !== undefined) serviceUpdates.name = updates.name;
    if (updates.permissions !== undefined) serviceUpdates.permissions = updates.permissions;
    if (updates.rateLimit !== undefined) serviceUpdates.rate_limit = updates.rateLimit;
    if (updates.isActive !== undefined) serviceUpdates.is_active = updates.isActive;

    const updatedKey = await apiKeyService.updateApiKey(keyId, serviceUpdates);

    logger.info('API key updated', {
      keyId,
      userId,
      updates: Object.keys(updates)
    });

    res.json({
      message: 'API key updated successfully',
      key: {
        id: updatedKey.id,
        name: updatedKey.name,
        permissions: updatedKey.permissions,
        rate_limit: updatedKey.rate_limit,
        is_active: updatedKey.is_active,
        last_used_at: updatedKey.last_used_at,
        expires_at: updatedKey.expires_at,
        created_at: updatedKey.created_at
      }
    });
  } catch (error) {
    logger.error('Failed to update API key', {
      error: error instanceof Error ? error.message : 'Unknown error',
      keyId: req.params.keyId,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to update API key',
      code: 'API_KEY_UPDATE_ERROR'
    });
  }
});

/**
 * DELETE /api-keys/:keyId
 * 
 * Revoke an API key
 * 
 * @route DELETE /api-keys/:keyId
 * @param {string} keyId - API key ID
 * @returns {object} Revocation confirmation
 * @access Private
 */
router.delete('/:keyId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = req.user!.id;

    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    await apiKeyService.revokeApiKey(keyId, userId);

    logger.info('API key revoked', {
      keyId,
      userId
    });

    res.json({
      message: 'API key revoked successfully',
      keyId,
      revoked_at: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'API_KEY_NOT_FOUND'
      });
    }

    logger.error('Failed to revoke API key', {
      error: error instanceof Error ? error.message : 'Unknown error',
      keyId: req.params.keyId,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to revoke API key',
      code: 'API_KEY_REVOKE_ERROR'
    });
  }
});

/**
 * POST /api-keys/:keyId/test
 * 
 * Test an API key
 * 
 * @route POST /api-keys/:keyId/test
 * @param {string} keyId - API key ID
 * @returns {object} Test result
 * @access Private
 */
router.post('/:keyId/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = req.user!.id;

    // Verify key belongs to user
    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    const userKeys = await apiKeyService.getUserApiKeys(userId);
    const key = userKeys.find(k => k.id === keyId);

    if (!key) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'API_KEY_NOT_FOUND'
      });
    }

    // Check rate limit
    const rateLimit = await apiKeyService.checkRateLimit(keyId);

    logger.info('API key tested', {
      keyId,
      userId,
      isActive: key.is_active,
      rateLimitAllowed: rateLimit.allowed
    });

    res.json({
      message: 'API key test completed',
      result: {
        keyId,
        name: key.name,
        is_active: key.is_active,
        is_expired: key.expires_at ? new Date() > key.expires_at : false,
        rate_limit: {
          allowed: rateLimit.allowed,
          remaining: rateLimit.remaining,
          reset_time: rateLimit.resetTime
        },
        last_used_at: key.last_used_at,
        permissions: key.permissions
      },
      tested_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to test API key', {
      error: error instanceof Error ? error.message : 'Unknown error',
      keyId: req.params.keyId,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to test API key',
      code: 'API_KEY_TEST_ERROR'
    });
  }
});

/**
 * POST /api-keys/:keyId/rotate
 * 
 * Rotate an API key (create new key, deactivate old)
 * 
 * @route POST /api-keys/:keyId/rotate
 * @param {string} keyId - API key ID
 * @body {object} Rotation parameters
 * @returns {object} New API key with raw key (only shown once)
 * @access Private
 */
router.post('/:keyId/rotate', validate({
  body: {
    type: 'object',
    properties: {
      extendDays: {
        type: 'integer',
        minimum: 1,
        maximum: 365,
        default: 90
      }
    },
    additionalProperties: false
  }
}), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { keyId } = req.params;
    const userId = req.user!.id;
    const { extendDays = 90 } = req.body;

    const apiKeyService = container.get<ApiKeyService>(TOKENS.API_KEY_SERVICE);
    const { oldKey, newKey, rawKey } = await apiKeyService.rotateApiKey(keyId, userId, extendDays);

    logger.info('API key rotated', {
      oldKeyId: keyId,
      newKeyId: newKey.id,
      userId,
      extendDays
    });

    res.json({
      message: 'API key rotated successfully',
      rotation: {
        old_key: {
          id: oldKey.id,
          name: oldKey.name,
          revoked_at: new Date().toISOString()
        },
        new_key: {
          id: newKey.id,
          name: newKey.name,
          permissions: newKey.permissions,
          rate_limit: newKey.rate_limit,
          expires_at: newKey.expires_at,
          created_at: newKey.created_at,
          // Raw key only shown once
          raw_key: rawKey
        }
      },
      security_notice: 'Store the new key securely. It will not be shown again. Update your applications to use the new key.'
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'API key not found',
        code: 'API_KEY_NOT_FOUND'
      });
    }

    logger.error('Failed to rotate API key', {
      error: error instanceof Error ? error.message : 'Unknown error',
      keyId: req.params.keyId,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to rotate API key',
      code: 'API_KEY_ROTATE_ERROR'
    });
  }
});

export const apiKeysRouter = router;