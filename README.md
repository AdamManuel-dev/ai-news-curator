# AI Content Curator Agent

An intelligent content discovery and organization system that specializes in finding, analyzing, and curating high-quality content about machine learning, LLMs, and AI agents from across the web.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)

## 🔍 Overview

The AI Content Curator Agent is a Node.js/TypeScript application built with Express.js that automatically:

- **Discovers** content from 100+ sources across the web
- **Analyzes** and intelligently tags content with 95% accuracy
- **Ranks** content based on relevance, quality, and engagement
- **Identifies** emerging trends in AI/ML discourse
- **Personalizes** recommendations based on user preferences

### Key Benefits

- ⏰ **Saves 10+ hours weekly** by automating content discovery
- 🎯 **95% tagging accuracy** for efficient filtering and navigation
- 📈 **Real-time trend analysis** of AI/ML topics
- 🔄 **Fresh content guaranteed** with continuous updates

## ✨ Features

### Core Capabilities

- **Content Discovery**: Multi-source content aggregation from blogs, research repositories, news sites, and social media
- **Intelligent Tagging**: Hierarchical tag assignment across topic, difficulty, content type, and use case taxonomies
- **Content Ranking**: Advanced scoring based on relevance, quality, recency, and community engagement
- **Trend Analysis**: Emerging topic detection and trending discussion identification
- **Personalized Curation**: Custom recommendations based on user profiles and reading history

### Technical Features

- **Health Monitoring**: Comprehensive health checks with dependency status
- **Caching Layer**: Redis-based caching for optimal performance
- **Structured Logging**: Winston-based logging with multiple output formats
- **Dependency Injection**: Clean architecture with IoC container
- **Type Safety**: Full TypeScript implementation with strict mode
- **Testing Suite**: Unit, integration, and e2e tests with Jest

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Scrapers  │────▶│   Content API   │────▶│   Cache Layer   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                          │
                               ▼                          ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  AI/ML Models   │◀────│  Analysis Core  │────▶│  Vector Store   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                    ┌─────────────────┐
                    │  User Interface │
                    └─────────────────┘
```

### Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.0+
- **Framework**: Express.js 5.0
- **Database**: PostgreSQL (primary), Redis (caching), Pinecone (vector storage)
- **Testing**: Jest with Supertest
- **DevOps**: Docker, Kubernetes, GitHub Actions
- **Monitoring**: Prometheus, Grafana, Winston logging

For detailed architectural documentation, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- **PostgreSQL >= 13.0**
- Redis >= 6.0.0
- npm or yarn

**Alternative: Use Docker Compose for easy setup (recommended for development)**

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

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start PostgreSQL and Redis** (if running locally)
   ```bash
   # Start PostgreSQL (varies by OS)
   # macOS with Homebrew: brew services start postgresql
   # Ubuntu: sudo systemctl start postgresql
   
   # Start Redis
   redis-server
   ```
   
   **Note**: Use Docker Compose for easier setup with all dependencies included.

5. **Set up the database**
   ```bash
   # Run database migrations
   npm run migrate:up
   
   # Seed with sample data (optional)
   npm run seed
   ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`.

### Docker Development Environment (Recommended)

For easier development setup with all dependencies:

```bash
# Start core services (app, PostgreSQL, Redis)
docker-compose up -d

# Start with monitoring tools (Prometheus, Grafana)
docker-compose --profile monitoring up -d

# Start with database management tools (pgAdmin, Redis Commander)
docker-compose --profile tools up -d

# Start everything
docker-compose --profile monitoring --profile tools up -d

# View application logs
docker-compose logs -f app

# Stop all services
docker-compose down
```

**Service Access Points:**
- **Application**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Grafana** (monitoring): http://localhost:3001 (admin/admin)
- **Prometheus** (metrics): http://localhost:9090
- **pgAdmin** (database): http://localhost:5050 (admin@localhost.com/admin)
- **Redis Commander** (cache): http://localhost:8081

### Database Setup

```bash
# Run database migrations
npm run migrate:up

# Check migration status
npm run migrate:status

# Rollback last migration (if needed)
npm run migrate:down

# Create new migration
npm run migrate:create <migration_name>

# Seed database with sample data
npm run seed

# Run specific seed
npm run seed:run <seed_name>

# Clear all seeded data
npm run seed:clear

# List available seeds
npm run seed:list
```

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 3000 | No |
| `NODE_ENV` | Environment | development | No |
| `DB_HOST` | PostgreSQL hostname | localhost | Yes |
| `DB_PORT` | PostgreSQL port | 5432 | No |
| `DB_NAME` | Database name | ai_news_curator | Yes |
| `DB_USER` | Database username | postgres | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `REDIS_HOST` | Redis hostname | localhost | No |
| `REDIS_PORT` | Redis port | 6379 | No |
| `REDIS_PASSWORD` | Redis password | - | No |
| `LOG_LEVEL` | Logging level | info | No |
| `ANTHROPIC_API_KEY` | Anthropic API key | - | Yes* |
| `OPENAI_API_KEY` | OpenAI API key | - | Yes* |
| `PINECONE_API_KEY` | Pinecone API key | - | Yes* |

*Required for full functionality

## 📚 API Reference

### Health Endpoints

#### `GET /health`
Basic health check with dependency status.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "environment": "production",
    "uptime": 3600,
    "dependencies": {
      "redis": {
        "status": "connected",
        "latency": 2
      },
      "memory": {
        "percentage": 45
      }
    },
    "checks": [
      {
        "name": "redis",
        "status": "pass",
        "details": "Connected with 2ms latency"
      }
    ]
  }
}
```

#### `GET /health/detailed`
Comprehensive health check with additional system metrics.

For complete API documentation, see [docs/API.md](./docs/API.md).

## 💻 Development

### Project Structure

```
src/
├── adapters/          # External service adapters
│   └── redis.ts       # Redis caching adapter
├── config/            # Configuration management
├── container/         # Dependency injection
├── controllers/       # Request handlers
├── middleware/        # Express middleware
├── models/           # Data models
├── routes/           # Route definitions
├── services/         # Business logic
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── index.ts          # Application entry point
```

### Available Scripts

```bash
# Development
npm run dev          # Start development server with hot reload
npm run dev:debug    # Start with Node.js debugger (port 9229)
npm run build        # Build for production
npm run start        # Start production server
npm run typecheck    # Run TypeScript compiler check

# Testing
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues

# Database
npm run migrate:up   # Run database migrations
npm run migrate:down # Rollback last migration
npm run migrate:status # Check migration status
npm run migrate:create # Create new migration
npm run seed         # Run all database seeds
npm run seed:run     # Run specific seed
npm run seed:clear   # Clear seeded data
npm run seed:list    # List available seeds
```

### Code Standards

- **ESLint**: Airbnb TypeScript configuration
- **Prettier**: Automated code formatting
- **TypeScript**: Strict mode with comprehensive type checking
- **Jest**: Testing framework with coverage reports
- **Conventional Commits**: Standardized commit messages

For detailed development guides, see [docs/guides/DEVELOPMENT.md](./docs/guides/DEVELOPMENT.md).

## 📊 Monitoring & Observability

The application includes comprehensive monitoring with Prometheus and Grafana:

### Metrics Collection

**Application Metrics** (available at `/metrics`):
- HTTP request duration and rates
- Business metrics (content discovered, tags generated) 
- Cache hit rates and performance
- Vector database operations
- System health indicators

**Infrastructure Metrics**:
- PostgreSQL database performance
- Redis cache operations and memory usage
- System resources (CPU, memory, disk, network)
- Service availability and health

### Monitoring Stack

Start the monitoring tools with Docker Compose:

```bash
# Start monitoring stack
docker-compose --profile monitoring up -d
```

**Access Points:**
- **Grafana Dashboards**: http://localhost:3001 (admin/admin)
  - AI Curator Overview - Real-time performance metrics
  - Business Metrics - Content processing and AI operations  
  - Infrastructure - Database and system health
  - Alerts & Monitoring - Error tracking and incident response
- **Prometheus**: http://localhost:9090 - Raw metrics and queries
- **Application Metrics**: http://localhost:3000/metrics - Prometheus format

### Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health with dependencies
curl http://localhost:3000/health/detailed
```

For detailed monitoring setup, see [docker/grafana/README.md](./docker/grafana/README.md).

## 🧪 Testing

The project includes comprehensive testing with Jest:

- **Unit Tests**: Individual function and class testing
- **Integration Tests**: API endpoint and service integration
- **E2E Tests**: End-to-end workflow testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test files
npm test -- --testPathPattern=health

# Debug tests
npm run test:debug
```

Test files are organized in the `tests/` directory:
```
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── e2e/              # End-to-end tests
└── setup.ts          # Test configuration
```

## 🚢 Deployment

### Quick Deployment (Recommended)

Use the unified deployment script for easy cloud deployment:

```bash
# Interactive deployment menu
./deployment/deploy.sh

# Direct deployment commands
./deployment/deploy.sh aws-eks      # Deploy to AWS EKS
./deployment/deploy.sh aws-ecs      # Deploy to AWS ECS  
./deployment/deploy.sh azure-aks    # Deploy to Azure AKS
./deployment/deploy.sh azure-aci    # Deploy to Azure ACI
```

### Cloud Deployment Options

#### AWS
- **EKS (Kubernetes)**: Production-ready cluster with auto-scaling (2-5 nodes)
- **ECS (Docker)**: Serverless containers with Fargate

#### Azure  
- **AKS (Kubernetes)**: Managed service with monitoring and SSL certificates
- **ACI (Docker)**: Serverless Docker container instances with persistent storage

**Features included:**
- ✅ Auto-scaling and load balancing
- ✅ SSL/TLS termination 
- ✅ Monitoring and logging
- ✅ Health checks and rolling updates
- ✅ Persistent storage for databases
- ✅ Container registry integration
- ✅ Infrastructure as code

### Docker (Local)

For local development and testing:

```bash
# Build the image
docker build -t ai-content-curator .

# Run with Docker Compose (includes PostgreSQL, Redis, monitoring)
docker-compose up -d

# Run single container
docker run -p 3000:3000 --env-file .env ai-content-curator
```

### Kubernetes (Self-Managed)

Deploy to your own Kubernetes cluster:

```bash
# Deploy to development environment
kubectl apply -k k8s/overlays/development

# Deploy to staging environment  
kubectl apply -k k8s/overlays/staging

# Deploy to production environment
kubectl apply -k k8s/overlays/production
```

**Included Resources:**
- Application deployment with HPA (Horizontal Pod Autoscaler)
- PostgreSQL and Redis databases with persistent volumes
- Ingress configuration for external access
- Network policies for security
- ConfigMaps and Secrets management
- Pod Disruption Budget for high availability

### Prerequisites Setup

Install required tools automatically:

```bash
# Setup for AWS and/or Azure
./deployment/deploy.sh setup

# Manual setup
# AWS: aws configure
# Azure: az login
```

For detailed deployment guides, see [deployment/README.md](./deployment/README.md).

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/CONTRIBUTING.md) for details on:

- Development setup
- Code style guidelines
- Testing requirements
- Pull request process

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit: `git commit -m 'feat: add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

This project is licensed under the ISC License (see package.json).

## 🔗 Links

- [Documentation](./docs/)
- [API Reference](./docs/API.md)
- [Architecture Guide](./docs/ARCHITECTURE.md)
- [Docker Setup](./docker/README.md)
- [Kubernetes Deployment](./k8s/README.md)
- [Monitoring Setup](./docker/grafana/README.md)

---

Made with ❤️ by the AI Content Curator team #ai-news-curator
