/**
 * @fileoverview Database service for dependency injection
 *
 * Provides a service layer over database repositories and connections
 * for easy integration with the dependency injection container.
 *
 * @author AI Content Curator Team
 * @since 1.0.0
 */

import { Injectable } from '@container/Container';
import { BaseService } from '@services/index';
import logger from '@utils/logger';
import { DatabaseConnection, getDatabase } from './connection';
import { ContentRepository } from './repositories/content';

/**
 * Database service providing access to repositories and connection management
 */
@Injectable
export class DatabaseService extends BaseService {
  private connection: DatabaseConnection;

  private contentRepository: ContentRepository;

  constructor() {
    super();
    this.connection = getDatabase();
    this.contentRepository = new ContentRepository();
  }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    try {
      await this.connection.connect();
      logger.info('Database service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Close database connections
   */
  async shutdown(): Promise<void> {
    try {
      await this.connection.disconnect();
      logger.info('Database service shutdown complete');
    } catch (error) {
      logger.error('Error during database service shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get database connection for raw queries
   */
  getConnection(): DatabaseConnection {
    return this.connection;
  }

  /**
   * Get content repository
   */
  getContentRepository(): ContentRepository {
    return this.contentRepository;
  }

  /**
   * Health check for database connectivity
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    details: {
      connection: boolean;
      poolStatus: any;
    };
  }> {
    try {
      const connectionHealthy = await this.connection.healthCheck();
      const poolStatus = this.connection.getPoolStatus();

      return {
        healthy: connectionHealthy,
        details: {
          connection: connectionHealthy,
          poolStatus,
        },
      };
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        details: {
          connection: false,
          poolStatus: null,
        },
      };
    }
  }

  /**
   * Get database statistics
   */
  async getStatistics(): Promise<{
    totalContent: number;
    recentContent: number;
    poolStatus: any;
  }> {
    try {
      const [totalResult, recentResult] = await Promise.all([
        this.contentRepository.count(),
        this.connection.query<{ count: string }>(`
          SELECT COUNT(*) as count 
          FROM content 
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        `),
      ]);

      const poolStatus = this.connection.getPoolStatus();

      return {
        totalContent: totalResult,
        recentContent: parseInt(recentResult.rows[0].count, 10),
        poolStatus,
      };
    } catch (error) {
      logger.error('Error getting database statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
