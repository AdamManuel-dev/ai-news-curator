/**
 * @fileoverview Tests for Pinecone vector database service with comprehensive vector operations
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Vector upsert/search/delete, connection management, batch operations, health checks
 * Main APIs: upsertVector(), searchVectors(), deleteVectors(), connect(), healthCheck()
 * Constraints: Requires Pinecone client mock, API key configuration, metrics collection
 * Patterns: Mock Pinecone SDK, test vector operations, validate error handling
 */

import { PineconeService, ContentVector, VectorSearchOptions } from '../pinecone';
import { config } from '@config/index';

// Mock Pinecone client
jest.mock('@pinecone-database/pinecone', () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue({
      describeIndexStats: jest.fn(),
      namespace: jest.fn().mockReturnThis(),
      upsert: jest.fn(),
      query: jest.fn(),
      deleteMany: jest.fn(),
      deleteAll: jest.fn(),
      fetch: jest.fn()
    })
  }))
}));

// Mock config
jest.mock('@config/index', () => ({
  config: {
    pineconeApiKey: 'test-api-key',
    pineconeIndexName: 'test-index',
    pineconeEnvironment: 'test-env'
  }
}));

// Mock logger
jest.mock('@utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock metrics
jest.mock('@middleware/metrics', () => ({
  recordVectorOperation: jest.fn(),
  recordVectorSearchTime: jest.fn(),
  updateComponentHealth: jest.fn()
}));

describe('PineconeService', () => {
  let pineconeService: PineconeService;
  let mockIndex: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the service instance
    pineconeService = new PineconeService();
    mockIndex = (pineconeService as any).index;
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(pineconeService.getIndexName()).toBe('test-index');
      expect(pineconeService.isConnectionHealthy()).toBe(false);
    });

    it('should throw error if API key is missing', () => {
      // Temporarily override config
      (config as any).pineconeApiKey = '';
      
      expect(() => new PineconeService()).toThrow('Pinecone API key is required but not provided');
      
      // Restore config
      (config as any).pineconeApiKey = 'test-api-key';
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      const mockStats = {
        dimension: 1536,
        totalRecordCount: 1000,
        namespaces: { default: {} }
      };
      
      mockIndex.describeIndexStats.mockResolvedValue(mockStats);

      await pineconeService.connect();

      expect(mockIndex.describeIndexStats).toHaveBeenCalled();
      expect(pineconeService.isConnectionHealthy()).toBe(true);
    });

    it('should handle connection failure', async () => {
      // Mock all calls to fail to ensure it reaches max retries
      mockIndex.describeIndexStats.mockRejectedValue(new Error('Connection failed'));

      // Set maxRetries to 0 for this test to avoid waiting
      (pineconeService as any).maxRetries = 0;

      await expect(pineconeService.connect()).rejects.toThrow();
      expect(pineconeService.isConnectionHealthy()).toBe(false);
    });

    it('should perform health check', async () => {
      // Set as connected first
      (pineconeService as any).isConnected = true;
      mockIndex.describeIndexStats.mockResolvedValue({ dimension: 1536 });

      const isHealthy = await pineconeService.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockIndex.describeIndexStats).toHaveBeenCalled();
    });

    it('should fail health check when not connected', async () => {
      (pineconeService as any).isConnected = false;

      const isHealthy = await pineconeService.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Vector Operations', () => {
    const mockVector: ContentVector = {
      id: 'test-vector-1',
      values: new Array(1536).fill(0.1),
      metadata: {
        contentId: 'content-1',
        title: 'Test Article',
        url: 'https://example.com/test',
        sourceId: 'source-1',
        sourceName: 'Test Source',
        publishedAt: '2025-01-26T00:00:00Z',
        tags: ['technology', 'ai'],
        category: 'tech',
        qualityScore: 0.8,
        contentType: 'article',
        language: 'en',
        wordCount: 1000,
        readTime: 5
      }
    };

    it('should upsert single vector successfully', async () => {
      mockIndex.upsert.mockResolvedValue({});

      await pineconeService.upsertVector(mockVector);

      expect(mockIndex.namespace).toHaveBeenCalledWith('');
      expect(mockIndex.upsert).toHaveBeenCalledWith([{
        id: mockVector.id,
        values: mockVector.values,
        metadata: mockVector.metadata
      }]);
    });

    it('should upsert vector with namespace', async () => {
      mockIndex.upsert.mockResolvedValue({});

      await pineconeService.upsertVector(mockVector, 'custom-namespace');

      expect(mockIndex.namespace).toHaveBeenCalledWith('custom-namespace');
    });

    it('should handle upsert failure', async () => {
      mockIndex.upsert.mockRejectedValue(new Error('Upsert failed'));

      await expect(pineconeService.upsertVector(mockVector)).rejects.toThrow('Upsert failed');
    });

    it('should upsert multiple vectors in batches', async () => {
      const vectors = Array(250).fill(0).map((_, i) => ({
        ...mockVector,
        id: `test-vector-${i}`
      }));

      mockIndex.upsert.mockResolvedValue({});

      const result = await pineconeService.upsertVectors(vectors, undefined, 100);

      expect(result.successCount).toBe(250);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockIndex.upsert).toHaveBeenCalledTimes(3); // 3 batches of 100
    });

    it('should handle partial batch failures', async () => {
      const vectors = Array(200).fill(0).map((_, i) => ({
        ...mockVector,
        id: `test-vector-${i}`
      }));

      // First batch succeeds, second fails
      mockIndex.upsert
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Batch failed'));

      const result = await pineconeService.upsertVectors(vectors, undefined, 100);

      expect(result.successCount).toBe(100);
      expect(result.failureCount).toBe(100);
      expect(result.errors).toHaveLength(100);
    });
  });

  describe('Vector Search', () => {
    const queryVector = new Array(1536).fill(0.1);

    it('should search vectors successfully', async () => {
      const mockMatches = [
        {
          id: 'result-1',
          score: 0.95,
          values: queryVector,
          metadata: { title: 'Result 1' }
        },
        {
          id: 'result-2',
          score: 0.85,
          values: queryVector,
          metadata: { title: 'Result 2' }
        }
      ];

      mockIndex.query.mockResolvedValue({ matches: mockMatches });

      const results = await pineconeService.searchVectors(queryVector);

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('result-1');
      expect(results[0]?.score).toBe(0.95);
      expect(mockIndex.query).toHaveBeenCalledWith({
        vector: queryVector,
        topK: 10,
        includeMetadata: true,
        includeValues: false,
        filter: undefined
      });
    });

    it('should search with custom options', async () => {
      const options: VectorSearchOptions = {
        topK: 5,
        filter: { category: 'tech' },
        includeValues: true,
        namespace: 'custom'
      };

      mockIndex.query.mockResolvedValue({ matches: [] });

      await pineconeService.searchVectors(queryVector, options);

      expect(mockIndex.namespace).toHaveBeenCalledWith('custom');
      expect(mockIndex.query).toHaveBeenCalledWith({
        vector: queryVector,
        topK: 5,
        filter: { category: 'tech' },
        includeMetadata: true,
        includeValues: true
      });
    });

    it('should handle search failure', async () => {
      mockIndex.query.mockRejectedValue(new Error('Search failed'));

      await expect(pineconeService.searchVectors(queryVector)).rejects.toThrow('Search failed');
    });
  });

  describe('Vector Deletion', () => {
    it('should delete vectors by IDs', async () => {
      const ids = ['vector-1', 'vector-2', 'vector-3'];
      mockIndex.deleteMany.mockResolvedValue({});

      await pineconeService.deleteVectors(ids);

      expect(mockIndex.deleteMany).toHaveBeenCalledWith(ids);
    });

    it('should delete all vectors in namespace', async () => {
      mockIndex.deleteAll.mockResolvedValue({});

      await pineconeService.deleteAllVectors('test-namespace');

      expect(mockIndex.namespace).toHaveBeenCalledWith('test-namespace');
      expect(mockIndex.deleteAll).toHaveBeenCalled();
    });

    it('should handle deletion failure', async () => {
      mockIndex.deleteMany.mockRejectedValue(new Error('Deletion failed'));

      await expect(pineconeService.deleteVectors(['test-id'])).rejects.toThrow('Deletion failed');
    });
  });

  describe('Vector Fetching', () => {
    it('should fetch vectors by IDs', async () => {
      const ids = ['vector-1', 'vector-2'];
      const mockRecords = {
        'vector-1': {
          values: new Array(1536).fill(0.1),
          metadata: { title: 'Vector 1' }
        },
        'vector-2': {
          values: new Array(1536).fill(0.2),
          metadata: { title: 'Vector 2' }
        }
      };

      mockIndex.fetch.mockResolvedValue({ records: mockRecords });

      const results = await pineconeService.fetchVectors(ids);

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('vector-1');
      expect(results[0]?.score).toBe(1.0);
      expect(results[0]?.metadata?.title).toBe('Vector 1');
    });

    it('should handle fetch failure', async () => {
      mockIndex.fetch.mockRejectedValue(new Error('Fetch failed'));

      await expect(pineconeService.fetchVectors(['test-id'])).rejects.toThrow('Fetch failed');
    });
  });

  describe('Index Statistics', () => {
    it('should get index statistics', async () => {
      const mockStats = {
        dimension: 1536,
        totalRecordCount: 1000,
        indexFullness: 0.1,
        namespaces: { default: { recordCount: 1000 } }
      };

      mockIndex.describeIndexStats.mockResolvedValue(mockStats);

      const stats = await pineconeService.getIndexStats();

      expect(stats).toEqual(mockStats);
      expect(mockIndex.describeIndexStats).toHaveBeenCalled();
    });

    it('should handle stats failure', async () => {
      mockIndex.describeIndexStats.mockRejectedValue(new Error('Stats failed'));

      await expect(pineconeService.getIndexStats()).rejects.toThrow('Stats failed');
    });
  });

  describe('Disconnection', () => {
    it('should disconnect gracefully', async () => {
      (pineconeService as any).isConnected = true;

      await pineconeService.disconnect();

      expect(pineconeService.isConnectionHealthy()).toBe(false);
    });
  });
});