/**
 * @fileoverview Database entity types and interfaces for the AI Content Curator Agent.
 *
 * These types mirror the PostgreSQL schema and provide type safety for database operations.
 * All entities include proper timestamps and relationships as defined in the database schema.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

// Enum types matching PostgreSQL enums
export enum ContentType {
  ARTICLE = 'article',
  PAPER = 'paper',
  TUTORIAL = 'tutorial',
  NEWS = 'news',
  VIDEO = 'video',
  PODCAST = 'podcast',
}

export enum TechnicalDepth {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum SourceType {
  RSS = 'rss',
  API = 'api',
  SCRAPER = 'scraper',
  SOCIAL = 'social',
  MANUAL = 'manual',
}

export enum TagCategory {
  TOPIC = 'topic',
  DIFFICULTY = 'difficulty',
  USE_CASE = 'use_case',
  TECHNOLOGY = 'technology',
  FRAMEWORK = 'framework',
  DOMAIN = 'domain',
}

export enum InteractionType {
  VIEW = 'view',
  LIKE = 'like',
  SHARE = 'share',
  BOOKMARK = 'bookmark',
  RATING = 'rating',
  CLICK = 'click',
}

export enum TrendType {
  RISING = 'rising',
  DECLINING = 'declining',
  STABLE = 'stable',
  EMERGING = 'emerging',
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum JobType {
  DISCOVERY = 'discovery',
  TAGGING = 'tagging',
  RANKING = 'ranking',
  TREND_ANALYSIS = 'trend_analysis',
  EMBEDDING = 'embedding',
  CLEANUP = 'cleanup',
}

export enum ExpertiseLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export enum AssignmentMethod {
  AI = 'ai',
  HUMAN = 'human',
  RULE = 'rule',
  ML_MODEL = 'ml_model',
}

// Base interface for all entities
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// Author entity
export interface Author extends BaseEntity {
  name: string;
  email?: string;
  affiliation?: string;
  socialProfiles: Record<string, string>;
  expertise: string[];
  reputation: number;
  contentCount: number;
  avgQualityScore: number;
  isVerified: boolean;
}

// Source entity
export interface Source extends BaseEntity {
  name: string;
  url: string;
  type: SourceType;
  reputation: number;
  isActive: boolean;
  lastChecked?: Date;
  checkFrequency: number;
  successRate: number;
  avgQualityScore: number;
  configuration: Record<string, unknown>;
}

// Tag entity
export interface Tag extends BaseEntity {
  name: string;
  category: TagCategory;
  description?: string;
  parentTagId?: string;
  isActive: boolean;
  usageCount: number;
}

// Content entity (main content items)
export interface Content extends BaseEntity {
  url: string;
  title: string;
  summary?: string;
  authorId?: string;
  sourceId: string;
  publishDate?: Date;
  contentType: ContentType;
  qualityScore: number;
  readingTime?: number;
  technicalDepth?: TechnicalDepth;
  hasCodeExamples: boolean;
  hasVisuals: boolean;
  rawContent?: string;
  languageCode: string;
  wordCount?: number;
  sourceReputation?: number;
  embeddingVector: number[];
  embeddingModel: string;

  // Relations (populated by joins)
  author?: Author;
  source?: Source;
  tags?: ContentTag[];
}

// Content-Tag junction with confidence
export interface ContentTag {
  contentId: string;
  tagId: string;
  confidence: number;
  reason?: string;
  assignedBy: AssignmentMethod;
  assignedAt: Date;

  // Relations
  content?: Content;
  tag?: Tag;
}

// User entity
export interface User extends BaseEntity {
  email: string;
  username?: string;
  expertiseLevel: ExpertiseLevel;
  interests: string[];
  preferredFormats: ContentType[];
  timezone: string;
  isActive: boolean;
  preferences: Record<string, unknown>;
  lastActiveAt?: Date;
}

// User interaction tracking
export interface UserInteraction {
  id: string;
  userId: string;
  contentId: string;
  interactionType: InteractionType;
  value?: number;
  metadata: Record<string, unknown>;
  timestamp: Date;

  // Relations
  user?: User;
  content?: Content;
}

// Trend analysis
export interface Trend {
  id: string;
  period: string;
  topicName: string;
  trendType: TrendType;
  growthRate?: number;
  mentionCount: number;
  topSources: string[];
  peakDate?: Date;
  calculatedAt: Date;
  createdAt: Date;
}

// Processing jobs
export interface ProcessingJob extends BaseEntity {
  jobType: JobType;
  status: JobStatus;
  parameters: Record<string, unknown>;
  results: Record<string, unknown>;
  errors: Record<string, unknown>;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
}

// Cache metadata
export interface CacheMetadata {
  key: string;
  entityType: string;
  entityId?: string;
  expiresAt: Date;
  cacheTags: string[];
  createdAt: Date;
}

// API key management
export interface ApiKey extends BaseEntity {
  keyHash: string;
  name: string;
  userId?: string;
  permissions: string[];
  rateLimit: number;
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;

  // Relations
  user?: User;
}

// Input types for creating entities (without auto-generated fields)
export interface CreateContentInput {
  url: string;
  title: string;
  summary?: string;
  authorId?: string;
  sourceId: string;
  publishDate?: Date;
  contentType: ContentType;
  qualityScore?: number;
  readingTime?: number;
  technicalDepth?: TechnicalDepth;
  hasCodeExamples?: boolean;
  hasVisuals?: boolean;
  rawContent?: string;
  languageCode?: string;
  wordCount?: number;
  sourceReputation?: number;
  embeddingVector?: number[];
  embeddingModel?: string;
}

export interface CreateTagInput {
  name: string;
  category: TagCategory;
  description?: string;
  parentTagId?: string;
}

export interface CreateUserInput {
  email: string;
  username?: string;
  expertiseLevel?: ExpertiseLevel;
  interests?: string[];
  preferredFormats?: ContentType[];
  timezone?: string;
  preferences?: Record<string, unknown>;
}

export interface CreateSourceInput {
  name: string;
  url: string;
  type: SourceType;
  reputation?: number;
  checkFrequency?: number;
  configuration?: Record<string, unknown>;
}

export interface CreateAuthorInput {
  name: string;
  email?: string;
  affiliation?: string;
  socialProfiles?: Record<string, string>;
  expertise?: string[];
  reputation?: number;
  isVerified?: boolean;
}

// Update types (all fields optional except id)
export interface UpdateContentInput {
  id: string;
  url?: string;
  title?: string;
  summary?: string;
  authorId?: string;
  sourceId?: string;
  publishDate?: Date;
  contentType?: ContentType;
  qualityScore?: number;
  readingTime?: number;
  technicalDepth?: TechnicalDepth;
  hasCodeExamples?: boolean;
  hasVisuals?: boolean;
  rawContent?: string;
  languageCode?: string;
  wordCount?: number;
  sourceReputation?: number;
  embeddingVector?: number[];
  embeddingModel?: string;
}

// Query filters and options
export interface ContentFilters {
  sourceIds?: string[];
  authorIds?: string[];
  contentTypes?: ContentType[];
  technicalDepths?: TechnicalDepth[];
  tagIds?: string[];
  minQualityScore?: number;
  publishDateFrom?: Date;
  publishDateTo?: Date;
  hasCodeExamples?: boolean;
  hasVisuals?: boolean;
  languageCodes?: string[];
  search?: string;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  includeTags?: boolean;
  includeAuthor?: boolean;
  includeSource?: boolean;
}

// Search and ranking interfaces
export interface SearchResult {
  content: Content;
  score: number;
  highlightedTitle?: string;
  highlightedSummary?: string;
  relevantTags?: Tag[];
}

export interface SimilaritySearchOptions {
  vector: number[];
  limit?: number;
  threshold?: number;
  filters?: ContentFilters;
}

// Trend analysis types
export interface TrendAnalysisOptions {
  period: string;
  topics?: string[];
  minMentions?: number;
  includeDeclines?: boolean;
}

export interface TopicTrend {
  topic: string;
  currentCount: number;
  previousCount: number;
  growthRate: number;
  trendType: TrendType;
  topContent: Content[];
  topSources: string[];
}

// Job processing types
export interface JobParameters {
  [key: string]: unknown;
}

export interface JobResult {
  success: boolean;
  data?: unknown;
  message?: string;
  processedCount?: number;
  errorCount?: number;
}

// Database connection and configuration types
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
}

// Pagination types
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Aggregation types for analytics
export interface ContentAnalytics {
  totalContent: number;
  contentByType: Record<ContentType, number>;
  contentByDepth: Record<TechnicalDepth, number>;
  avgQualityScore: number;
  topTags: Array<{ tag: Tag; count: number }>;
  topAuthors: Array<{ author: Author; count: number }>;
  topSources: Array<{ source: Source; count: number }>;
  contentByDate: Array<{ date: string; count: number }>;
}

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  usersByExpertise: Record<ExpertiseLevel, number>;
  topInteractions: Array<{ type: InteractionType; count: number }>;
  engagementMetrics: {
    avgInteractionsPerUser: number;
    avgInteractionsPerContent: number;
    topContent: Content[];
  };
}
