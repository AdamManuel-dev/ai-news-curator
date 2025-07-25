/**
 * @fileoverview Vector database services index
 * 
 * Central export point for all vector database services including:
 * - Pinecone service for semantic search
 * - Vector operation interfaces and types
 * - Service abstractions for different vector DB providers
 * 
 * @module services/vectordb
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