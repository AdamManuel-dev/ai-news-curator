# Docker Development Environment

This directory contains Docker configuration files for the AI News Curator development environment.

## Quick Start

```bash
# Start all core services (app, postgres, redis)
docker-compose up -d

# Start with monitoring tools
docker-compose --profile monitoring up -d

# Start with database/cache management tools
docker-compose --profile tools up -d

# Start everything
docker-compose --profile monitoring --profile tools up -d

# View logs
docker-compose logs -f app

# Stop all services
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v
```

## Services

### Core Services
- **app**: Main Node.js application (port 3000)
- **postgres**: PostgreSQL database (port 5432)
- **redis**: Redis cache (port 6379)

### Management Tools (profile: tools)
- **pgadmin**: PostgreSQL management UI (port 5050)
  - Email: admin@localhost.com
  - Password: admin
- **redis-commander**: Redis management UI (port 8081)

### Monitoring Stack (profile: monitoring)
- **prometheus**: Metrics collection (port 9090)
- **grafana**: Monitoring dashboards (port 3001)
  - Username: admin
  - Password: admin
- **node-exporter**: System metrics
- **postgres-exporter**: PostgreSQL metrics
- **redis-exporter**: Redis metrics

## Development Workflow

1. **Start core services**:
   ```bash
   docker-compose up -d
   ```

2. **Check service health**:
   ```bash
   docker-compose ps
   docker-compose logs app
   ```

3. **Access the application**:
   - API: http://localhost:3000
   - Health check: http://localhost:3000/health

4. **Database management**:
   ```bash
   # Connect to PostgreSQL
   docker-compose exec postgres psql -U postgres -d ai_news_curator
   
   # Run migrations
   docker-compose exec app npm run db:migrate
   ```

5. **Redis management**:
   ```bash
   # Connect to Redis CLI
   docker-compose exec redis redis-cli
   ```

## Debugging

The application runs with Node.js debugging enabled on port 9229. You can attach your IDE debugger to this port.

### VS Code Debug Configuration
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "attach",
  "name": "Docker: Attach to Node",
  "remoteRoot": "/app",
  "localRoot": "${workspaceFolder}",
  "port": 9229,
  "restart": true
}
```

## Environment Variables

The Docker Compose file uses default development values. For production or custom configuration, create a `.env` file in the project root based on `.env.example`.

## Volumes

- `postgres_data`: PostgreSQL data persistence
- `redis_data`: Redis data persistence
- `prometheus_data`: Prometheus metrics storage
- `grafana_data`: Grafana dashboards and settings

## Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose logs [service-name]

# Rebuild containers
docker-compose build --no-cache

# Fresh start
docker-compose down -v
docker-compose up -d
```

### Port conflicts
If you have conflicts with default ports, modify the port mappings in `docker-compose.yml`.

### Database connection issues
Ensure the database is healthy before the app starts:
```bash
docker-compose ps
# Look for (healthy) status on postgres service
```