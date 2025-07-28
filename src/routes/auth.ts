/**
 * @fileoverview OAuth 2.0 authentication routes and session management
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: OAuth flows, token refresh, user profile, logout, auth status
 * Main APIs: GET /auth/:provider, GET /callback/:provider, POST /token/refresh, GET /me
 * Constraints: Requires OAuth providers config, secure cookies in production
 * Patterns: State CSRF protection, HTTP-only cookies, redirect handling, structured errors
 */

import { Router, Request, Response } from 'express';
import { container } from '@container/setup';
import { TOKENS } from '@container/tokens';
import { OAuthService } from '@services/auth/oauth';
import { authenticateJWT, optionalAuthenticateJWT } from '@middleware/auth';
import { AuthenticatedRequest } from '@middleware/index';
import { validate } from '@middleware/validation';
import logger from '@utils/logger';
import { config } from '@config/index';

const router = Router();

/**
 * GET /auth/providers
 * 
 * Returns list of available OAuth providers
 * 
 * @route GET /auth/providers
 * @returns {object} List of available OAuth providers
 * @access Public
 */
router.get('/providers', (_req: Request, res: Response) => {
  try {
    const oauthService = container.get<OAuthService>(TOKENS.OAuthService);
    const providers = oauthService.getAvailableProviders();

    res.json({
      providers: providers.map(provider => ({
        name: provider,
        displayName: provider.charAt(0).toUpperCase() + provider.slice(1),
        authUrl: `/auth/${provider}`
      }))
    });
  } catch (error) {
    logger.error('Failed to get OAuth providers', { error });
    res.status(500).json({
      error: 'Failed to retrieve authentication providers',
      code: 'PROVIDERS_ERROR'
    });
  }
});

/**
 * GET /auth/:provider
 * 
 * Initiates OAuth flow by redirecting to provider's authorization server
 * 
 * @route GET /auth/:provider
 * @param {string} provider - OAuth provider name (google, github, etc.)
 * @query {string} redirect_uri - Optional redirect URI after authentication
 * @returns {redirect} Redirects to OAuth provider
 * @access Public
 */
router.get('/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { redirect_uri } = req.query;

    const oauthService = container.get<OAuthService>(TOKENS.OAuthService);
    
    // Generate state parameter with optional redirect URI
    const state = JSON.stringify({
      redirect_uri: redirect_uri || config.defaultRedirectUri,
      timestamp: Date.now()
    });

    const authUrl = await oauthService.generateAuthUrl(provider, state);

    logger.info('OAuth flow initiated', {
      provider,
      clientRedirectUri: redirect_uri,
      ip: req.ip
    });

    res.redirect(authUrl);
  } catch (error) {
    logger.error('OAuth initiation failed', {
      provider: req.params.provider,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(400).json({
      error: 'Invalid OAuth provider or configuration error',
      code: 'OAUTH_INIT_ERROR',
      provider: req.params.provider
    });
  }
});

/**
 * GET /auth/callback/:provider
 * 
 * OAuth callback endpoint to handle authorization code
 * 
 * @route GET /auth/callback/:provider
 * @param {string} provider - OAuth provider name
 * @query {string} code - Authorization code from provider
 * @query {string} state - State parameter for CSRF protection
 * @query {string} error - Error from OAuth provider (if any)
 * @returns {object} Authentication result with tokens
 * @access Public
 */
router.get('/callback/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    // Handle OAuth errors
    if (error) {
      logger.warn('OAuth provider returned error', {
        provider,
        error,
        description: req.query.error_description
      });

      return res.status(400).json({
        error: 'OAuth authentication failed',
        code: 'OAUTH_PROVIDER_ERROR',
        details: error
      });
    }

    // Validate required parameters
    if (!code || !state) {
      return res.status(400).json({
        error: 'Missing required OAuth parameters',
        code: 'MISSING_OAUTH_PARAMS'
      });
    }

    const oauthService = container.get<OAuthService>(TOKENS.OAuthService);
    
    // Parse state parameter
    let stateData;
    try {
      stateData = JSON.parse(state as string);
    } catch {
      return res.status(400).json({
        error: 'Invalid state parameter',
        code: 'INVALID_STATE'
      });
    }

    // Authenticate user with OAuth
    const authResult = await oauthService.authenticateUser(
      provider,
      code as string,
      state as string
    );

    logger.info('OAuth authentication successful', {
      provider,
      userId: authResult.user.id,
      isNewUser: authResult.isNewUser,
      ip: req.ip
    });

    // Set secure HTTP-only cookies for tokens
    const cookieOptions = {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax' as const,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };

    res.cookie('access_token', authResult.tokens.accessToken, cookieOptions);
    res.cookie('refresh_token', authResult.tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect to client application
    const redirectUri = stateData.redirect_uri || config.defaultRedirectUri;
    const redirectUrl = new URL(redirectUri);
    
    // Add authentication status to redirect
    redirectUrl.searchParams.set('auth', 'success');
    redirectUrl.searchParams.set('new_user', authResult.isNewUser.toString());

    res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('OAuth callback error', {
      provider: req.params.provider,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'OAuth authentication failed',
      code: 'OAUTH_CALLBACK_ERROR'
    });
  }
});

/**
 * POST /auth/token/refresh
 * 
 * Refresh access token using refresh token
 * 
 * @route POST /auth/token/refresh
 * @body {string} refresh_token - Refresh token
 * @returns {object} New access token
 * @access Public
 */
router.post('/token/refresh', validate({
  body: {
    type: 'object',
    properties: {
      refresh_token: { type: 'string', minLength: 1 }
    },
    required: ['refresh_token']
  }
}), async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    const oauthService = container.get<OAuthService>(TOKENS.OAuthService);
    const result = await oauthService.refreshAccessToken(refresh_token);

    logger.info('Access token refreshed', {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      access_token: result.accessToken,
      token_type: 'Bearer',
      expires_in: 3600 // 1 hour
    });
  } catch (error) {
    logger.warn('Token refresh failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    res.status(401).json({
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
});

/**
 * GET /auth/me
 * 
 * Get current authenticated user information
 * 
 * @route GET /auth/me
 * @returns {object} User profile information
 * @access Private
 */
router.get('/me', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // User information is already validated by authenticateJWT middleware
    const user = req.user;

    res.json({
      id: user?.id,
      email: user?.email,
      authenticated: true
    });
  } catch (error) {
    logger.error('Failed to get user profile', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve user profile',
      code: 'PROFILE_ERROR'
    });
  }
});

/**
 * POST /auth/logout
 * 
 * Logout user and invalidate session
 * 
 * @route POST /auth/logout
 * @returns {object} Logout confirmation
 * @access Private (optional)
 */
router.post('/logout', optionalAuthenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  try {
    // Clear authentication cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    logger.info('User logged out', {
      userId: req.user?.id,
      ip: req.ip
    });

    res.json({
      message: 'Logged out successfully',
      authenticated: false
    });
  } catch (error) {
    logger.error('Logout error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * GET /auth/status
 * 
 * Check authentication status without requiring valid token
 * 
 * @route GET /auth/status
 * @returns {object} Authentication status
 * @access Public
 */
router.get('/status', optionalAuthenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    authenticated: !!req.user,
    user: req.user ? {
      id: req.user.id,
      email: req.user.email
    } : null
  });
});

export const authRouter = router;