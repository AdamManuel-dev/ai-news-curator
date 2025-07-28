# AI News Curator - API Reference

## Overview

The AI News Curator provides a comprehensive REST API for content aggregation, curation, and management. All endpoints support JSON request/response formats with built-in authentication, rate limiting, and error handling.

## Base URL

```
Production: https://api.ai-news-curator.com
Development: http://localhost:3000
```

## Authentication

### JWT Authentication

Most endpoints require JWT authentication via the `Authorization` header:

```http
Authorization: Bearer <jwt_token>
```

### API Key Authentication

Service-to-service communication uses API keys via the `X-API-Key` header:

```http
X-API-Key: aic_<api_key>
```

## Rate Limiting

All endpoints are rate-limited based on user context:

- **Authenticated Users**: 1000 requests/hour
- **API Keys**: Configurable per key (default 10,000/hour)
- **Anonymous**: 100 requests/hour

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "requestId": "req-123456",
    "timestamp": "2025-01-01T12:00:00Z"
  }
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Validation Error |
| 429 | Rate Limited |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Health & System Endpoints

### Get System Health

Check overall system health and dependencies.

```http
GET /health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T12:00:00Z",
  "version": "1.0.0",
  "uptime": 3600,
  "environment": "production",
  "dependencies": {
    "redis": {
      "status": "connected",
      "latency": 2
    },
    "vectordb": {
      "status": "connected",
      "indexName": "ai-content"
    },
    "memory": {
      "used": 134217728,
      "free": 402653184,
      "total": 536870912,
      "percentage": 25
    }
  },
  "checks": [
    {
      "name": "redis",
      "status": "pass",
      "details": "Redis health: healthy (2ms)",
      "responseTime": 5
    }
  ]
}
```

### Get Detailed Health

Get comprehensive health information including disk usage.

```http
GET /health/detailed
```

**Response:** Similar to `/health` with additional disk metrics.

### Get System Metrics

Prometheus-compatible metrics endpoint.

```http
GET /metrics
```

**Response:** Prometheus metrics format

## Authentication Endpoints

### User Login

Authenticate user and receive JWT token.

```http
POST /auth/login
```

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh_token_here",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "roles": ["user"]
  },
  "expiresIn": 3600
}
```

### Refresh Token

Get new access token using refresh token.

```http
POST /auth/refresh
```

**Request:**

```json
{
  "refreshToken": "refresh_token_here"
}
```

**Response:**

```json
{
  "token": "new_jwt_token",
  "expiresIn": 3600
}
```

### User Logout

Invalidate current session.

```http
POST /auth/logout
Authorization: Bearer <token>
```

**Response:**

```json
{
  "message": "Successfully logged out"
}
```

## API Key Management

### Create API Key

Create a new API key for service authentication.

```http
POST /api-keys
Authorization: Bearer <token>
```

**Request:**

```json
{
  "name": "My Service Key",
  "permissions": ["content:read", "content:create"],
  "rateLimit": 5000,
  "expiresAt": "2025-12-31T23:59:59Z",
  "description": "API key for content service"
}
```

**Response:**

```json
{
  "apiKey": {
    "id": "key-123",
    "name": "My Service Key",
    "permissions": ["content:read", "content:create"],
    "rateLimit": 5000,
    "isActive": true,
    "expiresAt": "2025-12-31T23:59:59Z",
    "createdAt": "2025-01-01T12:00:00Z"
  },
  "rawKey": "aic_1234567890abcdef..."
}
```

### List API Keys

Get all API keys for the authenticated user.

```http
GET /api-keys
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": [
    {
      "id": "key-123",
      "name": "My Service Key",
      "permissions": ["content:read"],
      "rateLimit": 5000,
      "isActive": true,
      "lastUsedAt": "2025-01-01T11:30:00Z",
      "expiresAt": "2025-12-31T23:59:59Z",
      "createdAt": "2025-01-01T12:00:00Z"
    }
  ],
  "meta": {
    "count": 1
  }
}
```

### Update API Key

Update API key properties.

```http
PUT /api-keys/:keyId
Authorization: Bearer <token>
```

**Request:**

```json
{
  "name": "Updated Service Key",
  "rateLimit": 10000,
  "isActive": false
}
```

### Revoke API Key

Revoke (deactivate) an API key.

```http
DELETE /api-keys/:keyId
Authorization: Bearer <token>
```

### Get API Key Usage

Get usage statistics for an API key.

```http
GET /api-keys/:keyId/usage
Authorization: Bearer <token>
```

**Query Parameters:**

- `days` (optional): Number of days to include (default: 30)

**Response:**

```json
{
  "keyId": "key-123",
  "totalRequests": 1250,
  "requestsToday": 45,
  "requestsThisHour": 3,
  "lastUsedAt": "2025-01-01T11:30:00Z",
  "averageRequestsPerDay": 41.67
}
```

### Rotate API Key

Generate a new key while keeping the same configuration.

```http
POST /api-keys/:keyId/rotate
Authorization: Bearer <token>
```

**Request:**

```json
{
  "extendDays": 90
}
```

**Response:**

```json
{
  "oldKey": {
    "id": "key-123",
    "isActive": false
  },
  "newKey": {
    "id": "key-456",
    "name": "My Service Key (Rotated)",
    "isActive": true,
    "expiresAt": "2025-04-01T12:00:00Z"
  },
  "rawKey": "aic_new_key_here..."
}
```

## Role Management

### List Roles

Get all available roles in the system.

```http
GET /roles
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": [
    {
      "id": "role-1",
      "name": "admin",
      "description": "Full system access",
      "permissions": [
        "system:admin",
        "users:manage",
        "content:manage"
      ],
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### Create Role

Create a new role with permissions.

```http
POST /roles
Authorization: Bearer <token>
```

**Request:**

```json
{
  "name": "content_moderator",
  "description": "Content moderation access",
  "permissions": [
    "content:read",
    "content:update",
    "content:moderate"
  ]
}
```

### Assign User Role

Assign a role to a user.

```http
POST /roles/:roleId/users/:userId
Authorization: Bearer <token>
```

### Remove User Role

Remove a role from a user.

```http
DELETE /roles/:roleId/users/:userId
Authorization: Bearer <token>
```

## Content Management

### Get Content

Retrieve paginated content with filtering and sorting.

```http
GET /content
Authorization: Bearer <token>
```

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `pageSize` (optional): Items per page (default: 20, max: 100)
- `category` (optional): Filter by category
- `type` (optional): Filter by content type
- `status` (optional): Filter by status
- `author` (optional): Filter by author
- `source` (optional): Filter by source
- `tag` (optional): Filter by tag
- `startDate` (optional): Filter by date range start
- `endDate` (optional): Filter by date range end
- `search` (optional): Search query
- `sortBy` (optional): Sort field
- `sortOrder` (optional): Sort direction (asc/desc)

**Response:**

```json
{
  "data": [
    {
      "id": "content-123",
      "title": "AI Breakthrough in Natural Language Processing",
      "content": "Researchers have developed...",
      "summary": "A new AI model shows significant improvements...",
      "author": "Dr. Jane Smith",
      "publishDate": "2025-01-01T10:00:00Z",
      "source": "AI Research Journal",
      "tags": ["AI", "NLP", "Machine Learning"],
      "status": "published",
      "createdAt": "2025-01-01T12:00:00Z",
      "updatedAt": "2025-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrevious": false
  },
  "meta": {
    "filters": {
      "category": "AI",
      "status": "published"
    },
    "sorting": {
      "field": "publishDate",
      "direction": "desc"
    }
  }
}
```

### Get Content by ID

Retrieve specific content by ID.

```http
GET /content/:contentId
Authorization: Bearer <token>
```

**Response:**

```json
{
  "id": "content-123",
  "title": "AI Breakthrough in Natural Language Processing",
  "content": "Full content here...",
  "summary": "Brief summary...",
  "author": "Dr. Jane Smith",
  "publishDate": "2025-01-01T10:00:00Z",
  "source": "AI Research Journal",
  "tags": ["AI", "NLP", "Machine Learning"],
  "metadata": {
    "scrapedAt": "2025-01-01T11:00:00Z",
    "scraperVersion": "1.0.0",
    "contentLength": 2500,
    "hasCodeExamples": true,
    "hasImages": false,
    "language": "en"
  },
  "status": "published",
  "createdAt": "2025-01-01T12:00:00Z",
  "updatedAt": "2025-01-01T12:00:00Z"
}
```

### Create Content

Create new content entry.

```http
POST /content
Authorization: Bearer <token>
```

**Request:**

```json
{
  "title": "New AI Development",
  "content": "Content body here...",
  "summary": "Brief summary...",
  "author": "John Doe",
  "publishDate": "2025-01-01T10:00:00Z",
  "source": "Tech Blog",
  "tags": ["AI", "Technology"],
  "status": "draft"
}
```

### Update Content

Update existing content.

```http
PUT /content/:contentId
Authorization: Bearer <token>
```

**Request:**

```json
{
  "title": "Updated Title",
  "status": "published"
}
```

### Delete Content

Delete content entry.

```http
DELETE /content/:contentId
Authorization: Bearer <token>
```

**Response:**

```json
{
  "deleted": true
}
```

## Search & Discovery

### Vector Search

Perform semantic search using vector embeddings.

```http
POST /search/vector
Authorization: Bearer <token>
```

**Request:**

```json
{
  "query": "machine learning algorithms for natural language processing",
  "limit": 10,
  "filters": {
    "category": "AI",
    "publishedAfter": "2024-01-01T00:00:00Z"
  }
}
```

**Response:**

```json
{
  "results": [
    {
      "content": {
        "id": "content-123",
        "title": "Advanced NLP with ML",
        "summary": "Overview of ML algorithms...",
        "relevanceScore": 0.95
      }
    }
  ],
  "meta": {
    "query": "machine learning algorithms...",
    "resultsCount": 10,
    "searchTime": 45
  }
}
```

### Full-Text Search

Perform traditional text-based search.

```http
GET /search
Authorization: Bearer <token>
```

**Query Parameters:**

- `q`: Search query (required)
- `category`: Filter by category
- `limit`: Number of results (default: 20)
- `offset`: Pagination offset

## Content Sources

### List Sources

Get all configured content sources.

```http
GET /sources
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": [
    {
      "id": "source-1",
      "name": "TechCrunch",
      "url": "https://techcrunch.com",
      "type": "rss",
      "category": "Technology",
      "isActive": true,
      "lastChecked": "2025-01-01T11:00:00Z",
      "successCount": 1250,
      "errorCount": 5
    }
  ]
}
```

### Add Source

Add a new content source.

```http
POST /sources
Authorization: Bearer <token>
```

**Request:**

```json
{
  "name": "AI News Source",
  "url": "https://example.com/ai-news",
  "type": "web",
  "category": "AI",
  "scheduleCron": "0 */6 * * *",
  "selectors": {
    "title": "h1.article-title",
    "content": ".article-content",
    "author": ".author-name"
  }
}
```

### Update Source

Update source configuration.

```http
PUT /sources/:sourceId
Authorization: Bearer <token>
```

### Delete Source

Remove a content source.

```http
DELETE /sources/:sourceId
Authorization: Bearer <token>
```

## Admin Endpoints

### System Stats

Get system-wide statistics (admin only).

```http
GET /admin/stats
Authorization: Bearer <token>
```

**Response:**

```json
{
  "users": {
    "total": 1250,
    "active": 890,
    "newThisMonth": 45
  },
  "content": {
    "total": 15000,
    "published": 12500,
    "draft": 2500
  },
  "apiKeys": {
    "total": 150,
    "active": 140,
    "expiringThisMonth": 8
  },
  "sources": {
    "total": 25,
    "active": 23,
    "lastCheckErrors": 2
  }
}
```

### Manage Users

CRUD operations for user management (admin only).

```http
GET /admin/users
POST /admin/users
PUT /admin/users/:userId
DELETE /admin/users/:userId
Authorization: Bearer <token>
```

## Webhooks

### Register Webhook

Register a webhook for event notifications.

```http
POST /webhooks
Authorization: Bearer <token>
```

**Request:**

```json
{
  "url": "https://your-app.com/webhook",
  "events": ["content.created", "content.updated"],
  "secret": "webhook-secret-key"
}
```

### Webhook Events

The system sends webhooks for these events:

- `content.created`: New content added
- `content.updated`: Content modified
- `content.deleted`: Content removed
- `user.registered`: New user account
- `api_key.created`: New API key generated
- `api_key.rotated`: API key rotated

**Webhook Payload:**

```json
{
  "event": "content.created",
  "timestamp": "2025-01-01T12:00:00Z",
  "data": {
    "id": "content-123",
    "title": "New Article",
    "status": "published"
  }
}
```

## SDK Usage Examples

### JavaScript/Node.js

```javascript
const { AiNewsCuratorClient } = require('@ai-news-curator/client');

const client = new AiNewsCuratorClient({
  baseURL: 'https://api.ai-news-curator.com',
  apiKey: 'your-api-key'
});

// Get content
const content = await client.content.list({
  category: 'AI',
  limit: 10
});

// Create content
const newContent = await client.content.create({
  title: 'New Article',
  content: 'Article content...',
  tags: ['AI', 'Technology']
});
```

### Python

```python
from ai_news_curator import Client

client = Client(
    base_url='https://api.ai-news-curator.com',
    api_key='your-api-key'
)

# Get content
content = client.content.list(category='AI', limit=10)

# Search content
results = client.search.vector(
    query='machine learning algorithms',
    limit=5
)
```

### cURL Examples

```bash
# Get health status
curl -X GET https://api.ai-news-curator.com/health

# Get content with API key
curl -X GET https://api.ai-news-curator.com/content \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json"

# Create content with JWT
curl -X POST https://api.ai-news-curator.com/content \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Article",
    "content": "Article content...",
    "tags": ["AI"]
  }'
```

## Response Serialization

All API responses support multiple serialization options:

### Content Transformation

Control response data format via query parameters:

- `dateFormat`: ISO, timestamp, or relative
- `timezone`: Timezone for date formatting
- `camelCase`: Convert keys to camelCase
- `includeNulls`: Include null values in response
- `fields`: Comma-separated list of fields to include

### Example with Serialization

```http
GET /content?dateFormat=relative&camelCase=true&fields=id,title,publishDate
```

**Response:**

```json
{
  "data": [
    {
      "id": "content-123",
      "title": "AI Breakthrough",
      "publishDate": "2 hours ago"
    }
  ]
}
```