// Service tokens for dependency injection
// These tokens are used to identify services in the DI container

// Core services
export const TOKENS = {
  // Configuration
  CONFIG: Symbol('Config'),

  // Logging
  LOGGER: Symbol('Logger'),

  // Database
  DATABASE_SERVICE: Symbol('DatabaseService'),
  DATABASE: Symbol('Database'),
  REDIS: Symbol('Redis'),
  REDIS_ADAPTER: Symbol('RedisAdapter'),
  VECTOR_DB: Symbol('VectorDB'),

  // Tools
  WEB_SCRAPER: Symbol('WebScraper'),
  RSS_FEED_READER: Symbol('RSSFeedReader'),
  ACADEMIC_SEARCH: Symbol('AcademicSearch'),
  SOCIAL_MEDIA_MONITOR: Symbol('SocialMediaMonitor'),

  // Core Services
  CACHE_SERVICE: Symbol('CacheService'),
  CACHE_MANAGER: Symbol('CacheManager'),
  REDIS_HEALTH_SERVICE: Symbol('RedisHealthService'),
  CONTENT_DISCOVERY_SERVICE: Symbol('ContentDiscoveryService'),
  TAGGING_SERVICE: Symbol('TaggingService'),
  RANKING_SERVICE: Symbol('RankingService'),
  TREND_ANALYSIS_SERVICE: Symbol('TrendAnalysisService'),
  PERSONALIZATION_SERVICE: Symbol('PersonalizationService'),

  // API Services
  ANTHROPIC_CLIENT: Symbol('AnthropicClient'),
  OPENAI_CLIENT: Symbol('OpenAIClient'),
  PINECONE_CLIENT: Symbol('PineconeClient'),

  // Repositories
  CONTENT_REPOSITORY: Symbol('ContentRepository'),
  USER_REPOSITORY: Symbol('UserRepository'),
  TAG_REPOSITORY: Symbol('TagRepository'),

  // Controllers
  CONTENT_CONTROLLER: Symbol('ContentController'),
  HEALTH_CONTROLLER: Symbol('HealthController'),

  // Middleware
  AUTH_MIDDLEWARE: Symbol('AuthMiddleware'),
  RATE_LIMIT_MIDDLEWARE: Symbol('RateLimitMiddleware'),
} as const;

// Export individual tokens for convenience
export const {
  CONFIG,
  LOGGER,
  DATABASE_SERVICE,
  DATABASE,
  REDIS,
  REDIS_ADAPTER,
  VECTOR_DB,
  WEB_SCRAPER,
  RSS_FEED_READER,
  ACADEMIC_SEARCH,
  SOCIAL_MEDIA_MONITOR,
  CACHE_SERVICE,
  CACHE_MANAGER,
  REDIS_HEALTH_SERVICE,
  CONTENT_DISCOVERY_SERVICE,
  TAGGING_SERVICE,
  RANKING_SERVICE,
  TREND_ANALYSIS_SERVICE,
  PERSONALIZATION_SERVICE,
  ANTHROPIC_CLIENT,
  OPENAI_CLIENT,
  PINECONE_CLIENT,
  CONTENT_REPOSITORY,
  USER_REPOSITORY,
  TAG_REPOSITORY,
  CONTENT_CONTROLLER,
  HEALTH_CONTROLLER,
  AUTH_MIDDLEWARE,
  RATE_LIMIT_MIDDLEWARE,
} = TOKENS;
