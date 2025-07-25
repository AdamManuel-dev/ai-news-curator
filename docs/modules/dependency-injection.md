# Dependency Injection Module

## Overview

The Dependency Injection (DI) Module provides a comprehensive Inversion of Control (IoC) container for managing service dependencies throughout the AI Content Curator Agent. It enables loose coupling, testability, and maintainable code architecture.

## Purpose

- **Loose Coupling**: Reduce dependencies between components
- **Testability**: Enable easy mocking and testing
- **Lifecycle Management**: Control service creation and disposal
- **Configuration**: Centralized service configuration
- **Type Safety**: Compile-time type checking for dependencies

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Service Tokens │───▶│   DI Container  │───▶│   Services      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │   Decorators    │
                        └─────────────────┘
```

## Core Components

### Container

The main IoC container that manages service registration, resolution, and lifecycle.

**Location**: `src/container/Container.ts`

**Key Features**:
- Singleton and transient service lifecycles
- Circular dependency detection
- Type-safe service resolution
- Lazy initialization
- Factory function support

### Service Tokens

Unique symbols used to identify services in the container, ensuring type safety and preventing naming conflicts.

**Location**: `src/container/tokens.ts`

**Example**:
```typescript
export const TOKENS = {
  // Core Services
  CONFIG: Symbol('Config'),
  LOGGER: Symbol('Logger'),
  CACHE_SERVICE: Symbol('CacheService'),
  
  // Adapters
  REDIS_ADAPTER: Symbol('RedisAdapter'),
  
  // Controllers
  HEALTH_CONTROLLER: Symbol('HealthController'),
} as const;
```

### Decorators

TypeScript decorators for marking classes as injectable and defining dependencies.

**Available Decorators**:
- `@Injectable`: Marks a class as injectable
- `@Service`: Registers a service with the container
- `@Inject`: Injects dependencies into constructor parameters

## Container API

### Registration Methods

#### registerSingleton()
Registers a service as a singleton (single instance shared across the application).

```typescript
container.registerSingleton<ICacheService>(
  TOKENS.CACHE_SERVICE,
  CacheService
);
```

#### registerTransient()
Registers a service as transient (new instance created each time).

```typescript
container.registerTransient<IContentProcessor>(
  TOKENS.CONTENT_PROCESSOR,
  ContentProcessor
);
```

#### registerInstance()
Registers a pre-created instance.

```typescript
const logger = new Logger();
container.registerInstance(TOKENS.LOGGER, logger);
```

#### registerFactory()
Registers a factory function for custom service creation.

```typescript
container.registerFactory(
  TOKENS.DATABASE_CONNECTION,
  () => createDatabaseConnection(),
  true // singleton
);
```

### Resolution Methods

#### resolve()
Resolves a service by its token with full type safety.

```typescript
const cacheService = container.resolve<ICacheService>(TOKENS.CACHE_SERVICE);
```

#### isRegistered()
Checks if a service is registered.

```typescript
if (container.isRegistered(TOKENS.CACHE_SERVICE)) {
  // Service is available
}
```

## Service Lifecycle

### Singleton Services

Created once and reused throughout the application lifecycle.

```typescript
// First resolution creates the instance
const service1 = container.resolve<ICacheService>(TOKENS.CACHE_SERVICE);

// Subsequent resolutions return the same instance
const service2 = container.resolve<ICacheService>(TOKENS.CACHE_SERVICE);

console.log(service1 === service2); // true
```

### Transient Services

New instance created for each resolution.

```typescript
// Each resolution creates a new instance
const processor1 = container.resolve<IContentProcessor>(TOKENS.CONTENT_PROCESSOR);
const processor2 = container.resolve<IContentProcessor>(TOKENS.CONTENT_PROCESSOR);

console.log(processor1 === processor2); // false
```

## Dependency Injection Patterns

### Constructor Injection

The primary pattern for injecting dependencies into service constructors.

```typescript
@Injectable
export class CacheService extends BaseService implements ICacheService {
  private redisAdapter: ICacheAdapter;
  private config: AppConfig;

  constructor() {
    super();
    this.redisAdapter = container.resolve<ICacheAdapter>(REDIS_ADAPTER);
    this.config = container.resolve<AppConfig>(CONFIG);
  }
}
```

### Property Injection (Planned)

Future support for property-based injection using decorators.

```typescript
@Injectable
export class ContentService {
  @Inject(TOKENS.CACHE_SERVICE)
  private cacheService: ICacheService;

  @Inject(TOKENS.LOGGER)
  private logger: ILogger;
}
```

### Method Injection (Planned)

Future support for method parameter injection.

```typescript
@Injectable
export class AnalysisService {
  public analyze(
    content: string,
    @Inject(TOKENS.AI_SERVICE) aiService: IAIService
  ): Promise<Analysis> {
    return aiService.analyze(content);
  }
}
```

## Service Registration Setup

### Container Setup

All service registrations are centralized in the setup module.

**Location**: `src/container/setup.ts`

```typescript
export function setupContainer(): void {
  // Register configuration
  container.registerInstance(TOKENS.CONFIG, config);

  // Register logger
  container.registerInstance(TOKENS.LOGGER, logger);

  // Register adapters
  container.registerInstance(TOKENS.REDIS_ADAPTER, redisAdapter);

  // Register services
  container.registerSingleton(TOKENS.CACHE_SERVICE, CacheService);
  container.registerSingleton(TOKENS.HEALTH_CONTROLLER, HealthController);

  // Register other services...
}

// Initialize container setup
setupContainer();
```

### Automatic Registration (Planned)

Future support for automatic service discovery and registration.

```typescript
// Automatically register all services in a directory
container.autoRegister('./src/services/**/*.ts', {
  lifecycle: 'singleton',
  exclude: ['BaseService', 'AbstractService']
});
```

## Type Safety

### Generic Resolution

The container provides full type safety through TypeScript generics.

```typescript
// Type-safe resolution
const cacheService = container.resolve<ICacheService>(TOKENS.CACHE_SERVICE);
// cacheService is typed as ICacheService

// Compile-time error for wrong token
const wrongService = container.resolve<ICacheService>(TOKENS.LOGGER);
// Error: Type 'Logger' is not assignable to type 'ICacheService'
```

### Token Constraints

Service tokens are strongly typed to prevent runtime errors.

```typescript
// Valid token usage
const token: typeof TOKENS.CACHE_SERVICE = TOKENS.CACHE_SERVICE;

// Invalid token usage (compile-time error)
const invalidToken = 'cache-service'; // Error: string not assignable to symbol
```

## Error Handling

### Service Not Registered

```typescript
try {
  const service = container.resolve(TOKENS.UNKNOWN_SERVICE);
} catch (error) {
  console.error('Service not registered:', error.message);
  // Error: Service not registered: Symbol(UnknownService)
}
```

### Circular Dependencies

The container detects circular dependencies and throws descriptive errors.

```typescript
// ServiceA depends on ServiceB
// ServiceB depends on ServiceA
// Container will throw: "Circular dependency detected: ServiceA -> ServiceB -> ServiceA"
```

### Missing Dependencies

```typescript
// If a service's dependencies are not registered
try {
  container.registerSingleton(TOKENS.SERVICE_WITH_DEPS, ServiceWithDependencies);
  const service = container.resolve(TOKENS.SERVICE_WITH_DEPS);
} catch (error) {
  console.error('Missing dependency:', error.message);
}
```

## Testing with DI

### Mock Injection

The DI container makes testing easier by allowing mock injection.

```typescript
describe('CacheService', () => {
  let container: Container;
  let mockRedisAdapter: jest.Mocked<ICacheAdapter>;

  beforeEach(() => {
    container = new Container();
    mockRedisAdapter = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      // ... other methods
    };

    // Register mocks
    container.registerInstance(TOKENS.REDIS_ADAPTER, mockRedisAdapter);
    container.registerSingleton(TOKENS.CACHE_SERVICE, CacheService);
  });

  it('should call Redis adapter for get operation', async () => {
    const cacheService = container.resolve<ICacheService>(TOKENS.CACHE_SERVICE);
    
    mockRedisAdapter.get.mockResolvedValue('cached-value');
    
    const result = await cacheService.get('test-key');
    
    expect(mockRedisAdapter.get).toHaveBeenCalledWith('test-key');
    expect(result).toBe('cached-value');
  });
});
```

### Test Container

Utility for creating isolated test containers.

```typescript
export function createTestContainer(): Container {
  const testContainer = new Container();
  
  // Register test-specific services
  testContainer.registerInstance(TOKENS.LOGGER, createTestLogger());
  testContainer.registerInstance(TOKENS.CONFIG, createTestConfig());
  
  return testContainer;
}
```

## Performance Considerations

### Lazy Loading

Services are created only when first requested, not during registration.

```typescript
// Service is registered but not created
container.registerSingleton(TOKENS.EXPENSIVE_SERVICE, ExpensiveService);

// Service is created here on first access
const service = container.resolve<IExpensiveService>(TOKENS.EXPENSIVE_SERVICE);
```

### Instance Caching

Singleton instances are cached for optimal performance.

```typescript
// First resolution creates and caches the instance
const service1 = container.resolve(TOKENS.CACHE_SERVICE); // ~1ms

// Subsequent resolutions use cached instance
const service2 = container.resolve(TOKENS.CACHE_SERVICE); // ~0.01ms
```

### Memory Management

The container properly manages service lifecycles and memory.

```typescript
// Clear all services (useful for testing)
container.clear();

// Get registered service tokens for debugging
const tokens = container.getRegisteredTokens();
console.log('Registered services:', tokens.length);
```

## Advanced Features

### Conditional Registration

Register services based on environment or configuration.

```typescript
if (config.nodeEnv === 'production') {
  container.registerSingleton(TOKENS.METRICS_SERVICE, PrometheusMetricsService);
} else {
  container.registerSingleton(TOKENS.METRICS_SERVICE, NoOpMetricsService);
}
```

### Service Factories

Complex service creation using factory functions.

```typescript
container.registerFactory(
  TOKENS.DATABASE_POOL,
  () => {
    const pool = new DatabasePool({
      host: config.db.host,
      port: config.db.port,
      maxConnections: config.db.maxConnections,
    });
    
    pool.on('error', (error) => {
      logger.error('Database pool error', { error });
    });
    
    return pool;
  },
  true // singleton
);
```

### Proxy Services (Planned)

Future support for service proxies and interceptors.

```typescript
// Automatic logging proxy
container.registerProxy(TOKENS.CACHE_SERVICE, {
  before: (method, args) => logger.debug(`Calling ${method}`, { args }),
  after: (method, result) => logger.debug(`Result from ${method}`, { result }),
  error: (method, error) => logger.error(`Error in ${method}`, { error })
});
```

## Best Practices

### Service Design

1. **Interface-based Design**: Always register services by interface
2. **Single Responsibility**: Keep services focused on one concern
3. **Stateless When Possible**: Prefer stateless services for better testability
4. **Immutable Configuration**: Use readonly configuration objects

```typescript
// Good: Interface-based registration
container.registerSingleton<ICacheService>(TOKENS.CACHE_SERVICE, CacheService);

// Bad: Concrete class registration
container.registerSingleton(TOKENS.CACHE_SERVICE, CacheService);
```

### Token Management

1. **Centralized Tokens**: Keep all tokens in one file
2. **Descriptive Names**: Use clear, descriptive token names
3. **Namespace Separation**: Group related tokens together
4. **Export Convenience**: Export commonly used tokens individually

```typescript
// Good: Organized token structure
export const TOKENS = {
  // Core Services
  CONFIG: Symbol('Config'),
  LOGGER: Symbol('Logger'),
  
  // Data Layer
  CACHE_SERVICE: Symbol('CacheService'),
  DATABASE_SERVICE: Symbol('DatabaseService'),
  
  // Business Logic
  CONTENT_SERVICE: Symbol('ContentService'),
  ANALYSIS_SERVICE: Symbol('AnalysisService'),
} as const;

// Export for convenience
export const { CONFIG, LOGGER, CACHE_SERVICE } = TOKENS;
```

### Dependency Management

1. **Minimal Dependencies**: Keep service dependencies to a minimum
2. **Explicit Dependencies**: Make all dependencies explicit in constructors
3. **Avoid Circular Dependencies**: Design services to avoid circular references
4. **Lazy Resolution**: Resolve dependencies only when needed

## Migration Guide

### From Manual DI

If migrating from manual dependency injection:

```typescript
// Before: Manual DI
class CacheService {
  constructor(
    private redisAdapter: ICacheAdapter,
    private logger: ILogger
  ) {}
}

const redisAdapter = new RedisAdapter();
const logger = new Logger();
const cacheService = new CacheService(redisAdapter, logger);

// After: Container DI
@Injectable
class CacheService extends BaseService {
  private redisAdapter: ICacheAdapter;

  constructor() {
    super();
    this.redisAdapter = container.resolve<ICacheAdapter>(TOKENS.REDIS_ADAPTER);
  }
}

container.registerSingleton(TOKENS.CACHE_SERVICE, CacheService);
const cacheService = container.resolve<ICacheService>(TOKENS.CACHE_SERVICE);
```

### From Other DI Frameworks

Migration patterns from popular DI frameworks:

```typescript
// From inversify
container.bind<ICacheService>(TYPES.CacheService).to(CacheService);
// To our container
container.registerSingleton<ICacheService>(TOKENS.CACHE_SERVICE, CacheService);

// From awilix
container.register('cacheService', asClass(CacheService).singleton());
// To our container
container.registerSingleton(TOKENS.CACHE_SERVICE, CacheService);
```

## Debugging and Diagnostics

### Container Inspection

```typescript
// Get all registered services
const services = container.getRegisteredTokens();
console.log('Registered services:', services.map(s => s.toString()));

// Check if specific service is registered
if (container.isRegistered(TOKENS.CACHE_SERVICE)) {
  console.log('Cache service is available');
}
```

### Resolution Tracing (Planned)

Future support for dependency resolution tracing.

```typescript
// Enable resolution tracing
container.enableTracing();

// Resolve service with trace
const service = container.resolve(TOKENS.COMPLEX_SERVICE);
// Output: Resolving ComplexService -> CacheService -> RedisAdapter
```

## Future Enhancements

### Planned Features

1. **Property Injection**: `@Inject` decorator for properties
2. **Method Injection**: Parameter injection for methods
3. **Conditional Registration**: Register services based on conditions
4. **Service Proxies**: Interceptors and proxies for cross-cutting concerns
5. **Auto-discovery**: Automatic service registration
6. **Configuration Validation**: Validate service configurations
7. **Performance Metrics**: Track container performance
8. **Visual Dependency Graph**: Generate dependency diagrams

### Roadmap

- **Q1**: Property and method injection
- **Q2**: Service proxies and interceptors
- **Q3**: Auto-discovery and validation
- **Q4**: Performance optimization and metrics

The Dependency Injection Module provides a robust foundation for managing service dependencies while maintaining type safety, testability, and clean architecture principles.