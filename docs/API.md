# API Reference

## Overview

The AI Content Curator Agent provides a RESTful API for content discovery, curation, and management. All endpoints return JSON responses and follow consistent error handling patterns.

## Base URL

```
Development: http://localhost:3000
Production: https://api.ai-content-curator.com
```

## Authentication

API authentication is handled via JWT tokens passed in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

*Note: Authentication endpoints are planned for future implementation.*

## Response Format

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data here
  },
  "requestId": "uuid-v4-request-id"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "requestId": "uuid-v4-request-id",
  "details": {
    // Additional error details (optional)
  }
}
```

## Health Endpoints

### GET /health

Basic health check endpoint that returns system status and dependency health.

**Parameters:** None

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "status": "healthy" | "degraded" | "unhealthy",
    "version": "1.0.0",
    "environment": "production",
    "uptime": 3600,
    "timestamp": "2025-01-15T10:30:00.000Z",
    "dependencies": {
      "redis": {
        "status": "connected" | "disconnected" | "error",
        "latency": 2
      },
      "memory": {
        "used": 214775968,
        "free": 122750816,
        "total": 337526784,
        "percentage": 64
      }
    },
    "checks": [
      {
        "name": "redis",
        "status": "pass" | "fail" | "warn",
        "details": "Connected with 2ms latency",
        "responseTime": 2
      },
      {
        "name": "memory",
        "status": "pass" | "fail" | "warn",
        "details": "Normal memory usage: 64%"
      }
    ]
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Status Codes:**
- `200 OK`: System is healthy or degraded but operational
- `503 Service Unavailable`: System is unhealthy

**Example:**
```bash
curl -X GET http://localhost:3000/health
```

### GET /health/detailed

Comprehensive health check with additional system metrics and extended diagnostics.

**Parameters:** None

**Response:** `200 OK`

Returns the same format as `/health` but includes additional metrics:
- Disk usage information (when available)
- Extended dependency checks
- Performance metrics

**Example:**
```bash
curl -X GET http://localhost:3000/health/detailed
```

## Root Endpoint

### GET /

Returns basic API information and status.

**Parameters:** None

**Response:** `200 OK`
```json
{
  "message": "AI Content Curator Agent API",
  "version": "1.0.0",
  "environment": "production"
}
```

**Example:**
```bash
curl -X GET http://localhost:3000/
```

## Content Endpoints

*The following endpoints are planned for future implementation:*

### GET /api/v1/content

Retrieve curated content with filtering and pagination.

**Parameters:**
- `tags` (query, optional): Comma-separated list of tags to filter by
- `category` (query, optional): Content category filter
- `since` (query, optional): ISO date string for content since date
- `limit` (query, optional): Number of items to return (default: 20, max: 100)
- `offset` (query, optional): Number of items to skip (default: 0)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "content-uuid",
        "title": "Understanding RAG Systems",
        "url": "https://example.com/rag-systems",
        "summary": "A comprehensive guide to Retrieval-Augmented Generation systems...",
        "tags": ["rag", "llm", "ai", "tutorial"],
        "category": "tutorial",
        "score": 0.95,
        "publishedAt": "2025-01-15T08:00:00.000Z",
        "discoveredAt": "2025-01-15T08:30:00.000Z",
        "source": {
          "name": "AI Research Blog",
          "type": "blog",
          "reputation": 0.9
        }
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 20,
      "offset": 0,
      "hasNext": true,
      "hasPrev": false
    }
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440001"
}
```

### POST /api/v1/content/analyze

Analyze a URL and extract content metadata and tags.

**Request Body:**
```json
{
  "url": "https://example.com/article",
  "options": {
    "includeSummary": true,
    "extractTags": true,
    "calculateScore": true
  }
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "url": "https://example.com/article",
    "title": "Advanced LLM Techniques",
    "summary": "This article explores advanced techniques for working with Large Language Models...",
    "tags": [
      {
        "name": "llm",
        "confidence": 0.95,
        "category": "technology"
      },
      {
        "name": "machine-learning",
        "confidence": 0.88,
        "category": "field"
      }
    ],
    "score": 0.87,
    "metadata": {
      "wordCount": 2500,
      "readingTime": 10,
      "language": "en",
      "publishedAt": "2025-01-15T10:00:00.000Z"
    }
  }
}
```

### GET /api/v1/trends

Get trending topics and emerging discussions in AI/ML.

**Parameters:**
- `timeframe` (query, optional): Time period for trend analysis (1d, 7d, 30d)
- `category` (query, optional): Specific category to analyze

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "timeframe": "7d",
    "trends": [
      {
        "topic": "AI Agents",
        "growth": 3.2,
        "mentions": 156,
        "sentiment": "positive",
        "keywords": ["autonomous", "reasoning", "tool-use"]
      },
      {
        "topic": "RAG Systems",
        "growth": 1.8,
        "mentions": 89,
        "sentiment": "neutral",
        "keywords": ["retrieval", "context", "embedding"]
      }
    ],
    "emerging": [
      {
        "topic": "Multimodal LLMs",
        "score": 0.75,
        "firstSeen": "2025-01-10T00:00:00.000Z"
      }
    ]
  }
}
```

## Search Endpoints

### GET /api/v1/search

Search through curated content using semantic and keyword search.

**Parameters:**
- `q` (query, required): Search query
- `type` (query, optional): Search type ('semantic' | 'keyword' | 'hybrid')
- `filters` (query, optional): JSON-encoded filter object
- `limit` (query, optional): Number of results (default: 10, max: 50)

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "query": "machine learning optimization",
    "type": "hybrid",
    "results": [
      {
        "id": "content-uuid",
        "title": "ML Optimization Techniques",
        "relevanceScore": 0.92,
        "snippet": "Advanced optimization methods for machine learning models...",
        "url": "https://example.com/ml-optimization",
        "tags": ["optimization", "ml", "performance"]
      }
    ],
    "totalResults": 45,
    "processingTime": 0.15
  }
}
```

## User Endpoints

*Planned for future implementation:*

### GET /api/v1/users/preferences

Get user content preferences and settings.

### PUT /api/v1/users/preferences

Update user content preferences.

### GET /api/v1/users/feed

Get personalized content feed based on user preferences.

## Error Codes

| Code | Description | Details |
|------|-------------|---------|
| 400 | Bad Request | Invalid request parameters or body |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions for the requested resource |
| 404 | Not Found | Requested resource does not exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Service temporarily unavailable |

## Rate Limiting

API endpoints are rate-limited to ensure fair usage:

- **Default limit**: 1000 requests per hour per IP
- **Authenticated users**: 10,000 requests per hour
- **Search endpoints**: 100 requests per minute

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642694400
```

## CORS Policy

Cross-Origin Resource Sharing (CORS) is configured as follows:

- **Development**: All origins allowed
- **Production**: Specific domains whitelisted
- **Credentials**: Supported for authenticated requests
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization, X-Requested-With

## Webhooks

*Planned for future implementation:*

Webhook endpoints will be available for real-time notifications about:
- New content discoveries
- Trending topic alerts
- Personalized recommendations

## SDK Support

Official SDKs will be available for:
- JavaScript/TypeScript (Node.js and Browser)
- Python
- Go
- Rust

## OpenAPI Specification

A complete OpenAPI 3.0 specification is available at:
```
GET /api/docs/openapi.json
```

Interactive API documentation is available at:
```
GET /api/docs
```

## Examples

### Complete Workflow Example

```bash
# 1. Check system health
curl -X GET http://localhost:3000/health

# 2. Get API information
curl -X GET http://localhost:3000/

# 3. Analyze a URL (when implemented)
curl -X POST http://localhost:3000/api/v1/content/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'

# 4. Search for content (when implemented)
curl -X GET "http://localhost:3000/api/v1/search?q=machine+learning&limit=5"

# 5. Get trending topics (when implemented)
curl -X GET "http://localhost:3000/api/v1/trends?timeframe=7d"
```

### JavaScript SDK Example

```javascript
import { ContentCuratorClient } from '@ai-curator/sdk';

const client = new ContentCuratorClient({
  baseURL: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// Check health
const health = await client.health.check();
console.log('System status:', health.data.status);

// Analyze content
const analysis = await client.content.analyze({
  url: 'https://example.com/article'
});
console.log('Content tags:', analysis.data.tags);

// Search content
const results = await client.search.query('machine learning', {
  type: 'semantic',
  limit: 10
});
console.log('Found results:', results.data.totalResults);
```

This API reference will be updated as new endpoints are implemented and existing ones are enhanced.