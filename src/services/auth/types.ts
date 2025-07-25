/**
 * @fileoverview TypeScript type definitions for authentication services.
 * 
 * Contains interfaces and types used across the authentication system
 * including OAuth providers, user models, and authentication results.
 * 
 * @module services/auth/types
 */

/**
 * User entity from database
 */
export interface User {
  id: string;
  email: string;
  username?: string;
  expertise_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  interests: string[];
  preferred_formats: string[];
  timezone: string;
  is_active: boolean;
  preferences: Record<string, any>;
  last_active_at?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * OAuth provider configuration
 */
export interface OAuthProvider {
  name: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  redirectUri: string;
}

/**
 * OAuth tokens response from provider
 */
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * JWT token pair
 */
export interface JWTTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  user: User;
  tokens: JWTTokens;
  isNewUser: boolean;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  sub: string; // User ID
  email: string;
  username?: string;
  expertise_level: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * Authentication context for requests
 */
export interface AuthContext {
  user: User;
  token: string;
  isAuthenticated: boolean;
}

/**
 * API key entity
 */
export interface ApiKey {
  id: string;
  key_hash: string;
  name: string;
  user_id: string;
  permissions: string[];
  rate_limit: number;
  is_active: boolean;
  last_used_at?: Date;
  expires_at?: Date;
  created_at: Date;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

/**
 * Session data stored in Redis
 */
export interface SessionData {
  userId: string;
  email: string;
  createdAt: Date;
  lastAccess: Date;
  ipAddress: string;
  userAgent: string;
}