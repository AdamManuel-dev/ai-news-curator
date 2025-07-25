export interface AppConfig {
  // Server Configuration
  port: number;
  nodeEnv: string;

  // API Keys
  anthropicApiKey: string;
  pineconeApiKey: string;
  openaiApiKey: string;

  // Database Configuration
  redisUrl: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };

  // External Service URLs
  sourceConfigUrl: string;

  // Vector Database Configuration
  pineconeIndexName: string;
  pineconeEnvironment: string;

  // Model Configuration
  gptModel: string;
  gptTemperature: number;
  gptMaxTokens: number;
  openaiEmbeddingModel: string;

  // Rate Limiting
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
  maxArticlesPerHour: number;

  // Content Processing Limits
  maxArticleLength: number;
  qualityScoreThreshold: number;
  tagConfidenceThreshold: number;
  sourceReputationThreshold: number;

  // Performance Settings
  maxConcurrentRequests: number;
  discoveryTimeoutMs: number;
  taggingTimeoutMs: number;
  rankingTimeoutMs: number;

  // Cache Configuration
  contentMetadataCacheTtl: number;
  tagAssignmentsCacheTtl: number;
  trendDataCacheTtl: number;

  // Security
  jwtSecret: string;
  apiKeyRotationDays: number;

  // Monitoring
  logLevel: string;
  healthCheckInterval: number;

  // Development/Testing
  enableDebugLogging: boolean;
  mockExternalApis: boolean;
}

export const config: AppConfig = {
  // Server Configuration
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  // API Keys
  anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
  pineconeApiKey: process.env['PINECONE_API_KEY'] ?? '',
  openaiApiKey: process.env['OPENAI_API_KEY'] ?? '',

  // Database Configuration
  redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
  redis: {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    password: process.env['REDIS_PASSWORD'] || undefined,
    db: parseInt(process.env['REDIS_DB'] ?? '0', 10),
  },

  // External Service URLs
  sourceConfigUrl: process.env['SOURCE_CONFIG_URL'] ?? '',

  // Vector Database Configuration
  pineconeIndexName: process.env['PINECONE_INDEX_NAME'] ?? 'ai-content-index',
  pineconeEnvironment: process.env['PINECONE_ENVIRONMENT'] ?? 'us-east-1-aws',

  // Model Configuration
  gptModel: process.env['GPT_MODEL'] ?? 'gpt-4o',
  gptTemperature: parseFloat(process.env['GPT_TEMPERATURE'] ?? '0.3'),
  gptMaxTokens: parseInt(process.env['GPT_MAX_TOKENS'] ?? '2000', 10),
  openaiEmbeddingModel: process.env['OPENAI_EMBEDDING_MODEL'] ?? 'text-embedding-3-small',

  // Rate Limiting
  maxRequestsPerHour: parseInt(process.env['MAX_REQUESTS_PER_HOUR'] ?? '1000', 10),
  maxRequestsPerDay: parseInt(process.env['MAX_REQUESTS_PER_DAY'] ?? '10000', 10),
  maxArticlesPerHour: parseInt(process.env['MAX_ARTICLES_PER_HOUR'] ?? '1000', 10),

  // Content Processing Limits
  maxArticleLength: parseInt(process.env['MAX_ARTICLE_LENGTH'] ?? '50000', 10),
  qualityScoreThreshold: parseFloat(process.env['QUALITY_SCORE_THRESHOLD'] ?? '0.6'),
  tagConfidenceThreshold: parseFloat(process.env['TAG_CONFIDENCE_THRESHOLD'] ?? '0.7'),
  sourceReputationThreshold: parseFloat(process.env['SOURCE_REPUTATION_THRESHOLD'] ?? '0.5'),

  // Performance Settings
  maxConcurrentRequests: parseInt(process.env['MAX_CONCURRENT_REQUESTS'] ?? '50', 10),
  discoveryTimeoutMs: parseInt(process.env['DISCOVERY_TIMEOUT_MS'] ?? '30000', 10),
  taggingTimeoutMs: parseInt(process.env['TAGGING_TIMEOUT_MS'] ?? '2000', 10),
  rankingTimeoutMs: parseInt(process.env['RANKING_TIMEOUT_MS'] ?? '500', 10),

  // Cache Configuration
  contentMetadataCacheTtl: parseInt(process.env['CONTENT_METADATA_CACHE_TTL'] ?? '604800', 10),
  tagAssignmentsCacheTtl: parseInt(process.env['TAG_ASSIGNMENTS_CACHE_TTL'] ?? '2592000', 10),
  trendDataCacheTtl: parseInt(process.env['TREND_DATA_CACHE_TTL'] ?? '86400', 10),

  // Security
  jwtSecret: process.env['JWT_SECRET'] ?? '',
  apiKeyRotationDays: parseInt(process.env['API_KEY_ROTATION_DAYS'] ?? '90', 10),

  // Monitoring
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  healthCheckInterval: parseInt(process.env['HEALTH_CHECK_INTERVAL'] ?? '30000', 10),

  // Development/Testing
  enableDebugLogging: process.env['ENABLE_DEBUG_LOGGING'] === 'true',
  mockExternalApis: process.env['MOCK_EXTERNAL_APIS'] === 'true',
};
