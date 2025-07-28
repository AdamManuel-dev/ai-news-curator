# Authentication & Authorization Module

## Overview

The Auth module provides comprehensive authentication and authorization services for the AI News Curator system. It implements JWT-based authentication, API key management, and role-based access control (RBAC) with fine-grained permissions.

## Module Structure

```
src/services/auth/
├── api-key.ts          # API key management service
├── oauth.ts            # OAuth integration service  
├── rbac.ts             # Role-based access control
└── types.ts            # Authentication type definitions

src/middleware/
├── auth.ts             # JWT/API key authentication middleware
└── rbac.ts             # RBAC permission middleware
```

## Core Services

### API Key Service (`src/services/auth/api-key.ts`)

Manages API keys for service-to-service authentication with comprehensive lifecycle management.

**Key Features:**
- Cryptographically secure key generation (64-character keys with `aic_` prefix)
- Rate limiting per key (configurable, default 1000/hour)
- Automatic expiration and rotation capabilities
- Usage tracking and analytics
- Batch operations for key management

**Main Methods:**
- `createApiKey(params)` - Generate new API key with permissions and limits
- `validateApiKey(rawKey)` - Validate and authenticate API key requests
- `rotateApiKey(keyId, extendDays)` - Generate new key while deactivating old one
- `getUserApiKeys(userId)` - List all keys for a user
- `getApiKeyUsage(keyId, days)` - Retrieve usage statistics and metrics
- `checkRateLimit(keyId, windowMinutes)` - Validate current rate limit status

**Usage Example:**
```typescript
const { apiKey, rawKey } = await apiKeyService.createApiKey({
  name: 'Content Service',
  userId: 'user-123',
  permissions: ['content:read', 'content:create'],
  rateLimit: 5000,
  expiresAt: new Date('2025-12-31')
});

// Store rawKey securely - it's only shown once
console.log('API Key:', rawKey); // aic_1234567890abcdef...
```

### OAuth Service (`src/services/auth/oauth.ts`)

Handles OAuth 2.0 authentication flows and JWT token management.

**Key Features:**
- JWT token generation with configurable expiration
- Refresh token support for long-lived sessions  
- Token blacklisting for secure logout
- Configurable token validation and claims
- Integration with external OAuth providers

**Main Methods:**
- `authenticateUser(credentials)` - Validate user credentials and issue tokens
- `refreshAccessToken(refreshToken)` - Generate new access token from refresh token
- `validateToken(token)` - Verify JWT token signature and claims
- `revokeToken(token)` - Blacklist token to prevent further use
- `getUserFromToken(token)` - Extract user information from valid token

**Usage Example:**
```typescript
const authResult = await oauthService.authenticateUser({
  email: 'user@example.com',
  password: 'securePassword'
});

// Returns: { token, refreshToken, user, expiresIn }
```

### RBAC Service (`src/services/auth/rbac.ts`)

Implements role-based access control with hierarchical permissions.

**Key Features:**
- Hierarchical role and permission system
- Resource-based permissions (e.g., `content:read`, `users:manage`)
- Permission inheritance through role hierarchy
- Bulk permission checks for efficiency
- Audit logging for permission changes

**Main Methods:**
- `hasPermission(userId, permission)` - Check if user has specific permission
- `hasRole(userId, roleName)` - Verify user role assignment
- `getUserPermissions(userId)` - Get all effective permissions for user
- `assignRole(userId, roleId)` - Assign role to user
- `createRole(name, permissions)` - Create new role with permission set

**Permission Structure:**
```typescript
// Resource-based permissions
const permissions = [
  'content:read',    // Read content
  'content:create',  // Create new content
  'content:update',  // Modify existing content
  'content:delete',  // Remove content
  'content:manage',  // Full content management

  'users:read',      // View user information
  'users:manage',    // Full user management
  
  'system:admin',    // System administration
  'system:metrics',  // View system metrics
  'api_keys:manage'  // Manage API keys
];
```

## Middleware Components

### Authentication Middleware (`src/middleware/auth.ts`)

Handles request authentication using JWT tokens or API keys.

**Key Features:**
- Dual authentication modes (JWT + API Key)
- Automatic user context injection
- Development bypass for testing
- Comprehensive error handling
- Request rate limiting integration

**Middleware Functions:**
- `authenticateJWT()` - Validate JWT token from Authorization header
- `authenticateAPIKey()` - Validate API key from X-API-Key header
- `optionalAuth()` - Allow both authenticated and anonymous requests
- `requireAuth()` - Enforce authentication requirement

**Usage Example:**
```typescript
// Require JWT authentication
app.use('/api/secure', authenticateJWT(), secureRoutes);

// Allow API key authentication  
app.use('/api/service', authenticateAPIKey(), serviceRoutes);

// Optional authentication (user context if present)
app.use('/api/public', optionalAuth(), publicRoutes);
```

### RBAC Middleware (`src/middleware/rbac.ts`)

Enforces permission-based access control on routes.

**Key Features:**
- Fine-grained permission checking
- Multiple permission validation modes
- Resource-based access control
- Automatic permission loading
- Structured error responses

**Middleware Functions:**
- `requirePermission(permission)` - Require specific permission
- `requireRole(roleName)` - Require specific role
- `requireAnyPermission(permissions[])` - Require at least one permission
- `requireAllPermissions(permissions[])` - Require all specified permissions
- `loadUserPermissions()` - Pre-load user permissions into request context

**Usage Example:**
```typescript
// Require specific permission
app.get('/admin/users', 
  requirePermission('users:manage'), 
  getUsersHandler
);

// Require admin or moderator role
app.post('/content/moderate',
  requireAnyPermission(['content:moderate', 'system:admin']),
  moderateContentHandler
);

// Load permissions for conditional logic
app.use('/api/content', 
  loadUserPermissions(), 
  contentRoutes
);
```

## Security Features

### Token Security
- **JWT Signing**: RS256 or HS256 algorithms with configurable secrets
- **Token Expiration**: Configurable expiration times (default: 1 hour access, 7 days refresh)
- **Token Blacklisting**: Revoked tokens stored in Redis for immediate invalidation
- **Refresh Token Rotation**: New refresh token issued on each refresh for security

### API Key Security
- **Secure Generation**: Cryptographically strong random keys using Node.js crypto
- **Hash Storage**: Keys stored as SHA-256 hashes, never plain text
- **Salt Integration**: JWT secret used as salt for additional security
- **Rate Limiting**: Per-key rate limits to prevent abuse
- **Expiration Management**: Automatic expiration with rotation capabilities

### Permission Security
- **Principle of Least Privilege**: Users granted minimal required permissions
- **Permission Inheritance**: Hierarchical permission system prevents privilege escalation
- **Audit Logging**: All permission changes and checks logged for compliance
- **Role Validation**: Role assignments validated before permission grants

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# API Key Configuration  
API_KEY_ROTATION_DAYS=90
API_KEY_DEFAULT_RATE_LIMIT=1000

# RBAC Configuration
RBAC_CACHE_TTL=3600
RBAC_AUDIT_ENABLED=true

# Redis Configuration (for token blacklisting)
REDIS_URL=redis://localhost:6379
```

### Role Configuration

Default roles are configured in the system:

```typescript
const defaultRoles = [
  {
    name: 'admin',
    description: 'Full system access',
    permissions: ['system:admin', '*:*']
  },
  {
    name: 'moderator', 
    description: 'Content moderation',
    permissions: ['content:manage', 'users:read']
  },
  {
    name: 'user',
    description: 'Standard user access',
    permissions: ['content:read', 'content:create']
  },
  {
    name: 'viewer',
    description: 'Read-only access',
    permissions: ['content:read']
  }
];
```

## Usage Patterns

### Standard Authentication Flow

```typescript
// 1. User login
const authResult = await oauthService.authenticateUser({
  email: 'user@example.com',
  password: 'password'
});

// 2. Store tokens securely
localStorage.setItem('accessToken', authResult.token);
localStorage.setItem('refreshToken', authResult.refreshToken);

// 3. Use token in requests
const response = await fetch('/api/content', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});

// 4. Handle token refresh
if (response.status === 401) {
  const newToken = await oauthService.refreshAccessToken(refreshToken);
  // Retry request with new token
}
```

### API Key Authentication

```typescript
// 1. Create API key for service
const { rawKey } = await apiKeyService.createApiKey({
  name: 'Data Ingestion Service',
  userId: 'service-user-id',
  permissions: ['content:create', 'content:update'],
  rateLimit: 10000
});

// 2. Store key securely in service configuration
process.env.API_KEY = rawKey;

// 3. Use in service requests
const response = await fetch('/api/content', {
  headers: {
    'X-API-Key': process.env.API_KEY,
    'Content-Type': 'application/json'
  },
  method: 'POST',
  body: JSON.stringify(contentData)
});
```

### Permission-Based Route Protection

```typescript
// Route with multiple permission options
app.get('/api/admin/stats',
  authenticateJWT(),
  requireAnyPermission(['system:admin', 'system:metrics']),
  async (req, res) => {
    // Only users with admin or metrics permissions can access
    const stats = await getSystemStats();
    res.json(stats);
  }
);

// Route with resource-specific permissions
app.put('/api/content/:id',
  authenticateJWT(),
  loadUserPermissions(),
  async (req, res) => {
    const content = await getContent(req.params.id);
    
    // Check ownership or management permission
    if (content.authorId !== req.user.id && 
        !req.userPermissions.includes('content:manage')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    // Update content
    await updateContent(req.params.id, req.body);
    res.json({ success: true });
  }
);
```

## Error Handling

The auth module provides structured error responses:

```typescript
// Authentication errors
{
  error: 'INVALID_TOKEN',
  message: 'JWT token has expired',
  statusCode: 401
}

// Authorization errors  
{
  error: 'INSUFFICIENT_PERMISSIONS',
  message: 'Permission required: content:manage',
  statusCode: 403,
  requiredPermission: 'content:manage'
}

// API key errors
{
  error: 'API_KEY_EXPIRED', 
  message: 'API key has expired',
  statusCode: 401,
  keyId: 'key-123'
}
```

## Monitoring and Analytics

### API Key Analytics
- Request count per key with time-based aggregation
- Rate limit violations and patterns
- Key usage distribution across endpoints
- Geographic usage patterns (if IP logging enabled)

### Authentication Metrics
- Login success/failure rates
- Token refresh frequency
- Permission denial patterns
- User session duration analytics

### Security Monitoring  
- Failed authentication attempts
- Suspicious permission escalation attempts
- Unusual API key usage patterns
- Token theft detection (multiple IPs/locations)

## Testing

The auth module includes comprehensive test coverage:

```bash
# Run auth-specific tests
npm test src/services/auth/
npm test src/middleware/auth.test.ts
npm test src/middleware/rbac.test.ts

# Test coverage
npm run test:coverage -- --testPathPattern=auth
```

**Test Categories:**
- **Unit Tests**: Individual service method validation
- **Integration Tests**: End-to-end auth flows
- **Security Tests**: Token validation, permission bypass attempts
- **Performance Tests**: Rate limiting, concurrent authentication

## Security Best Practices

1. **Token Management**
   - Always use HTTPS in production
   - Implement proper token storage (HttpOnly cookies for web)
   - Set appropriate token expiration times
   - Implement token rotation strategies

2. **API Key Security**
   - Generate keys with sufficient entropy
   - Implement key rotation policies
   - Monitor for unusual usage patterns
   - Use rate limiting to prevent abuse

3. **Permission Design**
   - Follow principle of least privilege
   - Use resource-based permissions
   - Implement permission auditing
   - Regular permission reviews

4. **Monitoring**
   - Log all authentication events
   - Monitor for brute force attempts
   - Set up alerts for permission anomalies
   - Regular security assessments