/**
 * @fileoverview Tests for content-specific serializers
 */

import {
  ContentSerializer,
  AuthorSerializer,
  SourceSerializer,
  TagSerializer,
  ContentData,
  AuthorData,
  SourceData,
  TagData
} from '../content';

describe('ContentSerializer', () => {
  const mockContent: ContentData = {
    id: 'content-1',
    url: 'https://example.com/article',
    title: 'Test Article',
    summary: 'This is a test article summary',
    authorId: 'author-1',
    sourceId: 'source-1',
    publishDate: '2024-01-15T10:30:00Z',
    contentType: 'article',
    qualityScore: 0.85,
    readingTime: 5,
    technicalDepth: 'intermediate',
    hasCodeExamples: true,
    hasVisuals: false,
    rawContent: 'Full article content...',
    languageCode: 'en',
    wordCount: 1200,
    sourceReputation: 0.9,
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    author: {
      id: 'author-1',
      name: 'John Doe',
      email: 'john@example.com',
      affiliation: 'Tech Corp',
      socialProfiles: { twitter: '@johndoe' },
      expertise: ['JavaScript', 'React'],
      reputation: 0.95,
      contentCount: 50,
      avgQualityScore: 0.88,
      isVerified: true,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z'
    },
    source: {
      id: 'source-1',
      name: 'Tech Blog',
      url: 'https://techblog.com',
      type: 'rss',
      reputation: 0.9,
      isActive: true,
      lastChecked: '2024-01-15T11:00:00Z',
      checkFrequency: 3600,
      successRate: 0.98,
      avgQualityScore: 0.85,
      configuration: { feedUrl: 'https://techblog.com/feed.xml' },
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2024-01-15T11:00:00Z'
    },
    tags: [
      {
        id: 'tag-1',
        name: 'JavaScript',
        category: 'technology',
        description: 'JavaScript programming language',
        isActive: true,
        usageCount: 150,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z'
      }
    ]
  };

  describe('forItem', () => {
    it('should serialize content item with detailed format by default', () => {
      const result = ContentSerializer.forItem(mockContent);

      expect(result).toMatchObject({
        id: 'content-1',
        title: 'Test Article',
        url: 'https://example.com/article',
        contentType: 'article',
        qualityScore: 0.85,
        summary: 'This is a test article summary',
        readingTime: 5,
        technicalDepth: 'intermediate',
        hasCodeExamples: true,
        hasVisuals: false,
        wordCount: 1200,
        sourceReputation: 0.9
      });
    });

    it('should serialize content item with compact format', () => {
      const result = ContentSerializer.forItem(mockContent, { format: 'compact' });

      expect(result).toMatchObject({
        id: 'content-1',
        title: 'Test Article',
        url: 'https://example.com/article',
        contentType: 'article',
        qualityScore: 0.85
      });

      // Should not include detailed fields in compact format
      expect(result).not.toHaveProperty('summary');
      expect(result).not.toHaveProperty('wordCount');
      expect(result).not.toHaveProperty('sourceReputation');
    });

    it('should include author relation when requested', () => {
      const result = ContentSerializer.forItem(mockContent, {
        includeRelations: ['author']
      });

      expect(result.author).toMatchObject({
        id: 'author-1',
        name: 'John Doe',
        reputation: 0.95,
        isVerified: true,
        contentCount: 50
      });
    });

    it('should include source relation when requested', () => {
      const result = ContentSerializer.forItem(mockContent, {
        includeRelations: ['source']
      });

      expect(result.source).toMatchObject({
        id: 'source-1',
        name: 'Tech Blog',
        type: 'rss',
        reputation: 0.9,
        isActive: true
      });
    });

    it('should include tags relation when requested', () => {
      const result = ContentSerializer.forItem(mockContent, {
        includeRelations: ['tags']
      });

      expect(result.tags).toHaveLength(1);
      expect(result.tags[0]).toMatchObject({
        id: 'tag-1',
        name: 'JavaScript',
        category: 'technology',
        usageCount: 150
      });
    });

    it('should filter fields when includeFields is specified', () => {
      const result = ContentSerializer.forItem(mockContent, {
        includeFields: ['id', 'title', 'qualityScore']
      });

      expect(Object.keys(result)).toEqual(['id', 'title', 'qualityScore']);
    });

    it('should exclude fields when excludeFields is specified', () => {
      const result = ContentSerializer.forItem(mockContent, {
        excludeFields: ['rawContent', 'wordCount']
      });

      expect(result).not.toHaveProperty('rawContent');
      expect(result).not.toHaveProperty('wordCount');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title');
    });
  });

  describe('forList', () => {
    const mockContentList = [mockContent, { ...mockContent, id: 'content-2', title: 'Second Article' }];

    it('should serialize content list with compact format by default', () => {
      const result = ContentSerializer.forList(mockContentList);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'content-1',
        title: 'Test Article',
        contentType: 'article',
        qualityScore: 0.85
      });
      expect(result[1]).toMatchObject({
        id: 'content-2',
        title: 'Second Article'
      });
    });

    it('should include relations when specified', () => {
      const result = ContentSerializer.forList(mockContentList, {
        format: 'compact',
        includeRelations: ['author', 'source']
      });

      result.forEach(item => {
        expect(item).toHaveProperty('author');
        expect(item).toHaveProperty('source');
      });
    });
  });

  describe('forSearch', () => {
    const mockContentList = [mockContent];

    it('should serialize content for search results', () => {
      const result = ContentSerializer.forSearch(mockContentList, 'JavaScript');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'content-1',
        title: 'Test Article',
        relevanceScore: 0.85,
        searchQuery: 'JavaScript'
      });
      expect(result[0]).toHaveProperty('highlights');
    });

    it('should generate highlights for matching content', () => {
      const contentWithMatch = {
        ...mockContent,
        title: 'JavaScript Tutorial',
        summary: 'Learn JavaScript basics'
      };

      const result = ContentSerializer.forSearch([contentWithMatch], 'JavaScript');

      expect(result[0].highlights.title).toContain('<mark>JavaScript</mark>');
      expect(result[0].highlights.summary).toContain('<mark>JavaScript</mark>');
    });
  });

  describe('forRecommendations', () => {
    const mockContentList = [mockContent];
    const similarityScores = [0.92];

    it('should serialize content for recommendations', () => {
      const result = ContentSerializer.forRecommendations(mockContentList, similarityScores);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'content-1',
        title: 'Test Article',
        similarityScore: 0.92
      });
      expect(result[0]).toHaveProperty('recommendationReason');
    });

    it('should generate recommendation reason based on content properties', () => {
      const highQualityContent = { ...mockContent, qualityScore: 0.9, hasCodeExamples: true, technicalDepth: 'advanced' as const };
      
      const result = ContentSerializer.forRecommendations([highQualityContent]);

      expect(result[0].recommendationReason).toContain('High quality content');
      expect(result[0].recommendationReason).toContain('Contains code examples');
      expect(result[0].recommendationReason).toContain('Advanced technical content');
    });
  });
});

describe('AuthorSerializer', () => {
  const mockAuthor: AuthorData = {
    id: 'author-1',
    name: 'John Doe',
    email: 'john@example.com',
    affiliation: 'Tech Corp',
    socialProfiles: { twitter: '@johndoe', linkedin: 'johndoe' },
    expertise: ['JavaScript', 'React', 'Node.js'],
    reputation: 0.95,
    contentCount: 50,
    avgQualityScore: 0.88,
    isVerified: true,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z'
  };

  describe('forItem', () => {
    it('should serialize author with detailed format by default', () => {
      const result = AuthorSerializer.forItem(mockAuthor);

      expect(result).toMatchObject({
        id: 'author-1',
        name: 'John Doe',
        email: 'john@example.com',
        affiliation: 'Tech Corp',
        socialProfiles: { twitter: '@johndoe', linkedin: 'johndoe' },
        expertise: ['JavaScript', 'React', 'Node.js'],
        reputation: 0.95,
        contentCount: 50,
        avgQualityScore: 0.88,
        isVerified: true
      });
    });

    it('should serialize author with compact format', () => {
      const result = AuthorSerializer.forItem(mockAuthor, { format: 'compact' });

      expect(result).toMatchObject({
        id: 'author-1',
        name: 'John Doe',
        reputation: 0.95,
        isVerified: true,
        contentCount: 50
      });

      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('socialProfiles');
      expect(result).not.toHaveProperty('expertise');
    });
  });

  describe('forList', () => {
    const mockAuthorList = [mockAuthor, { ...mockAuthor, id: 'author-2', name: 'Jane Smith' }];

    it('should serialize author list with compact format by default', () => {
      const result = AuthorSerializer.forList(mockAuthorList);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'author-1',
        name: 'John Doe',
        reputation: 0.95
      });
      expect(result[1]).toMatchObject({
        id: 'author-2',
        name: 'Jane Smith'
      });
    });
  });
});

describe('SourceSerializer', () => {
  const mockSource: SourceData = {
    id: 'source-1',
    name: 'Tech Blog',
    url: 'https://techblog.com',
    type: 'rss',
    reputation: 0.9,
    isActive: true,
    lastChecked: '2024-01-15T11:00:00Z',
    checkFrequency: 3600,
    successRate: 0.98,
    avgQualityScore: 0.85,
    configuration: { feedUrl: 'https://techblog.com/feed.xml' },
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z'
  };

  describe('forItem', () => {
    it('should serialize source with detailed format by default', () => {
      const result = SourceSerializer.forItem(mockSource);

      expect(result).toMatchObject({
        id: 'source-1',
        name: 'Tech Blog',
        url: 'https://techblog.com',
        type: 'rss',
        reputation: 0.9,
        isActive: true,
        lastChecked: '2024-01-15T11:00:00Z',
        checkFrequency: 3600,
        successRate: 0.98,
        avgQualityScore: 0.85,
        configuration: { feedUrl: 'https://techblog.com/feed.xml' }
      });
    });

    it('should serialize source with compact format', () => {
      const result = SourceSerializer.forItem(mockSource, { format: 'compact' });

      expect(result).toMatchObject({
        id: 'source-1',
        name: 'Tech Blog',
        type: 'rss',
        reputation: 0.9,
        isActive: true
      });

      expect(result).not.toHaveProperty('url');
      expect(result).not.toHaveProperty('configuration');
      expect(result).not.toHaveProperty('lastChecked');
    });
  });
});

describe('TagSerializer', () => {
  const mockTag: TagData = {
    id: 'tag-1',
    name: 'JavaScript',
    category: 'technology',
    description: 'JavaScript programming language',
    parentTagId: 'parent-tag-1',
    isActive: true,
    usageCount: 150,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    parentTag: {
      id: 'parent-tag-1',
      name: 'Programming Languages',
      category: 'topic',
      isActive: true,
      usageCount: 500,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z'
    },
    childTags: [
      {
        id: 'child-tag-1',
        name: 'React',
        category: 'framework',
        parentTagId: 'tag-1',
        isActive: true,
        usageCount: 80,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z'
      }
    ]
  };

  describe('forItem', () => {
    it('should serialize tag with detailed format by default', () => {
      const result = TagSerializer.forItem(mockTag);

      expect(result).toMatchObject({
        id: 'tag-1',
        name: 'JavaScript',
        category: 'technology',
        description: 'JavaScript programming language',
        parentTagId: 'parent-tag-1',
        isActive: true,
        usageCount: 150
      });
    });

    it('should serialize tag with compact format', () => {
      const result = TagSerializer.forItem(mockTag, { format: 'compact' });

      expect(result).toMatchObject({
        id: 'tag-1',
        name: 'JavaScript',
        category: 'technology',
        usageCount: 150,
        isActive: true
      });

      expect(result).not.toHaveProperty('description');
      expect(result).not.toHaveProperty('parentTagId');
    });

    it('should include parent tag when requested', () => {
      const result = TagSerializer.forItem(mockTag, {
        includeRelations: ['parent']
      });

      expect(result.parentTag).toMatchObject({
        id: 'parent-tag-1',
        name: 'Programming Languages',
        category: 'topic'
      });
    });

    it('should include child tags when requested', () => {
      const result = TagSerializer.forItem(mockTag, {
        includeRelations: ['children']
      });

      expect(result.childTags).toHaveLength(1);
      expect(result.childTags[0]).toMatchObject({
        id: 'child-tag-1',
        name: 'React',
        category: 'framework'
      });
    });
  });

  describe('forHierarchy', () => {
    const mockTags = [
      {
        id: 'root-1',
        name: 'Programming',
        category: 'topic' as const,
        isActive: true,
        usageCount: 1000,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z'
      },
      {
        id: 'child-1',
        name: 'JavaScript',
        category: 'technology' as const,
        parentTagId: 'root-1',
        isActive: true,
        usageCount: 500,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z'
      },
      {
        id: 'grandchild-1',
        name: 'React',
        category: 'framework' as const,
        parentTagId: 'child-1',
        isActive: true,
        usageCount: 200,
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z'
      }
    ];

    it('should build hierarchical tag structure', () => {
      const result = TagSerializer.forHierarchy(mockTags);

      expect(result).toHaveLength(1); // Only root tags at top level
      expect(result[0]).toMatchObject({
        id: 'root-1',
        name: 'Programming'
      });
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0]).toMatchObject({
        id: 'child-1',
        name: 'JavaScript'
      });
      expect(result[0].children[0].children).toHaveLength(1);
      expect(result[0].children[0].children[0]).toMatchObject({
        id: 'grandchild-1',
        name: 'React'
      });
    });
  });
});