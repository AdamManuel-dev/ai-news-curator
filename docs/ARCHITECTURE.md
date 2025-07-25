# System Architecture

## Overview

The AI Content Curator Agent is built using a layered architecture with dependency injection, following clean architecture principles. The system is designed for scalability, maintainability, and testability.

## Architectural Principles

### 1. Separation of Concerns
- **Controllers**: Handle HTTP requests and responses
- **Services**: Contain business logic
- **Adapters**: Interface with external systems
- **Models**: Define data structures
- **Middleware**: Cross-cutting concerns

### 2. Dependency Injection
- All dependencies are managed through an IoC container
- Promotes loose coupling and testability
- Singleton and transient service lifecycles

### 3. Layer Independence
- Higher layers depend on abstractions, not concrete implementations
- Easy to swap implementations (e.g., different cache providers)
- Clean testing through mocking

## System Components

```
┌──────────────────────────────────────────────────────────────────┐
│                           Presentation Layer                     │
├──────────────────────────────────────────────────────────────────┤
│  Controllers  │  Routes  │  Middleware  │  Request/Response DTOs │
└──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Application Layer                      │
├─────────────────────────────────────────────────────────────────┤
│     Services     │  Use Cases   │  Application Logic            │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Domain Layer                          │
├─────────────────────────────────────────────────────────────────┤
│     Models      │  Entities    │  Domain Logic                  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Infrastructure Layer                     │
├─────────────────────────────────────────────────────────────────┤
│   Adapters   │  Repositories  │  External Services              │
└─────────────────────────────────────────────────────────────────┘
```

## Dependency Injection Container

### Container Structure

```typescript
// Service Registration
container.registerSingleton(TOKENS.CACHE_SERVICE, CacheService);
container.registerInstance(TOKENS.LOGGER, logger);
container.registerTransient(TOKENS.CONTENT_PROCESSOR, ContentProcessor);

// Service Resolution
const cacheService = container.resolve<ICacheService>(TOKENS.CACHE_SERVICE);
```

### Service Tokens

Services are identified by symbols to ensure type safety:

```typescript
export const TOKENS = {
  // Core Services
  CONFIG: Symbol('Config'),
  LOGGER: Symbol('Logger'),
  CACHE_SERVICE: Symbol('CacheService'),
  
  // Adapters
  REDIS_ADAPTER: Symbol('RedisAdapter'),
  VECTOR_DB_ADAPTER: Symbol('VectorDBAdapter'),
  
  // Controllers
  HEALTH_CONTROLLER: Symbol('HealthController'),
  CONTENT_CONTROLLER: Symbol('ContentController'),
} as const;
```

## Data Flow Architecture

### Request Processing Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│ Middleware  │───▶│ Controller  │───▶│  Service    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │                 │                 │
                          ▼                 ▼                 ▼
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │  Logging    │    │ Validation  │    │  Adapter    │
                   └─────────────┘    └─────────────┘    └─────────────┘
```

### Content Processing Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Discovery  │───▶│  Extraction │───▶│  Analysis   │───▶│   Storage   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Web Scraper │    │   Parser    │    │  AI Models  │    │   Vector    │
│   RSS Feed  │    │ Sanitizer   │    │   Tagger    │    │   Database  │
│ Social API  │    │ Extractor   │    │   Ranker    │    │    Cache    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## Core Modules

### 1. Configuration Module (`src/config/`)

Centralized configuration management with environment-based settings.

```typescript
interface AppConfig {
  port: number;
  nodeEnv: string;
  redis: RedisConfig;
  api: ApiConfig;
  limits: ProcessingLimits;
}
```

**Features:**
- Type-safe configuration
- Environment variable validation
- Default value handling
- Nested configuration objects

### 2. Container Module (`src/container/`)

Dependency injection system managing service lifecycles.

**Components:**
- `Container.ts`: Core DI container implementation
- `tokens.ts`: Service identifier symbols
- `setup.ts`: Service registration configuration

**Features:**
- Singleton and transient service support
- Circular dependency detection
- Lazy loading
- Type-safe service resolution

### 3. Adapters Module (`src/adapters/`)

External service integration layer.

**Current Adapters:**
- `RedisAdapter`: Caching and session storage
- `VectorDBAdapter`: Semantic search (planned)
- `AIServiceAdapter`: LLM integration (planned)

**Features:**
- Consistent interface abstractions
- Connection pooling
- Error handling and retries
- Health monitoring

### 4. Services Module (`src/services/`)

Business logic implementation.

**Service Categories:**
- **Core Services**: CacheService, ConfigService
- **Content Services**: DiscoveryService, TaggingService, RankingService
- **User Services**: PersonalizationService, PreferenceService

**Features:**
- Business rule enforcement
- Transaction management
- Validation and sanitization
- Audit logging

### 5. Controllers Module (`src/controllers/`)

HTTP request handling layer.

**Controller Types:**
- `HealthController`: System health monitoring
- `ContentController`: Content CRUD operations
- `SearchController`: Content discovery

**Features:**
- Request validation
- Response formatting
- Error handling
- Authentication integration

## Caching Strategy

### Multi-Level Caching

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Application │───▶│    Redis    │───▶│  Database   │
│    Cache    │    │    Cache    │    │   Storage   │
└─────────────┘    └─────────────┘    └─────────────┘
      L1               L2               L3
```

### Cache Patterns

1. **Cache-Aside**: Application manages cache population
2. **Write-Through**: Writes go to cache and database
3. **Write-Behind**: Asynchronous database writes
4. **Refresh-Ahead**: Proactive cache refreshing

### TTL Strategy

| Data Type | TTL | Reasoning |
|-----------|-----|-----------|
| Content Metadata | 7 days | Relatively stable |
| Tag Assignments | 30 days | High reuse value |
| Trend Data | 1 day | Needs freshness |
| User Preferences | 1 hour | Frequent changes |

## Error Handling Strategy

### Error Categories

1. **Validation Errors** (400): Input validation failures
2. **Authentication Errors** (401): Invalid credentials
3. **Authorization Errors** (403): Insufficient permissions
4. **Not Found Errors** (404): Resource not found
5. **Rate Limit Errors** (429): Too many requests
6. **Server Errors** (500): Internal failures

### Error Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Service   │───▶│  Controller │───▶│ Middleware  │
│   Error     │    │   Handler   │    │   Handler   │
└─────────────┘    └─────────────┘    └─────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │   Logger    │
                                    └─────────────┘
```

## Security Architecture

### Security Layers

1. **Transport Security**: HTTPS/TLS encryption
2. **Authentication**: JWT token validation
3. **Authorization**: Role-based access control
4. **Input Validation**: Request sanitization
5. **Rate Limiting**: Abuse prevention
6. **CORS**: Cross-origin request control

### Security Headers

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}));
```

## Monitoring and Observability

### Health Monitoring

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Health      │───▶│ Dependency  │───▶│ External    │
│ Controller  │    │   Checks    │    │ Services    │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Metrics Collection

- **Application Metrics**: Request rate, response time, error rate
- **System Metrics**: CPU, memory, disk usage
- **Business Metrics**: Content processed, users served
- **Dependency Metrics**: Database connections, cache hit rate

### Logging Strategy

```typescript
// Structured logging with Winston
logger.info('Content processed', {
  contentId,
  processingTime,
  tags: assignedTags,
  user: userId,
  timestamp: new Date().toISOString(),
});
```

## Scalability Considerations

### Horizontal Scaling

- **Stateless Design**: No server-side session storage
- **Load Balancing**: Multiple application instances
- **Database Sharding**: Distributed data storage
- **Microservices**: Service decomposition

### Performance Optimization

- **Connection Pooling**: Database and Redis connections
- **Lazy Loading**: On-demand service initialization
- **Async Processing**: Non-blocking operations
- **Compression**: Response payload optimization

## Deployment Architecture

### Development Environment

```
┌─────────────┐    ┌─────────────┐
│ Application │───▶│    Redis    │
│  (Node.js)  │    │   (Local)   │
└─────────────┘    └─────────────┘
```

### Production Environment

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│Load Balancer│───▶│ Application │───▶│    Redis    │
│   (Nginx)   │    │  Cluster    │    │   Cluster   │
└─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   Vector    │
                   │  Database   │
                   └─────────────┘
```

## Future Architecture Evolution

### Planned Enhancements

1. **Microservices Migration**: Service decomposition
2. **Event-Driven Architecture**: Async messaging
3. **GraphQL API**: Flexible query interface
4. **Machine Learning Pipeline**: Model training and inference
5. **Real-time Updates**: WebSocket integration

### Technology Roadmap

- **Q1**: Vector database integration
- **Q2**: AI model deployment
- **Q3**: Real-time processing
- **Q4**: Multi-tenant support

This architecture provides a solid foundation for the AI Content Curator Agent while maintaining flexibility for future growth and evolution.