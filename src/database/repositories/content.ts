/**
 * @fileoverview Content repository with advanced search and filtering capabilities
 *
 * Handles content storage, retrieval, and complex queries including full-text search,
 * quality filtering, and tag-based filtering.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import {
  Content,
  ContentFilters,
  QueryOptions,
  PaginatedResult,
  CreateContentInput,
  UpdateContentInput,
  SearchResult,
  ContentAnalytics,
  ContentType,
  TechnicalDepth,
} from '@types/database';
import logger from '@utils/logger';
import { BaseRepository } from './base';

export class ContentRepository extends BaseRepository<Content> {
  constructor() {
    super('content');
  }

  /**
   * Create content with automatic duplicate detection
   */
  async createContent(data: CreateContentInput): Promise<Content> {
    try {
      // Check for duplicate URL
      const existing = await this.findByUrl(data.url);
      if (existing) {
        throw new Error(`Content with URL already exists: ${data.url}`);
      }

      return await this.create(data as any);
    } catch (error) {
      logger.error('Error creating content', {
        url: data.url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update content with validation
   */
  async updateContent(id: string, data: Omit<UpdateContentInput, 'id'>): Promise<Content | null> {
    try {
      // If URL is being updated, check for duplicates
      if (data.url) {
        const existing = await this.findByUrl(data.url);
        if (existing && existing.id !== id) {
          throw new Error(`Content with URL already exists: ${data.url}`);
        }
      }

      return await this.update(id, data);
    } catch (error) {
      logger.error('Error updating content', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find content by URL
   */
  async findByUrl(url: string): Promise<Content | null> {
    try {
      const query = 'SELECT * FROM content WHERE url = $1';
      const result = await this.query<Content>(query, [url]);

      return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error finding content by URL', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find content with advanced filtering
   */
  async findWithFilters(
    filters: ContentFilters,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<Content>> {
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
        includeTags = false,
        includeAuthor = false,
        includeSource = false,
      } = options;

      // Build WHERE clause
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      // Filter by source IDs
      if (filters.sourceIds && filters.sourceIds.length > 0) {
        const placeholders = filters.sourceIds.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`c.source_id IN (${placeholders})`);
        params.push(...filters.sourceIds);
      }

      // Filter by author IDs
      if (filters.authorIds && filters.authorIds.length > 0) {
        const placeholders = filters.authorIds.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`c.author_id IN (${placeholders})`);
        params.push(...filters.authorIds);
      }

      // Filter by content types
      if (filters.contentTypes && filters.contentTypes.length > 0) {
        const placeholders = filters.contentTypes.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`c.content_type IN (${placeholders})`);
        params.push(...filters.contentTypes);
      }

      // Filter by technical depths
      if (filters.technicalDepths && filters.technicalDepths.length > 0) {
        const placeholders = filters.technicalDepths.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`c.technical_depth IN (${placeholders})`);
        params.push(...filters.technicalDepths);
      }

      // Filter by minimum quality score
      if (filters.minQualityScore !== undefined) {
        conditions.push(`c.quality_score >= $${paramIndex++}`);
        params.push(filters.minQualityScore);
      }

      // Filter by publish date range
      if (filters.publishDateFrom) {
        conditions.push(`c.publish_date >= $${paramIndex++}`);
        params.push(filters.publishDateFrom);
      }

      if (filters.publishDateTo) {
        conditions.push(`c.publish_date <= $${paramIndex++}`);
        params.push(filters.publishDateTo);
      }

      // Filter by code examples
      if (filters.hasCodeExamples !== undefined) {
        conditions.push(`c.has_code_examples = $${paramIndex++}`);
        params.push(filters.hasCodeExamples);
      }

      // Filter by visuals
      if (filters.hasVisuals !== undefined) {
        conditions.push(`c.has_visuals = $${paramIndex++}`);
        params.push(filters.hasVisuals);
      }

      // Filter by language codes
      if (filters.languageCodes && filters.languageCodes.length > 0) {
        const placeholders = filters.languageCodes.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`c.language_code IN (${placeholders})`);
        params.push(...filters.languageCodes);
      }

      // Filter by tags
      if (filters.tagIds && filters.tagIds.length > 0) {
        const placeholders = filters.tagIds.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`
          EXISTS (
            SELECT 1 FROM content_tags ct 
            WHERE ct.content_id = c.id AND ct.tag_id IN (${placeholders})
          )
        `);
        params.push(...filters.tagIds);
      }

      // Full-text search
      if (filters.search) {
        conditions.push(`c.search_vector @@ plainto_tsquery('english', $${paramIndex++})`);
        params.push(filters.search);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Build JOIN clauses
      const joins: string[] = [];
      const selectFields = ['c.*'];

      if (includeAuthor) {
        joins.push('LEFT JOIN authors a ON c.author_id = a.id');
        selectFields.push(
          'a.name as author_name',
          'a.email as author_email',
          'a.reputation as author_reputation'
        );
      }

      if (includeSource) {
        joins.push('LEFT JOIN sources s ON c.source_id = s.id');
        selectFields.push(
          's.name as source_name',
          's.type as source_type',
          's.reputation as source_reputation'
        );
      }

      if (includeTags) {
        joins.push(`
          LEFT JOIN (
            SELECT ct.content_id, 
                   JSON_AGG(JSON_BUILD_OBJECT(
                     'id', t.id,
                     'name', t.name,
                     'category', t.category,
                     'confidence', ct.confidence
                   )) as tags
            FROM content_tags ct
            JOIN tags t ON ct.tag_id = t.id
            GROUP BY ct.content_id
          ) tag_data ON c.id = tag_data.content_id
        `);
        selectFields.push('tag_data.tags');
      }

      const joinClause = joins.join(' ');

      // Count query
      const countQuery = `
        SELECT COUNT(DISTINCT c.id) as total
        FROM content c
        ${joinClause}
        ${whereClause}
      `;
      const countResult = await this.query<{ total: string }>(countQuery, params);
      const total = parseInt(countResult.rows[0].total, 10);

      // Main query
      const orderBy = this.sanitizeColumnName(sortBy);
      const query = `
        SELECT ${selectFields.join(', ')}
        FROM content c
        ${joinClause}
        ${whereClause}
        ORDER BY c.${orderBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      const result = await this.query<any>(query, [...params, limit, offset]);
      const data = result.rows.map((row) => this.mapRowToEntity(row));

      const page = Math.floor(offset / limit) + 1;

      return {
        data,
        total,
        page,
        pageSize: limit,
        hasNext: offset + limit < total,
        hasPrevious: offset > 0,
      };
    } catch (error) {
      logger.error('Error finding content with filters', {
        filters,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Full-text search with ranking
   */
  async search(
    searchText: string,
    filters: ContentFilters = {},
    options: QueryOptions = {}
  ): Promise<PaginatedResult<SearchResult>> {
    try {
      const { limit = 50, offset = 0 } = options;

      // Build base filters
      const {
        clause: filterClause,
        params: filterParams,
        nextParam,
      } = this.buildWhereClause(filters, 2);

      // Add search condition
      const searchCondition = `c.search_vector @@ plainto_tsquery('english', $1)`;
      const whereClause = filterClause
        ? `WHERE ${searchCondition} AND ${filterClause.replace('WHERE ', '')}`
        : `WHERE ${searchCondition}`;

      // Count query
      const countQuery = `
        SELECT COUNT(*) as total
        FROM content c
        ${whereClause}
      `;
      const countResult = await this.query<{ total: string }>(countQuery, [
        searchText,
        ...filterParams,
      ]);
      const total = parseInt(countResult.rows[0].total, 10);

      // Main search query with ranking
      const query = `
        SELECT c.*,
               ts_rank(c.search_vector, plainto_tsquery('english', $1)) as score,
               ts_headline('english', c.title, plainto_tsquery('english', $1)) as highlighted_title,
               ts_headline('english', COALESCE(c.summary, ''), plainto_tsquery('english', $1)) as highlighted_summary
        FROM content c
        ${whereClause}
        ORDER BY score DESC, c.publish_date DESC
        LIMIT $${nextParam} OFFSET $${nextParam + 1}
      `;

      const result = await this.query<any>(query, [searchText, ...filterParams, limit, offset]);

      const data: SearchResult[] = result.rows.map((row) => ({
        content: this.mapRowToEntity(row),
        score: parseFloat(row.score),
        highlightedTitle: row.highlighted_title,
        highlightedSummary: row.highlighted_summary,
        relevantTags: [], // TODO: Add relevant tags based on search
      }));

      const page = Math.floor(offset / limit) + 1;

      return {
        data,
        total,
        page,
        pageSize: limit,
        hasNext: offset + limit < total,
        hasPrevious: offset > 0,
      };
    } catch (error) {
      logger.error('Error searching content', {
        searchText,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get content analytics
   */
  async getAnalytics(): Promise<ContentAnalytics> {
    try {
      // Total content count
      const totalResult = await this.query<{ total: string }>(
        'SELECT COUNT(*) as total FROM content'
      );
      const totalContent = parseInt(totalResult.rows[0].total, 10);

      // Content by type
      const typeResult = await this.query<{ content_type: ContentType; count: string }>(`
        SELECT content_type, COUNT(*) as count 
        FROM content 
        GROUP BY content_type
      `);
      const contentByType = typeResult.rows.reduce(
        (acc, row) => {
          acc[row.content_type] = parseInt(row.count, 10);
          return acc;
        },
        {} as Record<ContentType, number>
      );

      // Content by depth
      const depthResult = await this.query<{ technical_depth: TechnicalDepth; count: string }>(`
        SELECT technical_depth, COUNT(*) as count 
        FROM content 
        WHERE technical_depth IS NOT NULL
        GROUP BY technical_depth
      `);
      const contentByDepth = depthResult.rows.reduce(
        (acc, row) => {
          acc[row.technical_depth] = parseInt(row.count, 10);
          return acc;
        },
        {} as Record<TechnicalDepth, number>
      );

      // Average quality score
      const qualityResult = await this.query<{ avg_score: string }>(`
        SELECT AVG(quality_score) as avg_score FROM content
      `);
      const avgQualityScore = parseFloat(qualityResult.rows[0].avg_score || '0');

      // Top tags (simplified - would need proper join)
      const topTags: Array<{ tag: any; count: number }> = [];

      // Top authors (simplified - would need proper join)
      const topAuthors: Array<{ author: any; count: number }> = [];

      // Top sources (simplified - would need proper join)
      const topSources: Array<{ source: any; count: number }> = [];

      // Content by date (last 30 days)
      const dateResult = await this.query<{ date: string; count: string }>(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM content
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `);
      const contentByDate = dateResult.rows.map((row) => ({
        date: row.date,
        count: parseInt(row.count, 10),
      }));

      return {
        totalContent,
        contentByType,
        contentByDepth,
        avgQualityScore,
        topTags,
        topAuthors,
        topSources,
        contentByDate,
      };
    } catch (error) {
      logger.error('Error getting content analytics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get trending content (high quality, recent, high engagement)
   */
  async getTrending(limit = 20): Promise<Content[]> {
    try {
      const query = `
        SELECT c.*,
               (c.quality_score * 0.4 + 
                EXTRACT(EPOCH FROM (NOW() - c.created_at)) / -86400 * 0.3 + 
                COALESCE(interaction_score, 0) * 0.3) as trend_score
        FROM content c
        LEFT JOIN (
          SELECT content_id, 
                 COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(timestamp))) / 86400, 1) as interaction_score
          FROM user_interactions
          WHERE timestamp >= NOW() - INTERVAL '7 days'
          GROUP BY content_id
        ) interactions ON c.id = interactions.content_id
        WHERE c.created_at >= NOW() - INTERVAL '30 days'
          AND c.quality_score >= 0.6
        ORDER BY trend_score DESC
        LIMIT $1
      `;

      const result = await this.query<Content>(query, [limit]);
      return result.rows.map((row) => this.mapRowToEntity(row));
    } catch (error) {
      logger.error('Error getting trending content', {
        limit,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Bulk insert content items
   */
  async bulkCreate(contentItems: CreateContentInput[]): Promise<Content[]> {
    if (contentItems.length === 0) return [];

    try {
      return await this.withTransaction(async (client) => {
        const results: Content[] = [];

        for (const item of contentItems) {
          // Check for duplicates
          const existingQuery = 'SELECT id FROM content WHERE url = $1';
          const existingResult = await client.query(existingQuery, [item.url]);

          if (existingResult.rows.length === 0) {
            const columns = Object.keys(item);
            const values = Object.values(item);
            const placeholders = values.map((_, index) => `$${index + 1}`).join(',');

            const insertQuery = `
              INSERT INTO content (${columns.map((col) => this.camelToSnake(col)).join(',')})
              VALUES (${placeholders})
              RETURNING *
            `;

            const insertResult = await client.query<Content>(insertQuery, values);
            if (insertResult.rows.length > 0) {
              results.push(this.mapRowToEntity(insertResult.rows[0]));
            }
          }
        }

        logger.info('Bulk created content', {
          attempted: contentItems.length,
          created: results.length,
        });

        return results;
      });
    } catch (error) {
      logger.error('Error bulk creating content', {
        count: contentItems.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
