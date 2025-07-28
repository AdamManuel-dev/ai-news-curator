# Development Guide

## Getting Started

This guide covers setting up the AI News Curator development environment, development workflows, testing practices, and contribution guidelines.

## Prerequisites

### Required Software

- **Node.js**: Version 18.x or higher
- **PostgreSQL**: Version 12.x or higher
- **Redis**: Version 6.x or higher
- **Git**: Version 2.x or higher

### Optional Tools

- **Docker**: For containerized development
- **Docker Compose**: For local service orchestration
- **VS Code**: Recommended IDE with TypeScript support

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/ai-news-curator.git
cd ai-news-curator
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create environment files for different environments:

**`.env.development`:**
```bash
# Server Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/ai_curator_dev
DB_POOL_SIZE=10

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_CACHE_TTL=3600

# Authentication
JWT_SECRET=your-development-jwt-secret-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# API Keys
API_KEY_ROTATION_DAYS=90
API_KEY_DEFAULT_RATE_LIMIT=1000

# External Services
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=us-west1-gcp
PINECONE_INDEX_NAME=ai-content-dev

# Monitoring
ENABLE_DEBUG_LOGGING=true
ENABLE_METRICS=true
PROMETHEUS_PORT=9090

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=http://localhost:3000
```

**`.env.test`:**
```bash
NODE_ENV=test
DATABASE_URL=postgresql://username:password@localhost:5432/ai_curator_test
REDIS_URL=redis://localhost:6379/1
JWT_SECRET=test-jwt-secret
LOG_LEVEL=error
```

### 4. Database Setup

```bash
# Create databases
createdb ai_curator_dev
createdb ai_curator_test

# Run migrations
npm run migrate:up

# Seed development data
npm run seed
```

### 5. Start Development Services

**Option A: Local Services**
```bash
# Start PostgreSQL
sudo systemctl start postgresql

# Start Redis
sudo systemctl start redis

# Start application
npm run dev
```

**Option B: Docker Compose**
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app
```

## Development Workflow

### Project Structure

```
src/
├── adapters/           # External service adapters
├── config/             # Configuration management
├── container/          # Dependency injection
├── controllers/        # HTTP request handlers
├── database/           # Database connections, migrations, repositories
├── middleware/         # Express middleware
├── models/             # Data models and types
├── routes/             # API route definitions
├── services/           # Business logic services
├── tools/              # Utility tools (web scraper, etc.)
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── validation/         # Input validation schemas
```

### Code Style

The project uses ESLint and Prettier for consistent code formatting:

```bash
# Check code style
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Format code
npm run format
```

**Key Style Guidelines:**
- Use TypeScript strict mode
- Prefer explicit return types for functions
- Use meaningful variable and function names
- Follow single responsibility principle
- Add JSDoc comments for public APIs

### Git Workflow

**Branch Naming Convention:**
```
feature/description-of-feature
bugfix/description-of-bug
hotfix/critical-issue-description
```

**Commit Message Format:**
```
type(scope): brief description

Detailed explanation of changes made.

Fixes #123
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tool changes

### Development Commands

```bash
# Development server with hot reload
npm run dev

# Debug mode with inspector
npm run dev:debug

# Build for production
npm run build

# Type checking
npm run typecheck

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test coverage
npm run test:coverage

# Database migrations
npm run migrate:up
npm run migrate:down
npm run migrate:status

# Database seeding
npm run seed
npm run seed:clear
```

## Testing Strategy

### Test Structure

```
tests/
├── unit/               # Unit tests for individual components
├── integration/        # Integration tests for service interactions
├── e2e/               # End-to-end tests for complete workflows
└── setup.ts           # Test configuration and setup
```

### Unit Testing

Unit tests focus on individual functions and classes:

```typescript
// Example: Service unit test
describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let mockDb: jest.Mocked<DatabaseConnection>;

  beforeEach(() => {
    mockDb = createMockDatabase();
    service = new ApiKeyService(mockDb);
  });

  describe('createApiKey', () => {
    it('should generate secure API key', async () => {
      const params = {
        name: 'Test Key',
        userId: 'user-123',
        permissions: ['content:read']
      };

      const result = await service.createApiKey(params);

      expect(result.rawKey).toMatch(/^aic_[a-f0-9]{64}$/);
      expect(result.apiKey.name).toBe('Test Key');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.any(Array)
      );
    });

    it('should validate required parameters', async () => {
      await expect(
        service.createApiKey({ name: '', userId: '', permissions: [] })
      ).rejects.toThrow('Name is required');
    });
  });
});
```

### Integration Testing

Integration tests verify service interactions:

```typescript
// Example: API integration test
describe('API Key Management', () => {
  let app: Express;
  let authToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    authToken = await getTestAuthToken();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('POST /api-keys', () => {
    it('should create API key with valid token', async () => {
      const response = await request(app)
        .post('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Integration Test Key',
          permissions: ['content:read']
        })
        .expect(201);

      expect(response.body.apiKey.name).toBe('Integration Test Key');
      expect(response.body.rawKey).toMatch(/^aic_/);
    });

    it('should reject unauthorized requests', async () => {
      await request(app)
        .post('/api-keys')
        .send({ name: 'Test Key' })
        .expect(401);
    });
  });
});
```

### End-to-End Testing

E2E tests verify complete user workflows:

```typescript
// Example: E2E content workflow
describe('Content Management Workflow', () => {
  it('should complete full content lifecycle', async () => {
    // 1. Create user and get auth token
    const user = await createTestUser();
    const token = await authenticateUser(user);

    // 2. Create content
    const content = await createContent(token, {
      title: 'Test Article',
      content: 'Article content...'
    });

    // 3. Retrieve content
    const retrieved = await getContent(token, content.id);
    expect(retrieved.title).toBe('Test Article');

    // 4. Update content
    await updateContent(token, content.id, {
      title: 'Updated Article'
    });

    // 5. Delete content
    await deleteContent(token, content.id);

    // 6. Verify deletion
    await expect(getContent(token, content.id)).rejects.toThrow();
  });
});
```

### Test Data Management

```typescript
// Test utilities
export async function createTestUser(overrides = {}) {
  return await userRepository.create({
    email: 'test@example.com',
    password: 'hashedPassword',
    role: 'user',
    ...overrides
  });
}

export async function getTestAuthToken(user?: User) {
  const testUser = user || await createTestUser();
  return jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET);
}

export async function cleanupTestData() {
  await db.query('DELETE FROM api_keys WHERE name LIKE \'%Test%\'');
  await db.query('DELETE FROM users WHERE email LIKE \'%test%\'');
}
```

## Debugging

### VS Code Configuration

**`.vscode/launch.json`:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "env": {
        "NODE_ENV": "development"
      },
      "runtimeArgs": ["-r", "ts-node/register"],
      "sourceMaps": true,
      "envFile": "${workspaceFolder}/.env.development"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "env": {
        "NODE_ENV": "test"
      },
      "envFile": "${workspaceFolder}/.env.test"
    }
  ]
}
```

### Logging

Use structured logging for debugging:

```typescript
// Debug logging examples
logger.debug('User authentication attempt', {
  userId: user.id,
  method: 'JWT',
  timestamp: new Date().toISOString()
});

logger.info('API key created', {
  keyId: apiKey.id,
  userId: apiKey.userId,
  permissions: apiKey.permissions.length
});

logger.error('Database query failed', {
  query: 'SELECT * FROM users',
  error: error.message,
  stack: error.stack
});
```

### Performance Profiling

```typescript
// Performance measurement
const startTime = Date.now();
const result = await expensiveOperation();
const duration = Date.now() - startTime;

logger.info('Operation completed', {
  operation: 'expensiveOperation',
  duration,
  resultSize: result.length
});
```

## Code Quality

### Type Safety

Leverage TypeScript for type safety:

```typescript
// Define strict interfaces
interface CreateUserRequest {
  email: string;
  password: string;
  role: UserRole;
}

// Use generic types
class Repository<T extends BaseEntity> {
  async findById(id: string): Promise<T | null> {
    // Implementation
  }
}

// Strict function signatures
async function createUser(data: CreateUserRequest): Promise<User> {
  // Implementation
}
```

### Error Handling

Implement consistent error handling:

```typescript
// Custom error classes
export class ValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Error handling middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  if (error instanceof ValidationError) {
    return res.status(400).json({
      error: 'Validation failed',
      field: error.field,
      message: error.message
    });
  }

  res.status(500).json({ error: 'Internal server error' });
};
```

### Documentation

Maintain comprehensive documentation:

```typescript
/**
 * Creates a new API key for service authentication.
 * 
 * @param params - API key creation parameters
 * @param params.name - Descriptive name for the key
 * @param params.userId - ID of the user creating the key
 * @param params.permissions - Array of permissions to grant
 * @param params.rateLimit - Optional rate limit (requests per hour)
 * @param params.expiresAt - Optional expiration date
 * 
 * @returns Promise resolving to created API key and raw key
 * 
 * @throws {ValidationError} When required parameters are missing
 * @throws {DatabaseError} When database operation fails
 * 
 * @example
 * ```typescript
 * const { apiKey, rawKey } = await createApiKey({
 *   name: 'Content Service',
 *   userId: 'user-123',
 *   permissions: ['content:read', 'content:create'],
 *   rateLimit: 5000
 * });
 * ```
 */
async function createApiKey(params: CreateApiKeyParams): Promise<CreateApiKeyResult> {
  // Implementation
}
```

## Performance Guidelines

### Database Optimization

```typescript
// Use connection pooling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Optimize queries
async function getUsersWithContent() {
  // Use joins instead of N+1 queries
  return await db.query(`
    SELECT u.*, c.title, c.created_at as content_created
    FROM users u
    LEFT JOIN content c ON u.id = c.author_id
    WHERE u.is_active = true
    ORDER BY c.created_at DESC
  `);
}

// Use prepared statements
const getUserById = db.prepare('SELECT * FROM users WHERE id = $1');
```

### Caching Strategy

```typescript
// Implement caching layers
async function getUser(id: string): Promise<User> {
  // Check L1 cache (memory)
  const cached = memoryCache.get(`user:${id}`);
  if (cached) return cached;

  // Check L2 cache (Redis)
  const redisCached = await redis.get(`user:${id}`);
  if (redisCached) {
    const user = JSON.parse(redisCached);
    memoryCache.set(`user:${id}`, user, 300); // 5 minutes
    return user;
  }

  // Fetch from database
  const user = await userRepository.findById(id);
  if (user) {
    await redis.setex(`user:${id}`, 3600, JSON.stringify(user)); // 1 hour
    memoryCache.set(`user:${id}`, user, 300);
  }

  return user;
}
```

### Memory Management

```typescript
// Use streams for large data processing
const processLargeDataset = async () => {
  const stream = fs.createReadStream('large-file.json');
  const parser = stream.pipe(new JSONParser());
  
  for await (const item of parser) {
    await processItem(item);
    // Process one item at a time to avoid memory issues
  }
};

// Clean up resources
class ResourceManager {
  private resources: Array<{ close(): void }> = [];

  register(resource: { close(): void }) {
    this.resources.push(resource);
  }

  async cleanup() {
    await Promise.all(
      this.resources.map(resource => resource.close())
    );
    this.resources = [];
  }
}
```

## Deployment

### Build Process

```bash
# Production build
npm run build

# Check build output
ls -la dist/

# Test production build locally
NODE_ENV=production node dist/index.js
```

### Environment Variables

Production environment variables should be securely managed:

```bash
# Use environment variable injection
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
JWT_SECRET=${JWT_SECRET}

# Validate required variables
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is required"
  exit 1
fi
```

### Health Checks

Implement comprehensive health checks:

```typescript
// Health check endpoint
app.get('/health', async (req, res) => {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkExternalServices()
  ]);

  const allHealthy = checks.every(
    check => check.status === 'fulfilled' && check.value.healthy
  );

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks: checks.map((check, index) => ({
      name: ['database', 'redis', 'external'][index],
      status: check.status === 'fulfilled' ? 'pass' : 'fail',
      details: check.status === 'fulfilled' ? check.value : check.reason
    }))
  });
});
```

## Troubleshooting

### Common Issues

**Database Connection Issues:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection parameters
psql -h localhost -p 5432 -U username -d ai_curator_dev

# Reset database
npm run migrate:down && npm run migrate:up
```

**Redis Connection Issues:**
```bash
# Check Redis status
redis-cli ping

# Clear Redis cache
redis-cli flushdb

# Check Redis configuration
redis-cli config get "*"
```

**Build Issues:**
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear TypeScript cache
npx tsc --build --clean

# Check TypeScript configuration
npx tsc --showConfig
```

### Debug Checkers

```typescript
// Environment validation
const requiredEnvVars = [
  'NODE_ENV',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    throw new Error(`Required environment variable ${varName} is not set`);
  }
});

// Service health validation
async function validateServices() {
  try {
    await db.query('SELECT 1');
    logger.info('Database connection: OK');
  } catch (error) {
    logger.error('Database connection: FAILED', { error });
    throw error;
  }

  try {
    await redis.ping();
    logger.info('Redis connection: OK');
  } catch (error) {
    logger.error('Redis connection: FAILED', { error });
    throw error;
  }
}
```

## Contributing

### Code Review Guidelines

- **Functionality**: Does the code work as intended?
- **Tests**: Are there sufficient tests with good coverage?
- **Performance**: Are there any performance concerns?
- **Security**: Are there any security vulnerabilities?
- **Documentation**: Is the code well-documented?
- **Style**: Does the code follow project conventions?

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with tests
3. Run full test suite
4. Update documentation if needed
5. Submit pull request with description
6. Address review feedback
7. Merge after approval

### Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release branch
4. Run full test suite
5. Create release tag
6. Deploy to staging
7. Deploy to production
8. Monitor deployment