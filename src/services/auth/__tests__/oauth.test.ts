/**
 * @fileoverview Unit tests for OAuth service
 */

import { OAuthService } from '../oauth';
import { DatabaseConnection } from '@database/connection';
import { config } from '@config/index';
import { User, OAuthTokens } from '../types';

// Mock dependencies
jest.mock('@config/index');
jest.mock('@utils/logger');
jest.mock('@database/connection');

// Mock fetch globally
global.fetch = jest.fn();

const mockConfig = {
  serverUrl: 'http://localhost:3000',
  oauth: {
    google: {
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret'
    },
    github: {
      clientId: 'github-client-id',
      clientSecret: 'github-client-secret'
    }
  },
  jwt: {
    secret: 'test-secret',
    refreshSecret: 'test-refresh-secret',
    accessTokenExpiry: '1h',
    refreshTokenExpiry: '7d',
    issuer: 'test-issuer',
    audience: 'test-audience'
  }
};

// Mock config
(config as any) = mockConfig;

describe('OAuthService', () => {
  let service: OAuthService;
  let mockDb: jest.Mocked<DatabaseConnection>;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as any;

    service = new OAuthService(mockDb);
    jest.clearAllMocks();
  });

  describe('generateAuthUrl', () => {
    it('should generate Google OAuth URL', async () => {
      const url = await service.generateAuthUrl('google', 'test-state');
      
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=google-client-id');
      expect(url).toContain('state=test-state');
      expect(url).toContain('scope=openid%20email%20profile');
    });

    it('should generate GitHub OAuth URL', async () => {
      const url = await service.generateAuthUrl('github', 'test-state');
      
      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=github-client-id');
      expect(url).toContain('state=test-state');
      expect(url).toContain('scope=user%3Aemail');
    });

    it('should throw error for unknown provider', async () => {
      await expect(service.generateAuthUrl('unknown', 'test-state'))
        .rejects.toThrow("OAuth provider 'unknown' not configured");
    });

    it('should generate state if not provided', async () => {
      const url = await service.generateAuthUrl('google');
      expect(url).toMatch(/state=[\w]+/);
    });
  });

  describe('exchangeCodeForToken', () => {
    const mockTokenResponse: OAuthTokens = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer'
    };

    it('should exchange code for tokens successfully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      });

      const tokens = await service.exchangeCodeForToken('google', 'auth-code', 'test-state');
      
      expect(tokens).toEqual(mockTokenResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );
    });

    it('should handle token exchange failure', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request')
      });

      await expect(service.exchangeCodeForToken('google', 'invalid-code', 'test-state'))
        .rejects.toThrow('Token exchange failed: 400');
    });

    it('should throw error for unknown provider', async () => {
      await expect(service.exchangeCodeForToken('unknown', 'code', 'state'))
        .rejects.toThrow("OAuth provider 'unknown' not configured");
    });
  });

  describe('fetchUserInfo', () => {
    const mockGoogleUser = {
      id: 'google-user-id',
      email: 'user@example.com',
      name: 'Test User',
      picture: 'https://example.com/avatar.jpg'
    };

    it('should fetch Google user info successfully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGoogleUser)
      });

      const userInfo = await service.fetchUserInfo('google', 'access-token');
      
      expect(userInfo).toEqual(mockGoogleUser);
      expect(fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer access-token'
          })
        })
      );
    });

    it('should handle fetch user info failure', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      await expect(service.fetchUserInfo('google', 'invalid-token'))
        .rejects.toThrow('Failed to fetch user info: 401');
    });
  });

  describe('authenticateUser', () => {
    const mockTokens: OAuthTokens = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer'
    };

    const mockGoogleUser = {
      id: 'google-user-id',
      email: 'user@example.com',
      name: 'Test User',
      picture: 'https://example.com/avatar.jpg'
    };

    const mockDbUser: User = {
      id: 'user-uuid',
      email: 'user@example.com',
      username: 'testuser',
      expertise_level: 'beginner',
      interests: [],
      preferred_formats: [],
      timezone: 'UTC',
      is_active: true,
      preferences: {},
      created_at: new Date(),
      updated_at: new Date()
    };

    beforeEach(() => {
      // Mock token exchange
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockTokens)
      }));

      // Mock user info fetch
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockGoogleUser)
      }));
    });

    it('should authenticate existing user successfully', async () => {
      // Mock existing user lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [mockDbUser]
      } as any);

      // Mock update last active
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.authenticateUser('google', 'auth-code', 'test-state');

      expect(result.user).toEqual(mockDbUser);
      expect(result.isNewUser).toBe(false);
      expect(result.tokens).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String)
      });
    });

    it('should create new user if not exists', async () => {
      // Mock no existing user
      mockDb.query.mockResolvedValueOnce({ rows: [] } as any);
      
      // Mock user creation
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...mockDbUser, id: 'new-user-uuid' }]
      } as any);

      const result = await service.authenticateUser('google', 'auth-code', 'test-state');

      expect(result.user.id).toBe('new-user-uuid');
      expect(result.isNewUser).toBe(true);
      expect(result.tokens).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String)
      });
    });
  });

  describe('refreshAccessToken', () => {
    const mockUser: User = {
      id: 'user-uuid',
      email: 'user@example.com',
      username: 'testuser',
      expertise_level: 'beginner',
      interests: [],
      preferred_formats: [],
      timezone: 'UTC',
      is_active: true,
      preferences: {},
      created_at: new Date(),
      updated_at: new Date()
    };

    it('should refresh access token successfully', async () => {
      // Create a valid refresh token
      const jwt = require('jsonwebtoken');
      const refreshToken = jwt.sign(
        { sub: 'user-uuid', type: 'refresh' },
        mockConfig.jwt.refreshSecret
      );

      // Mock user lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser]
      } as any);

      const result = await service.refreshAccessToken(refreshToken);

      expect(result).toMatchObject({
        accessToken: expect.any(String)
      });
    });

    it('should reject invalid refresh token', async () => {
      await expect(service.refreshAccessToken('invalid-token'))
        .rejects.toThrow('Invalid refresh token');
    });

    it('should reject token for inactive user', async () => {
      const jwt = require('jsonwebtoken');
      const refreshToken = jwt.sign(
        { sub: 'user-uuid', type: 'refresh' },
        mockConfig.jwt.refreshSecret
      );

      // Mock inactive user
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, is_active: false }]
      } as any);

      await expect(service.refreshAccessToken(refreshToken))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  describe('verifyAccessToken', () => {
    const mockUser: User = {
      id: 'user-uuid',
      email: 'user@example.com',
      username: 'testuser',
      expertise_level: 'beginner',
      interests: [],
      preferred_formats: [],
      timezone: 'UTC',
      is_active: true,
      preferences: {},
      created_at: new Date(),
      updated_at: new Date()
    };

    it('should verify valid access token', async () => {
      const jwt = require('jsonwebtoken');
      const accessToken = jwt.sign(
        { 
          sub: 'user-uuid',
          email: 'user@example.com',
          username: 'testuser',
          expertise_level: 'beginner'
        },
        mockConfig.jwt.secret
      );

      // Mock user lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser]
      } as any);

      const result = await service.verifyAccessToken(accessToken);
      expect(result).toEqual(mockUser);
    });

    it('should reject invalid access token', async () => {
      await expect(service.verifyAccessToken('invalid-token'))
        .rejects.toThrow('Invalid access token');
    });

    it('should reject token for inactive user', async () => {
      const jwt = require('jsonwebtoken');
      const accessToken = jwt.sign(
        { sub: 'user-uuid' },
        mockConfig.jwt.secret
      );

      // Mock inactive user
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, is_active: false }]
      } as any);

      await expect(service.verifyAccessToken(accessToken))
        .rejects.toThrow('Invalid access token');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return available providers', () => {
      const providers = service.getAvailableProviders();
      expect(providers).toEqual(['google', 'github']);
    });
  });
});