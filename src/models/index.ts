/**
 * @fileoverview Database model interfaces and base types
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Base model interface, content model definition
 * Main APIs: DatabaseModel, ContentModel interfaces
 * Constraints: String ID requirement, Date object timestamps, limited model types
 * Patterns: Interface inheritance, standardized entity structure, typed content types
 */

export interface DatabaseModel {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentModel extends DatabaseModel {
  url: string;
  title: string;
  summary: string;
  author: string;
  source: string;
  publishDate: Date;
  contentType: 'article' | 'paper' | 'tutorial' | 'news';
  qualityScore: number;
  tags: string[];
  embedding?: number[];
}
