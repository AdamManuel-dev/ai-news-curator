/**
 * @fileoverview OAuth 2.0 authentication service implementation.
 * 
 * Provides OAuth 2.0 authorization code flow with support for multiple providers.
 * Handles token management, user creation/authentication, and session management.
 * 
 * @module services/auth/oauth
 */

import { Request } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '@config/index';
import logger from '@utils/logger';
import { DatabaseConnection } from '@database/connection';
import { User, OAuthProvider, OAuthTokens, AuthResult } from './types';

/**
 * OAuth 2.0 service for handling authentication flows
 */
export class OAuthService {
  private db: DatabaseConnection;
  private providers: Map<string, OAuthProvider>;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.providers = new Map();
    this.initializeProviders();
  }

  /**
   * Initialize OAuth providers configuration
   */
  private initializeProviders(): void {
    // Google OAuth provider
    if (config.oauth.google.clientId && config.oauth.google.clientSecret) {
      this.providers.set('google', {
        name: 'google',
        clientId: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        scopes: ['openid', 'email', 'profile'],
        redirectUri: `${config.serverUrl}/auth/callback/google`
      });
    }

    // GitHub OAuth provider
    if (config.oauth.github.clientId && config.oauth.github.clientSecret) {
      this.providers.set('github', {
        name: 'github',
        clientId: config.oauth.github.clientId,
        clientSecret: config.oauth.github.clientSecret,
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        scopes: ['user:email'],
        redirectUri: `${config.serverUrl}/auth/callback/github`
      });
    }

    logger.info('OAuth providers initialized', {
      providers: Array.from(this.providers.keys()),
      count: this.providers.size
    });
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  async generateAuthUrl(provider: string, state?: string): Promise<string> {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`OAuth provider '${provider}' not configured`);
    }

    const stateParam = state || this.generateState();
    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: providerConfig.redirectUri,
      scope: providerConfig.scopes.join(' '),
      response_type: 'code',
      state: stateParam,
      access_type: 'offline', // For refresh tokens
      prompt: 'consent'
    });

    const authUrl = `${providerConfig.authUrl}?${params.toString()}`;
    
    logger.info('OAuth authorization URL generated', {
      provider,
      state: stateParam,
      redirectUri: providerConfig.redirectUri
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(provider: string, code: string, state: string): Promise<OAuthTokens> {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`OAuth provider '${provider}' not configured`);
    }

    const tokenData = {
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: providerConfig.redirectUri
    };

    try {
      const response = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams(tokenData).toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('OAuth token exchange failed', {
          provider,
          status: response.status,
          error: errorText
        });
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      const tokens: OAuthTokens = await response.json();
      
      logger.info('OAuth tokens exchanged successfully', {
        provider,
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in
      });

      return tokens;
    } catch (error) {
      logger.error('OAuth token exchange error', {
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Fetch user information from OAuth provider
   */
  async fetchUserInfo(provider: string, accessToken: string): Promise<any> {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new Error(`OAuth provider '${provider}' not configured`);
    }

    try {
      const response = await fetch(providerConfig.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const userInfo = await response.json();
      
      logger.info('OAuth user info fetched', {
        provider,
        userId: userInfo.id || userInfo.login,
        email: userInfo.email
      });

      return userInfo;
    } catch (error) {
      logger.error('Failed to fetch OAuth user info', {
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Authenticate user with OAuth flow
   */
  async authenticateUser(provider: string, code: string, state: string): Promise<AuthResult> {
    try {
      // Exchange code for tokens
      const tokens = await this.exchangeCodeForToken(provider, code, state);
      
      // Fetch user information
      const userInfo = await this.fetchUserInfo(provider, tokens.access_token);
      
      // Normalize user data based on provider
      const normalizedUser = this.normalizeUserData(provider, userInfo);
      
      // Find or create user in database
      let user = await this.findUserByEmail(normalizedUser.email);
      
      if (!user) {
        user = await this.createUser(normalizedUser);
        logger.info('New user created via OAuth', {
          provider,
          userId: user.id,
          email: user.email
        });
      } else {
        // Update last active timestamp
        await this.updateUserLastActive(user.id);
        logger.info('Existing user authenticated via OAuth', {
          provider,
          userId: user.id,
          email: user.email
        });
      }

      // Generate JWT tokens
      const jwtTokens = await this.generateJWTTokens(user);
      
      // Store OAuth tokens (optional, for API access)
      await this.storeOAuthTokens(user.id, provider, tokens);

      return {
        user,
        tokens: jwtTokens,
        isNewUser: !user
      };
    } catch (error) {
      logger.error('OAuth authentication failed', {
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Generate JWT access and refresh tokens
   */
  private async generateJWTTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      expertise_level: user.expertise_level
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessTokenExpiry,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience
    });

    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      config.jwt.refreshSecret,
      {
        expiresIn: config.jwt.refreshTokenExpiry,
        issuer: config.jwt.issuer,
        audience: config.jwt.audience
      }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Refresh JWT access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token type');
      }

      const user = await this.findUserById(decoded.sub);
      if (!user || !user.is_active) {
        throw new Error('User not found or inactive');
      }

      const payload = {
        sub: user.id,
        email: user.email,
        username: user.username,
        expertise_level: user.expertise_level
      };

      const accessToken = jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.accessTokenExpiry,
        issuer: config.jwt.issuer,
        audience: config.jwt.audience
      });

      logger.info('Access token refreshed', { userId: user.id });

      return { accessToken };
    } catch (error) {
      logger.error('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Verify JWT access token
   */
  async verifyAccessToken(token: string): Promise<User> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      
      const user = await this.findUserById(decoded.sub);
      if (!user || !user.is_active) {
        throw new Error('User not found or inactive');
      }

      return user;
    } catch (error) {
      logger.error('Token verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Invalid access token');
    }
  }

  /**
   * Database operations
   */
  private async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
      [email]
    );
    return (result.rows[0] as User) || null;
  }

  private async findUserById(id: string): Promise<User | null> {
    const result = await this.db.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    return (result.rows[0] as User) || null;
  }

  private async createUser(userData: Partial<User>): Promise<User> {
    const result = await this.db.query(`
      INSERT INTO users (email, username, expertise_level, preferences, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `, [
      userData.email,
      userData.username || userData.email?.split('@')[0],
      userData.expertise_level || 'beginner',
      JSON.stringify(userData.preferences || {})
    ]);
    return result.rows[0] as User;
  }

  private async updateUserLastActive(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET last_active_at = NOW(), updated_at = NOW() WHERE id = $1',
      [userId]
    );
  }

  private async storeOAuthTokens(userId: string, provider: string, _tokens: OAuthTokens): Promise<void> {
    // Store OAuth tokens for potential API access (optional)
    // This is implementation-specific based on requirements
    logger.debug('OAuth tokens stored', { userId, provider });
  }

  /**
   * Normalize user data from different providers
   */
  private normalizeUserData(provider: string, userInfo: any): Partial<User> {
    switch (provider) {
      case 'google':
        return {
          email: userInfo.email,
          username: userInfo.name || userInfo.email?.split('@')[0],
          preferences: {
            profile_picture: userInfo.picture,
            locale: userInfo.locale
          }
        };
      
      case 'github':
        return {
          email: userInfo.email,
          username: userInfo.login,
          preferences: {
            profile_picture: userInfo.avatar_url,
            github_profile: userInfo.html_url
          }
        };
      
      default:
        return {
          email: userInfo.email,
          username: userInfo.username || userInfo.login || userInfo.email?.split('@')[0]
        };
    }
  }

  /**
   * Generate cryptographically secure state parameter
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get list of available OAuth providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}