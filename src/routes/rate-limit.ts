/**
 * @fileoverview Rate limit information routes.
 * 
 * Provides endpoints for checking rate limit status and configuration.
 * 
 * @module routes/rate-limit
 */

import { Router } from 'express';
import { getRateLimitInfo } from '@middleware/rate-limit';
import { optionalAuthenticateJWT } from '@middleware/auth';

const router = Router();

/**
 * GET /rate-limit/status
 * 
 * Get current rate limit status for the user
 * 
 * @route GET /rate-limit/status
 * @returns {object} Current rate limit information
 * @access Public
 */
router.get('/status', optionalAuthenticateJWT, getRateLimitInfo);

export const rateLimitRouter = router;