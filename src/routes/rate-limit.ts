/**
 * @fileoverview Rate limit status information routes
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Current rate limit status for users
 * Main APIs: GET /rate-limit/status
 * Constraints: Optional JWT auth, depends on rate-limit middleware
 * Patterns: Uses middleware function for consistent rate limit info format
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