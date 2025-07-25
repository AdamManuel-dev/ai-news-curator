/**
 * @fileoverview Auditable repository base class
 * 
 * Extends BaseRepository with audit logging capabilities for tracking
 * data changes, user actions, and compliance requirements.
 */

import { BaseRepository } from '@database/repositories/base';
import { container, LOGGER } from '@container/index';
import type { BaseEntity, QueryOptions } from '@types/database';
import type { AuditLogEntry } from '@types/service';
import type { PoolClient } from 'pg';
import type { Logger } from 'winston';

export interface AuditContext {
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface AuditableEntity extends BaseEntity {
  createdBy?: string;
  updatedBy?: string;
  version?: number;
}

export abstract class AuditableRepository<T extends AuditableEntity> extends BaseRepository<T> {
  protected logger: Logger;
  private auditTableName: string;

  constructor(tableName: string, auditTableName?: string) {
    super(tableName);
    this.logger = container.resolve<Logger>(LOGGER);
    this.auditTableName = auditTableName || `${tableName}_audit`;
  }

  /**
   * Create entity with audit trail
   */
  async createWithAudit(
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
    auditContext?: AuditContext
  ): Promise<T> {
    return this.withTransaction(async (client) => {
      // Create the entity
      const created = await this.createInTransaction(client, {
        ...data,
        createdBy: auditContext?.userId,
        updatedBy: auditContext?.userId,
        version: 1,
      } as any);

      // Record audit log
      await this.recordAuditLog(client, {
        tableName: this.tableName,
        entityId: created.id,
        action: 'CREATE',
        userId: auditContext?.userId,
        changes: data,
        timestamp: new Date(),
        metadata: this.enrichAuditMetadata(auditContext),
      });

      this.logger.info('Entity created with audit', {
        tableName: this.tableName,
        entityId: created.id,
        userId: auditContext?.userId,
      });

      return created;
    });
  }

  /**
   * Update entity with audit trail
   */
  async updateWithAudit(
    id: string,
    data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
    auditContext?: AuditContext
  ): Promise<T | null> {
    return this.withTransaction(async (client) => {
      // Get current entity for comparison
      const currentEntity = await this.findByIdInTransaction(client, id);
      if (!currentEntity) {
        return null;
      }

      // Increment version for optimistic locking
      const updateData = {
        ...data,
        updatedBy: auditContext?.userId,
        version: (currentEntity.version || 0) + 1,
      } as any;

      // Update the entity
      const updated = await this.updateInTransaction(client, id, updateData);
      if (!updated) {
        return null;
      }

      // Calculate changes
      const changes = this.calculateChanges(currentEntity, updated);

      // Record audit log only if there are actual changes
      if (Object.keys(changes).length > 0) {
        await this.recordAuditLog(client, {
          tableName: this.tableName,
          entityId: id,
          action: 'UPDATE',
          userId: auditContext?.userId,
          changes,
          timestamp: new Date(),
          metadata: this.enrichAuditMetadata(auditContext),
        });

        this.logger.info('Entity updated with audit', {
          tableName: this.tableName,
          entityId: id,
          userId: auditContext?.userId,
          changesCount: Object.keys(changes).length,
        });
      }

      return updated;
    });
  }

  /**
   * Delete entity with audit trail (soft delete)
   */
  async deleteWithAudit(
    id: string,
    auditContext?: AuditContext
  ): Promise<boolean> {
    return this.withTransaction(async (client) => {
      // Get current entity
      const currentEntity = await this.findByIdInTransaction(client, id);
      if (!currentEntity) {
        return false;
      }

      // Perform soft delete by updating deleted_at timestamp
      const deleteData = {
        deletedAt: new Date(),
        updatedBy: auditContext?.userId,
        version: (currentEntity.version || 0) + 1,
      };

      const updated = await this.updateInTransaction(client, id, deleteData as any);
      if (!updated) {
        return false;
      }

      // Record audit log
      await this.recordAuditLog(client, {
        tableName: this.tableName,
        entityId: id,
        action: 'DELETE',
        userId: auditContext?.userId,
        changes: { deletedAt: deleteData.deletedAt },
        timestamp: new Date(),
        metadata: this.enrichAuditMetadata(auditContext),
      });

      this.logger.info('Entity deleted with audit', {
        tableName: this.tableName,
        entityId: id,
        userId: auditContext?.userId,
      });

      return true;
    });
  }

  /**
   * Get audit history for an entity
   */
  async getAuditHistory(
    entityId: string,
    options?: QueryOptions
  ): Promise<AuditLogEntry[]> {
    try {
      const { limit = 50, offset = 0, orderBy = 'timestamp', orderDirection = 'DESC' } = options || {};
      
      const query = `
        SELECT * FROM ${this.auditTableName}
        WHERE entity_id = $1
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [entityId, limit, offset]);
      return result.rows.map(row => this.mapRowToAuditEntry(row));
    } catch (error) {
      this.logger.error('Error fetching audit history', {
        tableName: this.tableName,
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get audit summary for date range
   */
  async getAuditSummary(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByUser: Record<string, number>;
    actionsByDay: Array<{ date: string; count: number }>;
  }> {
    try {
      const params: any[] = [startDate, endDate];
      let userFilter = '';
      
      if (userId) {
        userFilter = 'AND user_id = $3';
        params.push(userId);
      }

      const query = `
        SELECT 
          COUNT(*) as total_actions,
          action,
          user_id,
          DATE(timestamp) as action_date
        FROM ${this.auditTableName}
        WHERE timestamp >= $1 AND timestamp <= $2 ${userFilter}
        GROUP BY action, user_id, DATE(timestamp)
        ORDER BY action_date DESC
      `;

      const result = await this.db.query(query, params);
      
      // Process results
      const totalActions = result.rows.reduce((sum, row) => sum + parseInt(row.total_actions || '0'), 0);
      const actionsByType: Record<string, number> = {};
      const actionsByUser: Record<string, number> = {};
      const actionsByDay: Record<string, number> = {};

      result.rows.forEach(row => {
        const count = parseInt(row.total_actions || '0');
        const action = row.action || 'unknown';
        const userId = row.user_id || 'anonymous';
        const date = row.action_date || 'unknown';

        actionsByType[action] = (actionsByType[action] || 0) + count;
        actionsByUser[userId] = (actionsByUser[userId] || 0) + count;
        actionsByDay[date] = (actionsByDay[date] || 0) + count;
      });

      return {
        totalActions,
        actionsByType,
        actionsByUser,
        actionsByDay: Object.entries(actionsByDay).map(([date, count]) => ({ date, count })),
      };
    } catch (error) {
      this.logger.error('Error generating audit summary', {
        tableName: this.tableName,
        startDate,
        endDate,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Find entities with their audit counts
   */
  async findWithAuditCounts(options?: QueryOptions): Promise<Array<T & { auditCount: number }>> {
    try {
      const { limit = 20, offset = 0 } = options || {};
      
      const query = `
        SELECT 
          e.*,
          COALESCE(a.audit_count, 0) as audit_count
        FROM ${this.tableName} e
        LEFT JOIN (
          SELECT entity_id, COUNT(*) as audit_count
          FROM ${this.auditTableName}
          GROUP BY entity_id
        ) a ON e.id = a.entity_id
        WHERE e.deleted_at IS NULL
        ORDER BY e.updated_at DESC
        LIMIT $1 OFFSET $2
      `;

      const result = await this.db.query(query, [limit, offset]);
      return result.rows.map(row => ({
        ...this.mapRowToEntity(row),
        auditCount: parseInt(row.audit_count || '0'),
      }));
    } catch (error) {
      this.logger.error('Error finding entities with audit counts', {
        tableName: this.tableName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record audit log entry
   */
  private async recordAuditLog(
    client: PoolClient,
    auditEntry: Omit<AuditLogEntry, 'id'>
  ): Promise<void> {
    const query = `
      INSERT INTO ${this.auditTableName} (
        table_name, entity_id, action, user_id, changes, timestamp, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const params = [
      auditEntry.tableName,
      auditEntry.entityId,
      auditEntry.action,
      auditEntry.userId,
      JSON.stringify(auditEntry.changes || {}),
      auditEntry.timestamp,
      JSON.stringify(auditEntry.metadata || {}),
    ];

    await client.query(query, params);
  }

  /**
   * Calculate changes between two entities
   */
  private calculateChanges(before: T, after: T): Record<string, { before: any; after: any }> {
    const changes: Record<string, { before: any; after: any }> = {};
    
    // Compare all properties except metadata fields
    const excludeFields = ['updatedAt', 'version'];
    
    Object.keys(after).forEach(key => {
      if (excludeFields.includes(key)) {
        return;
      }

      const beforeValue = (before as any)[key];
      const afterValue = (after as any)[key];

      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes[key] = { before: beforeValue, after: afterValue };
      }
    });

    return changes;
  }

  /**
   * Enrich audit metadata with additional context
   */
  private enrichAuditMetadata(context?: AuditContext): Record<string, any> {
    return {
      timestamp: new Date().toISOString(),
      sessionId: context?.sessionId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      reason: context?.reason,
      ...context?.metadata,
    };
  }

  /**
   * Map database row to audit entry
   */
  private mapRowToAuditEntry(row: any): AuditLogEntry {
    return {
      id: row.id,
      tableName: row.table_name,
      entityId: row.entity_id,
      action: row.action,
      userId: row.user_id,
      changes: row.changes ? JSON.parse(row.changes) : {},
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    };
  }

  /**
   * Create audit table if it doesn't exist
   */
  async createAuditTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.auditTableName} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_name VARCHAR(255) NOT NULL,
        entity_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        user_id UUID,
        changes JSONB,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        metadata JSONB,
        
        INDEX idx_${this.auditTableName}_entity_id (entity_id),
        INDEX idx_${this.auditTableName}_user_id (user_id),
        INDEX idx_${this.auditTableName}_timestamp (timestamp),
        INDEX idx_${this.auditTableName}_action (action)
      )
    `;

    try {
      await this.db.query(query);
      this.logger.info('Audit table created or verified', { auditTable: this.auditTableName });
    } catch (error) {
      this.logger.error('Error creating audit table', {
        auditTable: this.auditTableName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}