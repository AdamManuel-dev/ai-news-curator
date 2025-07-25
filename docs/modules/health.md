# Health Module

## Overview

The Health Module provides comprehensive health monitoring capabilities for the AI Content Curator Agent. It includes dependency checking, system metrics collection, and health status reporting through REST endpoints.

## Purpose

- **System Monitoring**: Track application and dependency health
- **Operational Visibility**: Provide insights into system performance
- **Alerting**: Enable proactive monitoring and alerting
- **Debugging**: Assist with troubleshooting and diagnostics

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Health Routes  │───▶│ Health Controller│───▶│  Health Checks  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                        ┌─────────────────┐    ┌─────────────────┐
                        │    Response     │    │  Dependencies   │
                        │   Formatter     │    │   (Redis, etc)  │
                        └─────────────────┘    └─────────────────┘
```

## Components

### HealthController

The main controller responsible for handling health check requests and orchestrating health checks across different system components.

**Location**: `src/controllers/health.ts`

**Key Methods**:
- `getHealthStatus()`: Basic health check with essential metrics
- `getDetailedHealthStatus()`: Comprehensive health check with extended diagnostics

### Health Routes

Express routes that expose health endpoints to external consumers.

**Location**: `src/routes/health.ts`

**Endpoints**:
- `GET /health`: Basic health check
- `GET /health/detailed`: Detailed health check

### Health Status Types

TypeScript interfaces defining the structure of health check responses.

```typescript
interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  dependencies: DependencyStatus;
  checks: HealthCheck[];
}
```

## Dependencies Monitored

### Redis Cache

**Check Type**: Connectivity and performance
**Metrics**:
- Connection status (connected/disconnected/error)
- Response latency in milliseconds
- Error details if connection fails

**Implementation**:
```typescript
private async checkRedisHealth(): Promise<{
  redis: HealthStatus['dependencies']['redis'];
  check: HealthStatus['checks'][0];
}> {
  const startTime = Date.now();
  
  try {
    // Perform Redis ping operation
    const testKey = 'health:check:' + Date.now();
    const testValue = 'ok';
    
    await this.redisAdapter.set(testKey, testValue, 5);
    const retrievedValue = await this.redisAdapter.get<string>(testKey);
    await this.redisAdapter.delete(testKey);
    
    const latency = Date.now() - startTime;
    
    return {
      redis: { status: 'connected', latency },
      check: {
        name: 'redis',
        status: 'pass',
        details: `Connected with ${latency}ms latency`,
        responseTime: latency,
      },
    };
  } catch (error) {
    // Handle connection errors
    return {
      redis: { status: 'error', error: error.message },
      check: {
        name: 'redis',
        status: 'fail',
        details: `Connection failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      },
    };
  }
}
```

### Memory Usage

**Check Type**: System resource monitoring
**Metrics**:
- Used memory in bytes
- Free memory in bytes
- Total memory in bytes
- Memory usage percentage

**Thresholds**:
- **Warning**: 80% memory usage
- **Critical**: 95% memory usage

**Implementation**:
```typescript
private getMemoryInfo(): HealthStatus['dependencies']['memory'] {
  const memoryUsage = process.memoryUsage();
  const totalMemory = memoryUsage.heapTotal;
  const usedMemory = memoryUsage.heapUsed;
  const freeMemory = totalMemory - usedMemory;

  return {
    used: usedMemory,
    free: freeMemory,
    total: totalMemory,
    percentage: Math.round((usedMemory / totalMemory) * 100),
  };
}
```

### Disk Usage (Planned)

**Check Type**: Storage resource monitoring
**Metrics**:
- Used disk space
- Free disk space
- Disk usage percentage

*Note: Currently returns null, planned for future implementation.*

## Health Status Determination

The overall system health is determined by evaluating all individual health checks:

```typescript
private determineOverallStatus(checks: HealthStatus['checks']): HealthStatus['status'] {
  const hasFailures = checks.some(check => check.status === 'fail');
  const hasWarnings = checks.some(check => check.status === 'warn');

  if (hasFailures) {
    return 'unhealthy';
  } else if (hasWarnings) {
    return 'degraded';
  } else {
    return 'healthy';
  }
}
```

**Status Levels**:
- **healthy**: All checks pass
- **degraded**: Some checks have warnings but system is operational
- **unhealthy**: One or more checks fail, system may be impaired

## HTTP Status Codes

The health endpoints return appropriate HTTP status codes based on system health:

```typescript
private getHttpStatusCode(status: HealthStatus['status']): number {
  switch (status) {
    case 'healthy':
      return 200; // OK
    case 'degraded':
      return 200; // OK - still operational
    case 'unhealthy':
      return 503; // Service Unavailable
    default:
      return 500; // Internal Server Error
  }
}
```

## Usage Examples

### Basic Health Check

```bash
# Check basic system health
curl -X GET http://localhost:3000/health

# Response
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "environment": "production",
    "uptime": 3600,
    "timestamp": "2025-01-15T10:30:00.000Z",
    "dependencies": {
      "redis": {
        "status": "connected",
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
        "status": "pass",
        "details": "Connected with 2ms latency",
        "responseTime": 2
      },
      {
        "name": "memory",
        "status": "pass",
        "details": "Normal memory usage: 64%"
      }
    ]
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Detailed Health Check

```bash
# Check detailed system health
curl -X GET http://localhost:3000/health/detailed

# Response includes all basic health data plus:
# - Additional system metrics
# - Extended dependency information
# - Performance benchmarks
```

### Programmatic Health Checks

```typescript
import { HealthController } from '@controllers/health';
import { container, HEALTH_CONTROLLER } from '@container/index';

// Get health controller from DI container
const healthController = container.resolve<HealthController>(HEALTH_CONTROLLER);

// Perform health check programmatically
const healthStatus = await healthController.performHealthChecks();

if (healthStatus.status === 'unhealthy') {
  console.error('System is unhealthy:', healthStatus.checks);
  // Take corrective action
}
```

## Monitoring Integration

### Prometheus Metrics (Planned)

The health module will expose Prometheus metrics for integration with monitoring systems:

```
# HELP app_health_status Current health status (0=unhealthy, 1=degraded, 2=healthy)
# TYPE app_health_status gauge
app_health_status{environment="production"} 2

# HELP app_dependency_status Dependency health status
# TYPE app_dependency_status gauge
app_dependency_status{dependency="redis",environment="production"} 1

# HELP app_dependency_response_time Dependency response time in milliseconds
# TYPE app_dependency_response_time histogram
app_dependency_response_time{dependency="redis"} 2.5
```

### Alerting Rules

Example alerting rules for integration with monitoring systems:

```yaml
# Prometheus alerting rules
groups:
  - name: health.rules
    rules:
      - alert: SystemUnhealthy
        expr: app_health_status < 2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "System health is degraded or unhealthy"
          
      - alert: RedisDown
        expr: app_dependency_status{dependency="redis"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis dependency is down"
          
      - alert: HighMemoryUsage
        expr: app_memory_usage_percent > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage detected"
```

## Configuration

Health check behavior can be configured through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `HEALTH_CHECK_TIMEOUT` | Timeout for health checks in ms | 5000 |
| `HEALTH_REDIS_TIMEOUT` | Redis-specific timeout in ms | 2000 |
| `HEALTH_MEMORY_WARNING_THRESHOLD` | Memory warning threshold % | 80 |
| `HEALTH_MEMORY_CRITICAL_THRESHOLD` | Memory critical threshold % | 95 |

## Error Handling

The health module implements comprehensive error handling:

### Connection Errors
- Redis connection timeouts
- Network connectivity issues
- Authentication failures

### Resource Errors
- Memory allocation failures
- Disk space exhaustion
- CPU throttling

### Configuration Errors
- Invalid configuration values
- Missing required parameters
- Environment setup issues

All errors are logged with appropriate context and included in health check responses for debugging.

## Testing

### Unit Tests

```typescript
describe('HealthController', () => {
  describe('Redis Health Check', () => {
    it('should report healthy status when Redis is connected', async () => {
      // Mock Redis adapter to return successful connection
      const result = await healthController.checkRedisHealth();
      expect(result.check.status).toBe('pass');
    });

    it('should report failed status when Redis is disconnected', async () => {
      // Mock Redis adapter to throw connection error
      const result = await healthController.checkRedisHealth();
      expect(result.check.status).toBe('fail');
    });
  });
});
```

### Integration Tests

```typescript
describe('Health Endpoints', () => {
  it('should return 200 for healthy system', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.data.status).toBe('healthy');
  });

  it('should return 503 for unhealthy system', async () => {
    // Simulate Redis failure
    await request(app)
      .get('/health')
      .expect(503);
  });
});
```

## Performance Considerations

### Response Time Optimization
- Health checks are designed to complete within 5 seconds
- Parallel execution of independent checks
- Caching of expensive operations

### Resource Usage
- Minimal memory footprint
- Non-blocking I/O operations
- Graceful degradation under load

## Security Considerations

### Information Disclosure
- Health endpoints don't expose sensitive system information
- Error messages are sanitized to prevent information leakage
- Optional authentication for detailed health endpoints

### Access Control
- Basic health endpoint is publicly accessible
- Detailed health endpoint can be restricted to authorized users
- Rate limiting to prevent abuse

## Future Enhancements

### Planned Features
1. **Custom Health Checks**: Plugin system for custom health checks
2. **Health History**: Historical health data storage and trending
3. **Webhook Notifications**: Real-time health status notifications
4. **Circuit Breaker**: Automatic failover for unhealthy dependencies
5. **Performance Benchmarks**: Automated performance regression detection

### Integration Roadmap
- **Q1**: Prometheus metrics integration
- **Q2**: Custom health check plugins
- **Q3**: Historical health data and dashboards
- **Q4**: Advanced alerting and automation

The Health Module provides a robust foundation for system monitoring and operational visibility, enabling proactive maintenance and reliable service delivery.