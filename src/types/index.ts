/**
 * @fileoverview Core content curator input/output types and interfaces
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Content discovery, tagging, ranking, trend analysis interfaces
 * Main APIs: ContentCuratorInput, ContentCuratorOutput, DiscoveredContent, RankedContent
 * Constraints: Action types limited to predefined enum values, quality scores 0-1
 * Patterns: All interfaces use string IDs, timestamps as ISO strings, optional fields for flexibility
 */

export interface ContentCuratorInput {
  action: 'discover' | 'tag' | 'rank' | 'analyze_trends' | 'get_personalized';
  discovery?: DiscoveryOptions;
  tagging?: TaggingOptions;
  ranking?: RankingOptions;
  userContext?: UserContext;
}

export interface DiscoveryOptions {
  timeframe: 'last_hour' | 'last_24_hours' | 'last_week' | 'last_month';
  sources?: string[];
  excludeSources?: string[];
  minQualityScore?: number;
  maxResults?: number;
  categories?: Array<'research' | 'tutorial' | 'news' | 'opinion' | 'tool'>;
}

export interface TaggingOptions {
  contentUrl?: string;
  contentText?: string;
  existingTags?: string[];
  tagTypes?: Array<'topic' | 'difficulty' | 'use_case' | 'technology'>;
}

export interface RankingOptions {
  contentIds: string[];
  criteria?: RankingCriteria;
}

export interface RankingCriteria {
  relevanceWeight?: number;
  qualityWeight?: number;
  recencyWeight?: number;
  engagementWeight?: number;
}

export interface UserContext {
  userId: string;
  interests?: string[];
  expertiseLevel?: 'beginner' | 'intermediate' | 'advanced';
  preferredFormats?: Array<'tutorial' | 'research' | 'news' | 'analysis'>;
  readHistory?: string[];
}

export interface ContentCuratorOutput {
  action: string;
  success: boolean;
  discoveredContent?: DiscoveredContent[];
  tagResult?: TagResult;
  rankedContent?: RankedContent[];
  trends?: TrendAnalysis;
  metadata: ProcessingMetadata;
  errors?: ProcessingError[];
}

export interface DiscoveredContent {
  id: string;
  url: string;
  title: string;
  summary: string;
  author: string;
  source: string;
  publishDate: string;
  contentType: 'article' | 'paper' | 'tutorial' | 'news';
  qualityScore: number;
  tags: string[];
  metrics: ContentMetrics;
}

export interface ContentMetrics {
  readingTime: number;
  technicalDepth: 'beginner' | 'intermediate' | 'advanced';
  codeExamples: boolean;
  hasVisuals: boolean;
}

export interface TagResult {
  contentId: string;
  assignedTags: AssignedTag[];
  suggestedTags: string[];
}

export interface AssignedTag {
  tag: string;
  category: 'topic' | 'difficulty' | 'use_case' | 'technology';
  confidence: number;
  reason: string;
}

export interface RankedContent {
  contentId: string;
  rank: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  explanation: string;
}

export interface ScoreBreakdown {
  relevance: number;
  quality: number;
  recency: number;
  engagement: number;
}

export interface TrendAnalysis {
  period: string;
  risingTopics: RisingTopic[];
  decliningTopics: DecliningTopic[];
  emergingAuthors: EmergingAuthor[];
}

export interface RisingTopic {
  topic: string;
  growthRate: number;
  mentionCount: number;
  topSources: string[];
}

export interface DecliningTopic {
  topic: string;
  declineRate: number;
  peakDate: string;
}

export interface EmergingAuthor {
  name: string;
  affiliation?: string;
  contentCount: number;
  avgQualityScore: number;
}

export interface ProcessingMetadata {
  processingTime: number;
  sourcesChecked: number;
  articlesAnalyzed: number;
  cacheHits: number;
  apiCallsUsed: ApiCallsUsed;
}

export interface ApiCallsUsed {
  scraper: number;
  embeddings: number;
  llm: number;
}

export interface ProcessingError {
  code: 'SOURCE_UNAVAILABLE' | 'RATE_LIMIT' | 'PARSING_ERROR';
  message: string;
  source?: string;
  recoverable: boolean;
}
