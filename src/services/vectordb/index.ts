/**
 * @fileoverview Vector database services index and main exports
 * @lastmodified 2025-07-28T00:55:47Z
 * 
 * Features: Centralized exports, service abstractions, type definitions
 * Main APIs: vectorDbService (Pinecone), ContentVector, VectorSearchOptions
 * Constraints: Requires Pinecone configuration, single provider implementation
 * Patterns: Facade pattern, re-export strategy, default service selection
 */

export * from './pinecone';
export { pineconeService as vectorDbService } from './pinecone';

// Re-export types for easier imports
export type { 
  ContentVector, 
  VectorSearchOptions, 
  VectorSearchResult, 
  BatchOperationResult 
} from './pinecone';