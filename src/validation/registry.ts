/**
 * @fileoverview Schema registry for validation schemas
 * 
 * Provides centralized management of validation schemas with caching,
 * performance tracking, and composition capabilities.
 */

import { z } from 'zod';
import type { 
  SchemaRegistry, 
  ValidationSchema, 
  CompiledSchema,
  ValidationMetrics 
} from '@types/validation';
import logger from '@utils/logger';

/**
 * Centralized registry for managing validation schemas
 */
export class ValidationSchemaRegistry implements SchemaRegistry {
  private schemas = new Map<string, CompiledSchema>();
  private metrics: ValidationMetrics = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    averageValidationTime: 0,
    schemaCompilationTime: 0,
  };

  /**
   * Register a validation schema
   */
  register(name: string, schema: ValidationSchema): void {
    const startTime = Date.now();
    
    try {
      // Pre-compile the schema for better performance
      const compiledSchema: CompiledSchema = {
        schema,
        compiledAt: new Date(),
        usageCount: 0,
        lastUsed: new Date(),
      };

      this.schemas.set(name, compiledSchema);
      
      const compilationTime = Date.now() - startTime;
      this.metrics.schemaCompilationTime += compilationTime;
      
      logger.debug('Schema registered', { 
        name, 
        compilationTime,
        totalSchemas: this.schemas.size 
      });
    } catch (error) {
      logger.error('Failed to register schema', { 
        name, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw new Error(`Failed to register schema '${name}': ${error}`);
    }
  }

  /**
   * Get a validation schema by name
   */
  get(name: string): ValidationSchema | undefined {
    const compiledSchema = this.schemas.get(name);
    
    if (compiledSchema) {
      // Update usage statistics
      compiledSchema.usageCount++;
      compiledSchema.lastUsed = new Date();
      
      return compiledSchema.schema;
    }

    return undefined;
  }

  /**
   * Get all registered schemas
   */
  getAll(): Record<string, ValidationSchema> {
    const result: Record<string, ValidationSchema> = {};
    
    for (const [name, compiledSchema] of this.schemas.entries()) {
      result[name] = compiledSchema.schema;
    }
    
    return result;
  }

  /**
   * Check if a schema exists
   */
  has(name: string): boolean {
    return this.schemas.has(name);
  }

  /**
   * Remove a schema from the registry
   */
  unregister(name: string): boolean {
    const removed = this.schemas.delete(name);
    
    if (removed) {
      logger.debug('Schema unregistered', { name, remainingSchemas: this.schemas.size });
    }
    
    return removed;
  }

  /**
   * Clear all schemas
   */
  clear(): void {
    this.schemas.clear();
    logger.debug('All schemas cleared from registry');
  }

  /**
   * Get schema usage statistics
   */
  getSchemaStats(name: string): CompiledSchema | undefined {
    return this.schemas.get(name);
  }

  /**
   * Get overall validation metrics
   */
  getMetrics(): ValidationMetrics {
    return { ...this.metrics };
  }

  /**
   * Record validation attempt
   */
  recordValidation(success: boolean, duration: number): void {
    this.metrics.totalValidations++;
    
    if (success) {
      this.metrics.successfulValidations++;
    } else {
      this.metrics.failedValidations++;
    }

    // Update average validation time
    const totalTime = this.metrics.averageValidationTime * (this.metrics.totalValidations - 1) + duration;
    this.metrics.averageValidationTime = totalTime / this.metrics.totalValidations;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      averageValidationTime: 0,
      schemaCompilationTime: 0,
    };
    
    logger.debug('Validation metrics reset');
  }

  /**
   * Get schemas sorted by usage
   */
  getSchemasByUsage(): Array<{ name: string; usageCount: number; lastUsed: Date }> {
    return Array.from(this.schemas.entries())
      .map(([name, schema]) => ({
        name,
        usageCount: schema.usageCount,
        lastUsed: schema.lastUsed,
      }))
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Cleanup unused schemas
   */
  cleanupUnused(maxAge: number = 7 * 24 * 60 * 60 * 1000): number { // 7 days default
    const now = Date.now();
    let removedCount = 0;

    for (const [name, schema] of this.schemas.entries()) {
      const ageMs = now - schema.lastUsed.getTime();
      
      if (ageMs > maxAge && schema.usageCount === 0) {
        this.schemas.delete(name);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info('Cleaned up unused schemas', { 
        removedCount, 
        remainingSchemas: this.schemas.size 
      });
    }

    return removedCount;
  }

  /**
   * Compose multiple schemas into one
   */
  compose(name: string, schemaNames: string[]): ValidationSchema {
    const schemas = schemaNames.map(schemaName => {
      const schema = this.get(schemaName);
      if (!schema) {
        throw new Error(`Schema '${schemaName}' not found in registry`);
      }
      return schema;
    });

    // Compose schemas using Zod's merge functionality
    let composedSchema = schemas[0];
    
    for (let i = 1; i < schemas.length; i++) {
      if (composedSchema instanceof z.ZodObject && schemas[i] instanceof z.ZodObject) {
        composedSchema = composedSchema.merge(schemas[i] as z.ZodObject<any>);
      } else {
        throw new Error('Can only compose ZodObject schemas');
      }
    }

    // Register the composed schema
    this.register(name, composedSchema);
    
    return composedSchema;
  }

  /**
   * Create a schema variant (e.g., make fields optional)
   */
  createVariant(
    baseName: string, 
    variantName: string, 
    transformer: (schema: ValidationSchema) => ValidationSchema
  ): ValidationSchema {
    const baseSchema = this.get(baseName);
    
    if (!baseSchema) {
      throw new Error(`Base schema '${baseName}' not found in registry`);
    }

    const variantSchema = transformer(baseSchema);
    this.register(variantName, variantSchema);
    
    return variantSchema;
  }

  /**
   * Validate data against a registered schema
   */
  async validate<T>(schemaName: string, data: unknown): Promise<{ success: true; data: T } | { success: false; errors: z.ZodError }> {
    const schema = this.get(schemaName);
    
    if (!schema) {
      throw new Error(`Schema '${schemaName}' not found in registry`);
    }

    const startTime = Date.now();
    
    try {
      const result = await schema.parseAsync(data);
      const duration = Date.now() - startTime;
      
      this.recordValidation(true, duration);
      
      return { success: true, data: result };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.recordValidation(false, duration);
      
      if (error instanceof z.ZodError) {
        return { success: false, errors: error };
      }
      
      throw error;
    }
  }

  /**
   * Get registry health information
   */
  getHealth(): {
    totalSchemas: number;
    totalValidations: number;
    successRate: number;
    averageValidationTime: number;
    mostUsedSchemas: Array<{ name: string; usageCount: number }>;
  } {
    const successRate = this.metrics.totalValidations > 0 
      ? (this.metrics.successfulValidations / this.metrics.totalValidations) * 100 
      : 0;

    const mostUsedSchemas = this.getSchemasByUsage().slice(0, 5);

    return {
      totalSchemas: this.schemas.size,
      totalValidations: this.metrics.totalValidations,
      successRate,
      averageValidationTime: this.metrics.averageValidationTime,
      mostUsedSchemas,
    };
  }
}

// Global registry instance
export const globalSchemaRegistry = new ValidationSchemaRegistry();

// Helper functions for common operations
export const schemaRegistry = {
  /**
   * Register common schemas
   */
  registerCommonSchemas(): void {
    // Import and register common schemas
    import('./schemas').then(({ basicSchemas, paginationSchemas, requestSchemas, responseSchemas }) => {
      // Register basic schemas
      Object.entries(basicSchemas).forEach(([name, schema]) => {
        globalSchemaRegistry.register(`basic.${name}`, schema);
      });

      // Register pagination schemas
      Object.entries(paginationSchemas).forEach(([name, schema]) => {
        globalSchemaRegistry.register(`pagination.${name}`, schema);
      });

      // Register request schemas
      Object.entries(requestSchemas).forEach(([name, schema]) => {
        globalSchemaRegistry.register(`request.${name}`, schema);
      });

      // Register response schemas
      globalSchemaRegistry.register('response.error', responseSchemas.error);
      globalSchemaRegistry.register('response.healthCheck', responseSchemas.healthCheck);

      logger.info('Common validation schemas registered');
    }).catch(error => {
      logger.error('Failed to register common schemas', { error });
    });
  },

  /**
   * Get the global registry instance
   */
  getInstance(): ValidationSchemaRegistry {
    return globalSchemaRegistry;
  },

  /**
   * Register a schema in the global registry
   */
  register(name: string, schema: ValidationSchema): void {
    globalSchemaRegistry.register(name, schema);
  },

  /**
   * Get a schema from the global registry
   */
  get(name: string): ValidationSchema | undefined {
    return globalSchemaRegistry.get(name);
  },

  /**
   * Validate using the global registry
   */
  async validate<T>(schemaName: string, data: unknown): Promise<{ success: true; data: T } | { success: false; errors: z.ZodError }> {
    return globalSchemaRegistry.validate<T>(schemaName, data);
  },
} as const;