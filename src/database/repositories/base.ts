/**
 * @fileoverview Base repository class with common database operations
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: CRUD operations, pagination, transactions, query building
 * Main APIs: BaseRepository abstract class, findById(), create(), update()
 * Constraints: Requires DatabaseConnection, BaseEntity interface
 * Patterns: Abstract base class, camelCase/snake_case conversion, SQL injection protection
 */

import { QueryResult, PoolClient } from 'pg';
import { DatabaseConnection, getDatabase } from '@database/connection';
import { BaseEntity, QueryOptions, PaginatedResult } from '@types/database';
import logger from '@utils/logger';

/**
 * Base repository class with common database operations
 */
export abstract class BaseRepository<T extends BaseEntity> {
  protected db: DatabaseConnection;

  protected tableName: string;

  constructor(tableName: string) {
    this.db = getDatabase();
    this.tableName = tableName;
  }

  /**
   * Find entity by ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
      const result = await this.db.query<T>(query, [id]);

      return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
    } catch (error) {
      logger.error(`Error finding ${this.tableName} by ID`, {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find multiple entities by IDs
   */
  async findByIds(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];

    try {
      const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
      const query = `SELECT * FROM ${this.tableName} WHERE id IN (${placeholders})`;
      const result = await this.db.query<T>(query, ids);

      return result.rows.map((row) => this.mapRowToEntity(row));
    } catch (error) {
      logger.error(`Error finding ${this.tableName} by IDs`, {
        count: ids.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find all entities with optional filtering and pagination
   */
  async findAll(options: QueryOptions = {}): Promise<PaginatedResult<T>> {
    try {
      const { limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' } = options;

      // Count total records
      const countQuery = `SELECT COUNT(*) as total FROM ${this.tableName}`;
      const countResult = await this.db.query<{ total: string }>(countQuery);
      const total = parseInt(countResult.rows[0].total, 10);

      // Get paginated results
      const query = `
        SELECT * FROM ${this.tableName}
        ORDER BY ${this.sanitizeColumnName(sortBy)} ${sortOrder}
        LIMIT $1 OFFSET $2
      `;
      const result = await this.db.query<T>(query, [limit, offset]);

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
      logger.error(`Error finding all ${this.tableName}`, {
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create a new entity
   */
  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    try {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(',');

      const query = `
        INSERT INTO ${this.tableName} (${columns.map((col) => this.camelToSnake(col)).join(',')})
        VALUES (${placeholders})
        RETURNING *
      `;

      const result = await this.db.query<T>(query, values);

      if (result.rows.length === 0) {
        throw new Error(`Failed to create ${this.tableName} record`);
      }

      const created = this.mapRowToEntity(result.rows[0]);

      logger.info(`Created ${this.tableName}`, {
        id: created.id,
        table: this.tableName,
      });

      return created;
    } catch (error) {
      logger.error(`Error creating ${this.tableName}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update an existing entity
   */
  async update(
    id: string,
    data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<T | null> {
    try {
      const columns = Object.keys(data);
      const values = Object.values(data);

      if (columns.length === 0) {
        return this.findById(id);
      }

      const setClause = columns
        .map((col, index) => `${this.camelToSnake(col)} = $${index + 1}`)
        .join(',');

      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}, updated_at = NOW()
        WHERE id = $${values.length + 1}
        RETURNING *
      `;

      const result = await this.db.query<T>(query, [...values, id]);

      if (result.rows.length === 0) {
        return null;
      }

      const updated = this.mapRowToEntity(result.rows[0]);

      logger.info(`Updated ${this.tableName}`, {
        id: updated.id,
        table: this.tableName,
        fields: columns,
      });

      return updated;
    } catch (error) {
      logger.error(`Error updating ${this.tableName}`, {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete an entity by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
      const result = await this.db.query(query, [id]);

      const deleted = (result.rowCount || 0) > 0;

      if (deleted) {
        logger.info(`Deleted ${this.tableName}`, {
          id,
          table: this.tableName,
        });
      }

      return deleted;
    } catch (error) {
      logger.error(`Error deleting ${this.tableName}`, {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check if entity exists by ID
   */
  async exists(id: string): Promise<boolean> {
    try {
      const query = `SELECT 1 FROM ${this.tableName} WHERE id = $1 LIMIT 1`;
      const result = await this.db.query(query, [id]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error checking ${this.tableName} existence`, {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Count total records
   */
  async count(): Promise<number> {
    try {
      const query = `SELECT COUNT(*) as total FROM ${this.tableName}`;
      const result = await this.db.query<{ total: string }>(query);
      return parseInt(result.rows[0].total, 10);
    } catch (error) {
      logger.error(`Error counting ${this.tableName}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Execute a raw query
   */
  protected async query<R = unknown>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
    return this.db.query<R>(text, params);
  }

  /**
   * Execute within a transaction
   */
  protected async withTransaction<R>(callback: (client: PoolClient) => Promise<R>): Promise<R> {
    return this.db.withTransaction(callback);
  }

  /**
   * Map database row to entity (override in subclasses for custom mapping)
   */
  protected mapRowToEntity(row: any): T {
    return this.snakeToCamelKeys(row) as T;
  }

  /**
   * Convert camelCase to snake_case
   */
  protected camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert snake_case to camelCase
   */
  protected snakeToCamel(str: string): string {
    return str.replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace('-', '').replace('_', '')
    );
  }

  /**
   * Convert all keys in object from snake_case to camelCase
   */
  protected snakeToCamelKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.snakeToCamelKeys(item));
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = this.snakeToCamel(key);
      result[camelKey] = this.snakeToCamelKeys(value);
    }
    return result;
  }

  /**
   * Sanitize column name to prevent SQL injection
   */
  protected sanitizeColumnName(columnName: string): string {
    // Convert camelCase to snake_case and validate
    const snakeCase = this.camelToSnake(columnName);

    // Only allow alphanumeric characters and underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(snakeCase)) {
      throw new Error(`Invalid column name: ${columnName}`);
    }

    return snakeCase;
  }

  /**
   * Build WHERE clause from filters
   */
  protected buildWhereClause(
    filters: Record<string, unknown>,
    startParam = 1
  ): { clause: string; params: unknown[]; nextParam: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = startParam;

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;

      const columnName = this.camelToSnake(key);

      if (Array.isArray(value)) {
        if (value.length > 0) {
          const placeholders = value.map(() => `$${paramIndex++}`).join(',');
          conditions.push(`${columnName} IN (${placeholders})`);
          params.push(...value);
        }
      } else {
        conditions.push(`${columnName} = $${paramIndex++}`);
        params.push(value);
      }
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { clause, params, nextParam: paramIndex };
  }
}
