/**
 * @fileoverview Content-specific serializers
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Content/Author/Source/Tag serialization, search highlighting, recommendations, hierarchy
 * Main APIs: ContentSerializer, AuthorSerializer, SourceSerializer, TagSerializer
 * Constraints: Fixed entity structures, highlighting logic limitations, hierarchy depth
 * Patterns: Static methods, format variants, relation inclusion, performance-optimized filtering
 */

import { SerializationOptions } from './index';

/**
 * Content entity interfaces
 */
export interface ContentData {
  id: string;
  url: string;
  title: string;
  summary?: string;
  authorId?: string;
  sourceId: string;
  publishDate?: string;
  contentType: 'article' | 'paper' | 'tutorial' | 'news' | 'video' | 'podcast';
  qualityScore: number;
  readingTime?: number;
  technicalDepth?: 'beginner' | 'intermediate' | 'advanced';
  hasCodeExamples: boolean;
  hasVisuals: boolean;
  rawContent?: string;
  languageCode: string;
  wordCount?: number;
  sourceReputation?: number;
  createdAt: string;
  updatedAt: string;
  
  // Relations
  author?: AuthorData;
  source?: SourceData;
  tags?: TagData[];
}

export interface AuthorData {
  id: string;
  name: string;
  email?: string;
  affiliation?: string;
  socialProfiles: Record<string, string>;
  expertise: string[];
  reputation: number;
  contentCount: number;
  avgQualityScore: number;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SourceData {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'api' | 'scraper' | 'social' | 'manual';
  reputation: number;
  isActive: boolean;
  lastChecked?: string;
  checkFrequency: number;
  successRate: number;
  avgQualityScore: number;
  configuration: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface TagData {
  id: string;
  name: string;
  category: 'topic' | 'difficulty' | 'use_case' | 'technology' | 'framework' | 'domain';
  description?: string;
  parentTagId?: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  
  // Relations
  parentTag?: TagData;
  childTags?: TagData[];
}

/**
 * Content serializer with multiple view formats
 */
export class ContentSerializer {
  /**
   * Serialize content for list view (compact format)
   */
  static forList(content: ContentData[], options: SerializationOptions = {}): any[] {
    const defaultOptions: SerializationOptions = {
      format: 'compact',
      includeFields: [
        'id', 'title', 'url', 'summary', 'contentType', 'qualityScore', 
        'readingTime', 'technicalDepth', 'publishDate', 'languageCode'
      ],
      includeRelations: ['author', 'source'],
      ...options
    };

    return content.map(item => this.forItem(item, defaultOptions));
  }

  /**
   * Serialize single content item
   */
  static forItem(content: ContentData, options: SerializationOptions = {}): any {
    const {
      format = 'detailed',
      includeFields,
      excludeFields,
      includeRelations = []
    } = options;

    let serialized: any = {
      id: content.id,
      title: content.title,
      url: content.url,
      contentType: content.contentType,
      qualityScore: content.qualityScore,
      publishDate: content.publishDate,
      languageCode: content.languageCode,
      createdAt: content.createdAt
    };

    // Add detailed fields for full view
    if (format === 'detailed') {
      serialized = {
        ...serialized,
        summary: content.summary,
        readingTime: content.readingTime,
        technicalDepth: content.technicalDepth,
        hasCodeExamples: content.hasCodeExamples,
        hasVisuals: content.hasVisuals,
        wordCount: content.wordCount,
        sourceReputation: content.sourceReputation,
        updatedAt: content.updatedAt
      };
    }

    // Include related data if requested
    if (includeRelations.includes('author') && content.author) {
      serialized.author = AuthorSerializer.forItem(content.author, { format: 'compact' });
    }

    if (includeRelations.includes('source') && content.source) {
      serialized.source = SourceSerializer.forItem(content.source, { format: 'compact' });
    }

    if (includeRelations.includes('tags') && content.tags) {
      serialized.tags = TagSerializer.forList(content.tags, { format: 'compact' });
    }

    // Apply field filtering
    if (includeFields) {
      serialized = this.filterFields(serialized, includeFields);
    }

    if (excludeFields) {
      serialized = this.excludeFields(serialized, excludeFields);
    }

    return serialized;
  }

  /**
   * Serialize for search results with highlighting
   */
  static forSearch(content: ContentData[], searchQuery?: string, options: SerializationOptions = {}): any[] {
    return content.map(item => ({
      ...this.forItem(item, { format: 'compact', ...options }),
      relevanceScore: item.qualityScore, // Could be replaced with actual search relevance
      searchQuery: searchQuery,
      highlights: this.generateHighlights(item, searchQuery)
    }));
  }

  /**
   * Serialize for recommendations
   */
  static forRecommendations(content: ContentData[], similarityScores?: number[], options: SerializationOptions = {}): any[] {
    return content.map((item, index) => ({
      ...this.forItem(item, { format: 'compact', ...options }),
      similarityScore: similarityScores?.[index] || 0,
      recommendationReason: this.generateRecommendationReason(item)
    }));
  }

  private static generateHighlights(content: ContentData, query?: string): any {
    if (!query) return {};

    const highlights: any = {};
    const queryLower = query.toLowerCase();

    // Simple highlighting logic (in practice, this would be more sophisticated)
    if (content.title.toLowerCase().includes(queryLower)) {
      highlights.title = content.title.replace(
        new RegExp(query, 'gi'),
        `<mark>$&</mark>`
      );
    }

    if (content.summary?.toLowerCase().includes(queryLower)) {
      highlights.summary = content.summary.replace(
        new RegExp(query, 'gi'),
        `<mark>$&</mark>`
      );
    }

    return highlights;
  }

  private static generateRecommendationReason(content: ContentData): string {
    const reasons = [];

    if (content.qualityScore > 0.8) {
      reasons.push('High quality content');
    }

    if (content.hasCodeExamples) {
      reasons.push('Contains code examples');
    }

    if (content.technicalDepth === 'advanced') {
      reasons.push('Advanced technical content');
    }

    return reasons.join(', ') || 'Recommended for you';
  }

  private static filterFields(obj: any, fields: string[]): any {
    const filtered: any = {};
    fields.forEach(field => {
      if (obj.hasOwnProperty(field)) {
        filtered[field] = obj[field];
      }
    });
    return filtered;
  }

  private static excludeFields(obj: any, fields: string[]): any {
    const filtered = { ...obj };
    fields.forEach(field => {
      delete filtered[field];
    });
    return filtered;
  }
}

/**
 * Author serializer
 */
export class AuthorSerializer {
  static forList(authors: AuthorData[], options: SerializationOptions = {}): any[] {
    const defaultOptions: SerializationOptions = {
      format: 'compact',
      includeFields: ['id', 'name', 'affiliation', 'reputation', 'isVerified', 'contentCount'],
      ...options
    };

    return authors.map(author => this.forItem(author, defaultOptions));
  }

  static forItem(author: AuthorData, options: SerializationOptions = {}): any {
    const { format = 'detailed' } = options;

    let serialized: any = {
      id: author.id,
      name: author.name,
      reputation: author.reputation,
      isVerified: author.isVerified,
      contentCount: author.contentCount
    };

    if (format === 'detailed') {
      serialized = {
        ...serialized,
        email: author.email,
        affiliation: author.affiliation,
        socialProfiles: author.socialProfiles,
        expertise: author.expertise,
        avgQualityScore: author.avgQualityScore,
        createdAt: author.createdAt,
        updatedAt: author.updatedAt
      };
    }

    return serialized;
  }
}

/**
 * Source serializer
 */
export class SourceSerializer {
  static forList(sources: SourceData[], options: SerializationOptions = {}): any[] {
    const defaultOptions: SerializationOptions = {
      format: 'compact',
      includeFields: ['id', 'name', 'type', 'reputation', 'isActive', 'successRate'],
      ...options
    };

    return sources.map(source => this.forItem(source, defaultOptions));
  }

  static forItem(source: SourceData, options: SerializationOptions = {}): any {
    const { format = 'detailed' } = options;

    let serialized: any = {
      id: source.id,
      name: source.name,
      type: source.type,
      reputation: source.reputation,
      isActive: source.isActive
    };

    if (format === 'detailed') {
      serialized = {
        ...serialized,
        url: source.url,
        lastChecked: source.lastChecked,
        checkFrequency: source.checkFrequency,
        successRate: source.successRate,
        avgQualityScore: source.avgQualityScore,
        configuration: source.configuration,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt
      };
    }

    return serialized;
  }
}

/**
 * Tag serializer
 */
export class TagSerializer {
  static forList(tags: TagData[], options: SerializationOptions = {}): any[] {
    const defaultOptions: SerializationOptions = {
      format: 'compact',
      includeFields: ['id', 'name', 'category', 'usageCount'],
      ...options
    };

    return tags.map(tag => this.forItem(tag, defaultOptions));
  }

  static forItem(tag: TagData, options: SerializationOptions = {}): any {
    const { format = 'detailed', includeRelations = [] } = options;

    let serialized: any = {
      id: tag.id,
      name: tag.name,
      category: tag.category,
      usageCount: tag.usageCount,
      isActive: tag.isActive
    };

    if (format === 'detailed') {
      serialized = {
        ...serialized,
        description: tag.description,
        parentTagId: tag.parentTagId,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt
      };
    }

    // Include hierarchical relations if requested
    if (includeRelations.includes('parent') && tag.parentTag) {
      serialized.parentTag = this.forItem(tag.parentTag, { format: 'compact' });
    }

    if (includeRelations.includes('children') && tag.childTags) {
      serialized.childTags = this.forList(tag.childTags, { format: 'compact' });
    }

    return serialized;
  }

  /**
   * Serialize tags in hierarchical structure
   */
  static forHierarchy(tags: TagData[]): any[] {
    const tagMap = new Map<string, any>();
    const rootTags: any[] = [];

    // First pass: create all tag objects
    tags.forEach(tag => {
      const serialized = this.forItem(tag, { format: 'detailed' });
      serialized.children = [];
      tagMap.set(tag.id, serialized);
    });

    // Second pass: build hierarchy
    tags.forEach(tag => {
      const serialized = tagMap.get(tag.id);
      if (tag.parentTagId && tagMap.has(tag.parentTagId)) {
        const parent = tagMap.get(tag.parentTagId);
        parent.children.push(serialized);
      } else {
        rootTags.push(serialized);
      }
    });

    return rootTags;
  }
}