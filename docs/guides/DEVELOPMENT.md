# Development Guide

## Overview

This guide provides comprehensive information for developers working on the AI Content Curator Agent. It covers setup, development workflow, coding standards, and best practices.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Debugging](#debugging)
- [Performance](#performance)
- [Security](#security)
- [Contributing](#contributing)

## Getting Started

### Prerequisites

- **Node.js**: >= 18.0.0 (LTS recommended)
- **npm**: >= 8.0.0
- **Redis**: >= 6.0.0
- **Git**: >= 2.20.0
- **Docker**: >= 20.10.0 (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-news-curator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Start dependencies**
   ```bash
   # Start Redis locally
   redis-server
   
   # Or use Docker
   docker run -d -p 6379:6379 redis:7-alpine
   ```

5. **Verify installation**
   ```bash
   npm run build
   npm test
   npm run dev
   ```

### First-time Setup

```bash
# Install recommended VS Code extensions
code --install-extension ms-vscode.vscode-typescript-next
code --install-extension esbenp.prettier-vscode
code --install-extension bradlc.vscode-tailwindcss

# Set up pre-commit hooks
npx husky install
```

## Development Environment

### Recommended Tools

- **IDE**: Visual Studio Code with TypeScript support
- **Extensions**:
  - TypeScript Hero
  - ESLint
  - Prettier
  - Jest Runner
  - REST Client
  - Docker

### VS Code Configuration

Create `.vscode/settings.json`:
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "jest.autoRun": "watch",
  "typescript.suggest.autoImports": true
}
```

### Environment Variables

| Variable | Development Value | Description |
|----------|-------------------|-------------|
| `NODE_ENV` | `development` | Environment identifier |
| `PORT` | `3000` | Server port |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `LOG_LEVEL` | `debug` | Logging verbosity |
| `ENABLE_DEBUG_LOGGING` | `true` | Enable debug logs |

## Project Structure

```
src/
├── adapters/          # External service adapters
│   ├── index.ts
│   └── redis.ts       # Redis caching adapter
├── config/            # Configuration management
│   └── index.ts       # App configuration
├── container/         # Dependency injection
│   ├── Container.ts   # DI container implementation
│   ├── index.ts       # Container exports
│   ├── setup.ts       # Service registration
│   └── tokens.ts      # Service tokens
├── controllers/       # HTTP request handlers
│   ├── health.ts      # Health check controller
│   └── index.ts       # Base controller
├── middleware/        # Express middleware
│   ├── index.ts
│   ├── requestLogger.ts
│   └── validation.ts
├── models/            # Data models
│   └── index.ts
├── repositories/      # Data access layer
│   └── index.ts
├── routes/            # Route definitions
│   ├── health.ts      # Health routes
│   └── index.ts
├── services/          # Business logic
│   ├── cache.ts       # Cache service
│   └── index.ts       # Base service
├── tools/             # External tools/APIs
│   └── index.ts
├── types/             # TypeScript definitions
│   └── index.ts
├── utils/             # Utility functions
│   ├── index.ts
│   └── logger.ts      # Logging utilities
└── index.ts           # Application entry point
```

### Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Directories**: kebab-case (`user-management/`)
- **Classes**: PascalCase (`UserService`)
- **Interfaces**: PascalCase with `I` prefix (`IUserService`)
- **Functions**: camelCase (`getUserById`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Enums**: PascalCase (`UserStatus`)

## Coding Standards

### TypeScript

- Use **strict mode** with comprehensive type checking
- Prefer **interfaces** over types for object shapes
- Use **type assertions** sparingly, prefer type guards
- Always specify **return types** for public methods
- Use **generic constraints** where appropriate

```typescript
// Good
interface UserService {
  findById(id: string): Promise<User | null>;
  create(userData: CreateUserDTO): Promise<User>;
}

// Bad
interface UserService {
  findById(id: any): any;
  create(userData: any): any;
}
```

### ESLint Configuration

The project uses Airbnb TypeScript configuration with additional rules:

```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "airbnb-typescript/base",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/explicit-return-type": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

### Code Style

- **Line length**: 100 characters maximum
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Always required
- **Trailing commas**: Always include

### JSDoc Standards

Document all public APIs with comprehensive JSDoc:

```typescript
/**
 * Retrieves user data by ID with caching support.
 * 
 * @param userId - Unique identifier for the user
 * @param options - Additional query options
 * @param options.includeDeleted - Whether to include soft-deleted users
 * @param options.useCache - Whether to use cached data
 * @returns Promise resolving to user data or null if not found
 * 
 * @throws {ValidationError} When userId is invalid
 * @throws {DatabaseError} When database query fails
 * 
 * @example
 * ```typescript
 * const user = await userService.findById('123', { useCache: true });
 * if (user) {
 *   console.log('Found user:', user.email);
 * }
 * ```
 * 
 * @since 1.0.0
 */
async findById(
  userId: string,
  options: FindUserOptions = {}
): Promise<User | null> {
  // Implementation
}
```

## Development Workflow

### Available Scripts

```bash
# Development
npm run dev          # Start with hot reload
npm run build        # Build for production
npm run start        # Start production build

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run type-check   # TypeScript compilation check
npm run format       # Format code with Prettier

# Testing
npm test             # Run all tests
npm run test:unit    # Run unit tests
npm run test:integration # Run integration tests
npm run test:e2e     # Run end-to-end tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Generate coverage report

# Database
npm run db:migrate   # Run database migrations (planned)
npm run db:seed      # Seed database (planned)
npm run db:reset     # Reset database (planned)

# Utilities
npm run clean        # Clean build artifacts
npm run docs         # Generate documentation
npm run analyze      # Bundle analysis
```

### Git Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/content-discovery
   ```

2. **Make changes with conventional commits**
   ```bash
   git add .
   git commit -m "feat: add content discovery service"
   ```

3. **Run quality checks**
   ```bash
   npm run lint
   npm run type-check
   npm test
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/content-discovery
   # Create pull request via GitHub UI
   ```

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding or modifying tests
- `chore`: Maintenance tasks

**Examples**:
```bash
feat: add Redis caching adapter
fix(health): resolve memory leak in health checks
docs: update API documentation
test: add integration tests for cache service
```

## Testing

### Testing Strategy

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test service interactions
- **E2E Tests**: Test complete workflows
- **Contract Tests**: Test API contracts

### Test Organization

```
tests/
├── unit/              # Unit tests
│   ├── services/
│   ├── utils/
│   └── controllers/
├── integration/       # Integration tests
│   ├── api/
│   └── services/
├── e2e/              # End-to-end tests
│   └── workflows/
├── fixtures/         # Test data
└── helpers/          # Test utilities
```

### Writing Tests

#### Unit Test Example

```typescript
// tests/unit/services/cache.test.ts
import { CacheService } from '@services/cache';
import { createTestContainer } from '@tests/helpers/container';

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockRedisAdapter: jest.Mocked<ICacheAdapter>;

  beforeEach(() => {
    const container = createTestContainer();
    mockRedisAdapter = container.resolve(TOKENS.REDIS_ADAPTER);
    cacheService = container.resolve(TOKENS.CACHE_SERVICE);
  });

  describe('get', () => {
    it('should return cached value when key exists', async () => {
      mockRedisAdapter.get.mockResolvedValue('cached-value');

      const result = await cacheService.get('test-key');

      expect(result).toBe('cached-value');
      expect(mockRedisAdapter.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key does not exist', async () => {
      mockRedisAdapter.get.mockResolvedValue(null);

      const result = await cacheService.get('non-existent-key');

      expect(result).toBeNull();
    });
  });
});
```

#### Integration Test Example

```typescript
// tests/integration/health.test.ts
import request from 'supertest';
import { app } from '@/index';

describe('Health Endpoints', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
          version: '1.0.0',
        },
      });
    });
  });
});
```

### Test Utilities

Create reusable test utilities:

```typescript
// tests/helpers/container.ts
export function createTestContainer(): Container {
  const container = new Container();
  
  // Register test doubles
  container.registerInstance(TOKENS.LOGGER, createTestLogger());
  container.registerInstance(TOKENS.CONFIG, createTestConfig());
  container.registerInstance(TOKENS.REDIS_ADAPTER, createMockRedisAdapter());
  
  return container;
}

// tests/helpers/fixtures.ts
export const userFixtures = {
  validUser: {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  },
  invalidUser: {
    id: '',
    email: 'invalid-email',
  },
};
```

## Debugging

### Development Debugging

#### VS Code Debugger

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug API",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

#### Console Debugging

```typescript
// Use structured logging instead of console.log
logger.debug('Processing content', {
  contentId,
  tags,
  processingTime: Date.now() - startTime,
});

// Use debugger statement for breakpoints
debugger; // Will pause execution when debugging
```

### Production Debugging

#### Log Analysis

```bash
# View application logs
npm run logs

# Filter by level
npm run logs -- --level error

# Follow logs in real-time
npm run logs -- --follow
```

#### Health Check Debugging

```bash
# Check detailed health status
curl http://localhost:3000/health/detailed | jq

# Monitor health continuously
watch -n 5 'curl -s http://localhost:3000/health | jq .data.status'
```

## Performance

### Monitoring

#### Performance Metrics

Key metrics to monitor:
- Response time (p50, p95, p99)
- Memory usage
- CPU utilization
- Cache hit rate
- Database query time

#### Profiling

```typescript
// Profile async operations
const startTime = process.hrtime.bigint();
await operation();
const endTime = process.hrtime.bigint();
const duration = Number(endTime - startTime) / 1_000_000; // Convert to ms

logger.info('Operation completed', {
  operation: 'contentAnalysis',
  duration,
  contentId,
});
```

### Optimization

#### Caching Strategy

```typescript
// Implement cache-aside pattern
async getContent(id: string): Promise<Content | null> {
  // Try cache first
  const cached = await this.cache.get<Content>(`content:${id}`);
  if (cached) {
    return cached;
  }

  // Fetch from database
  const content = await this.repository.findById(id);
  if (content) {
    // Cache for future requests
    await this.cache.set(`content:${id}`, content, 3600); // 1 hour TTL
  }

  return content;
}
```

#### Database Optimization

```typescript
// Use connection pooling
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Implement query optimization
async findContentByTags(tags: string[]): Promise<Content[]> {
  // Use indexed queries
  const query = `
    SELECT c.* FROM content c
    JOIN content_tags ct ON c.id = ct.content_id
    WHERE ct.tag = ANY($1)
    ORDER BY c.created_at DESC
    LIMIT 100
  `;
  
  return this.db.query(query, [tags]);
}
```

## Security

### Best Practices

#### Input Validation

```typescript
import Joi from 'joi';

const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(1).max(100).required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
});

export function validateCreateUser(data: unknown): CreateUserDTO {
  const { error, value } = createUserSchema.validate(data);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }
  return value;
}
```

#### SQL Injection Prevention

```typescript
// Good: Parameterized queries
const result = await this.db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// Bad: String concatenation
const result = await this.db.query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

#### Secrets Management

```typescript
// Never commit secrets to code
const apiKey = process.env.API_KEY; // ✓ Good

// Use secure defaults
const jwtSecret = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'dev-secret-not-for-production';
})();
```

### Security Headers

```typescript
// Implemented in src/index.ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

## Contributing

### Code Review Checklist

- [ ] Code follows project conventions
- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Error handling implemented
- [ ] Logging added for debugging

### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
```

### Release Process

1. **Version Bump**
   ```bash
   npm version patch # or minor/major
   ```

2. **Generate Changelog**
   ```bash
   npm run changelog
   ```

3. **Create Release PR**
   ```bash
   git checkout -b release/v1.1.0
   git push origin release/v1.1.0
   ```

4. **Deploy to Staging**
   ```bash
   npm run deploy:staging
   ```

5. **Deploy to Production**
   ```bash
   npm run deploy:production
   ```

## Troubleshooting

### Common Issues

#### Redis Connection Errors
```bash
# Check Redis status
redis-cli ping

# View Redis logs
redis-cli monitor

# Restart Redis
brew services restart redis
```

#### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

#### Module Resolution Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear TypeScript cache
npx tsc --build --clean
```

### Getting Help

- **Documentation**: Check docs/ directory
- **Issues**: Create GitHub issue with reproduction steps
- **Discussions**: Use GitHub Discussions for questions
- **Team Chat**: Internal team communication channels

This development guide provides the foundation for productive development on the AI Content Curator Agent project.