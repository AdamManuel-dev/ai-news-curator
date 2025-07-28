/**
 * @fileoverview Pinecone vector database service for semantic search and content similarity
 * @lastmodified 2025-07-28T00:55:47Z
 * 
 * Features: Vector CRUD operations, semantic search, batch processing, health monitoring
 * Main APIs: PineconeService class, upsertVector(), searchVectors(), deleteVectors()
 * Constraints: Requires PINECONE_API_KEY, index must exist, 1536-dim vectors
 * Patterns: Singleton service, retry with backoff, metrics tracking, connection pooling
 */

import { Pinecone, Index, RecordMetadata } from '@pinecone-database/pinecone';
import { config } from '@config/index';
import logger from '@utils/logger';
import { 
  recordVectorOperation, 
  recordVectorSearchTime,
  updateComponentHealth
} from '@middleware/metrics';

/**
 * Vector record structure for content items
 */
export interface ContentVector {
  id: string;
  values: number[];
  metadata: {
    contentId: string;
    title: string;
    url: string;
    sourceId: string;
    sourceName: string;
    publishedAt: string;
    tags: string[];
    category: string;
    qualityScore: number;
    contentType: 'article' | 'blog' | 'news' | 'research';
    language: string;
    wordCount: number;
    readTime: number;
  };
}

/**
 * Search query options
 */
export interface VectorSearchOptions {
  topK?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
  includeValues?: boolean;
  namespace?: string;
}

/**
 * Search result structure
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  values?: number[];
  metadata?: ContentVector['metadata'];
}

/**
 * Batch operation result
 */
export interface BatchOperationResult {
  successCount: number;
  failureCount: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Pinecone vector database service
 * 
 * Handles all vector database operations for content similarity and semantic search.
 * Includes comprehensive error handling, metrics tracking, and connection management.
 */
export class PineconeService {
  private client: Pinecone;
  private index: Index<RecordMetadata>;
  private readonly indexName: string;
  private isConnected: boolean = false;
  private connectionRetryCount: number = 0;
  private readonly maxRetries: number = 3;

  constructor() {
    this.indexName = config.pineconeIndexName;
    
    if (!config.pineconeApiKey) {
      throw new Error('Pinecone API key is required but not provided');
    }

    this.client = new Pinecone({
      apiKey: config.pineconeApiKey,
    });

    this.index = this.client.index(this.indexName);
  }

  /**
   * Initialize connection to Pinecone and verify index exists
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to Pinecone vector database...', {
        indexName: this.indexName,
        environment: config.pineconeEnvironment
      });

      // Test connection by describing the index
      const indexStats = await this.index.describeIndexStats();
      
      logger.info('Successfully connected to Pinecone', {
        indexName: this.indexName,
        dimension: indexStats.dimension,
        totalRecordCount: indexStats.totalRecordCount,
        namespaces: Object.keys(indexStats.namespaces || {})
      });
      
      this.isConnected = true;
      this.connectionRetryCount = 0;
      updateComponentHealth('pinecone', true);
      recordVectorOperation('connect', true);
      
    } catch (error) {
      this.isConnected = false;
      updateComponentHealth('pinecone', false);
      recordVectorOperation('connect', false);
      
      logger.error('Failed to connect to Pinecone', {
        error: (error as Error).message,
        indexName: this.indexName,
        retryCount: this.connectionRetryCount
      });
      
      if (this.connectionRetryCount < this.maxRetries) {
        this.connectionRetryCount++;
        const retryDelay = Math.pow(2, this.connectionRetryCount) * 1000;
        
        logger.info(`Retrying Pinecone connection in ${retryDelay}ms...`, {
          retryCount: this.connectionRetryCount,
          maxRetries: this.maxRetries
        });
        
        setTimeout(() => this.connect(), retryDelay);
        return;
      }
      
      throw new Error(`Failed to connect to Pinecone after ${this.maxRetries} attempts: ${(error as Error).message}`);
    }
  }

  /**
   * Check if the service is connected and healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const startTime = Date.now();
      await this.index.describeIndexStats();
      const duration = (Date.now() - startTime) / 1000;
      
      recordVectorSearchTime(this.indexName, duration);
      updateComponentHealth('pinecone', true);
      
      return true;
    } catch (error) {
      logger.warn('Pinecone health check failed', {
        error: (error as Error).message
      });
      
      updateComponentHealth('pinecone', false);
      return false;
    }
  }

  /**
   * Upsert a single vector into the index
   */
  async upsertVector(vector: ContentVector, namespace?: string): Promise<void> {
    try {
      const startTime = Date.now();
      
      await this.index.namespace(namespace || '').upsert([{
        id: vector.id,
        values: vector.values,
        metadata: vector.metadata
      }]);
      
      const duration = (Date.now() - startTime) / 1000;
      recordVectorSearchTime(this.indexName, duration);
      recordVectorOperation('upsert', true);
      
      logger.debug('Vector upserted successfully', {
        id: vector.id,
        namespace: namespace || 'default',
        duration
      });
      
    } catch (error) {
      recordVectorOperation('upsert', false);
      logger.error('Failed to upsert vector', {
        error: (error as Error).message,
        vectorId: vector.id,
        namespace: namespace || 'default'
      });
      throw error;
    }
  }

  /**
   * Upsert multiple vectors in batch
   */
  async upsertVectors(vectors: ContentVector[], namespace?: string, batchSize: number = 100): Promise<BatchOperationResult> {
    const result: BatchOperationResult = {
      successCount: 0,
      failureCount: 0,
      errors: []
    };

    try {
      logger.info('Starting batch vector upsert', {
        totalVectors: vectors.length,
        batchSize,
        namespace: namespace || 'default'
      });

      // Process vectors in batches
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        
        try {
          const startTime = Date.now();
          
          await this.index.namespace(namespace || '').upsert(
            batch.map(vector => ({
              id: vector.id,
              values: vector.values,
              metadata: vector.metadata
            }))
          );
          
          const duration = (Date.now() - startTime) / 1000;
          recordVectorSearchTime(this.indexName, duration);
          recordVectorOperation('batch_upsert', true);
          
          result.successCount += batch.length;
          
          logger.debug('Batch upserted successfully', {
            batchNumber: Math.floor(i / batchSize) + 1,
            vectorsInBatch: batch.length,
            duration
          });
          
        } catch (error) {
          recordVectorOperation('batch_upsert', false);
          const errorMessage = (error as Error).message;
          
          // Add errors for each vector in the failed batch
          batch.forEach(vector => {
            result.errors.push({
              id: vector.id,
              error: errorMessage
            });
          });
          
          result.failureCount += batch.length;
          
          logger.error('Batch upsert failed', {
            batchNumber: Math.floor(i / batchSize) + 1,
            vectorsInBatch: batch.length,
            error: errorMessage
          });
        }
      }

      logger.info('Batch upsert completed', {
        totalVectors: vectors.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
        errorCount: result.errors.length
      });

    } catch (error) {
      logger.error('Batch upsert operation failed', {
        error: (error as Error).message,
        totalVectors: vectors.length
      });
      throw error;
    }

    return result;
  }

  /**
   * Search for similar vectors
   */
  async searchVectors(
    queryVector: number[], 
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    try {
      const startTime = Date.now();
      
      const searchOptions = {
        topK: options.topK || 10,
        filter: options.filter,
        includeMetadata: options.includeMetadata !== false,
        includeValues: options.includeValues || false,
      };

      const queryResponse = await this.index.namespace(options.namespace || '').query({
        vector: queryVector,
        ...searchOptions
      });

      const duration = (Date.now() - startTime) / 1000;
      recordVectorSearchTime(this.indexName, duration);
      recordVectorOperation('search', true);

      const results: VectorSearchResult[] = queryResponse.matches?.map(match => ({
        id: match.id,
        score: match.score || 0,
        values: match.values,
        metadata: match.metadata as ContentVector['metadata']
      })) || [];

      logger.debug('Vector search completed', {
        queryVector: queryVector.slice(0, 5), // Log first 5 dimensions for debugging
        topK: searchOptions.topK,
        resultsCount: results.length,
        duration,
        namespace: options.namespace || 'default'
      });

      return results;
      
    } catch (error) {
      recordVectorOperation('search', false);
      logger.error('Vector search failed', {
        error: (error as Error).message,
        options
      });
      throw error;
    }
  }

  /**
   * Delete vectors by IDs
   */
  async deleteVectors(ids: string[], namespace?: string): Promise<void> {
    try {
      const startTime = Date.now();
      
      await this.index.namespace(namespace || '').deleteMany(ids);
      
      const duration = (Date.now() - startTime) / 1000;
      recordVectorSearchTime(this.indexName, duration);
      recordVectorOperation('delete', true);
      
      logger.debug('Vectors deleted successfully', {
        deletedCount: ids.length,
        namespace: namespace || 'default',
        duration
      });
      
    } catch (error) {
      recordVectorOperation('delete', false);
      logger.error('Failed to delete vectors', {
        error: (error as Error).message,
        vectorIds: ids,
        namespace: namespace || 'default'
      });
      throw error;
    }
  }

  /**
   * Delete all vectors in a namespace
   */
  async deleteAllVectors(namespace?: string): Promise<void> {
    try {
      const startTime = Date.now();
      
      await this.index.namespace(namespace || '').deleteAll();
      
      const duration = (Date.now() - startTime) / 1000;
      recordVectorSearchTime(this.indexName, duration);
      recordVectorOperation('delete_all', true);
      
      logger.info('All vectors deleted from namespace', {
        namespace: namespace || 'default',
        duration
      });
      
    } catch (error) {
      recordVectorOperation('delete_all', false);
      logger.error('Failed to delete all vectors', {
        error: (error as Error).message,
        namespace: namespace || 'default'
      });
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<any> {
    try {
      const stats = await this.index.describeIndexStats();
      
      recordVectorOperation('stats', true);
      
      logger.debug('Retrieved index statistics', {
        totalRecordCount: stats.totalRecordCount,
        dimension: stats.dimension,
        indexFullness: stats.indexFullness,
        namespaces: Object.keys(stats.namespaces || {})
      });
      
      return stats;
      
    } catch (error) {
      recordVectorOperation('stats', false);
      logger.error('Failed to get index statistics', {
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Fetch vectors by IDs
   */
  async fetchVectors(ids: string[], namespace?: string): Promise<VectorSearchResult[]> {
    try {
      const startTime = Date.now();
      
      const fetchResponse = await this.index.namespace(namespace || '').fetch(ids);
      
      const duration = (Date.now() - startTime) / 1000;
      recordVectorSearchTime(this.indexName, duration);
      recordVectorOperation('fetch', true);

      const results: VectorSearchResult[] = Object.entries(fetchResponse.records || {}).map(([id, record]) => ({
        id,
        score: 1.0, // Fetch doesn't return scores
        values: record.values,
        metadata: record.metadata as ContentVector['metadata']
      }));

      logger.debug('Vectors fetched successfully', {
        requestedIds: ids,
        foundCount: results.length,
        duration,
        namespace: namespace || 'default'
      });

      return results;
      
    } catch (error) {
      recordVectorOperation('fetch', false);
      logger.error('Failed to fetch vectors', {
        error: (error as Error).message,
        vectorIds: ids,
        namespace: namespace || 'default'
      });
      throw error;
    }
  }

  /**
   * Close connection to Pinecone
   */
  async disconnect(): Promise<void> {
    try {
      this.isConnected = false;
      updateComponentHealth('pinecone', false);
      
      logger.info('Disconnected from Pinecone vector database');
      
    } catch (error) {
      logger.error('Error during Pinecone disconnection', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Get connection status
   */
  isConnectionHealthy(): boolean {
    return this.isConnected;
  }

  /**
   * Get index name
   */
  getIndexName(): string {
    return this.indexName;
  }
}

// Export singleton instance
export const pineconeService = new PineconeService();