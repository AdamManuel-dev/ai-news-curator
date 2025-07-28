/**
 * @fileoverview Validation types and interfaces
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Zod schema validation, Express middleware, request/response validation, error handling
 * Main APIs: ValidationSchema, RequestValidationConfig, ValidationResult, SchemaRegistry
 * Constraints: Requires Zod library, Express framework, TypeScript inference support
 * Patterns: Schema composition, middleware factory, error standardization, type inference
 */

import { z } from 'zod';
import { Request, Response } from 'express';

// Base schema types
export type ValidationSchema = z.ZodSchema<any>;
export type InferSchemaType<T extends ValidationSchema> = z.infer<T>;

// Request validation configuration
export interface RequestValidationConfig {
  body?: ValidationSchema;
  params?: ValidationSchema;
  query?: ValidationSchema;
  headers?: ValidationSchema;
  options?: ValidationOptions;
}

// Response validation configuration
export interface ResponseValidationConfig {
  [statusCode: number]: ValidationSchema;
}

// Validation options
export interface ValidationOptions {
  stripUnknown?: boolean;
  allowUnknownQuery?: boolean;
  allowUnknownHeaders?: boolean;
  abortEarly?: boolean;
  customErrorMessages?: Record<string, string>;
  sanitize?: boolean;
  skipValidation?: (req: Request) => boolean;
  onValidationError?: (error: ValidationError, req: Request, res: Response) => void;
}

// Validation error details
export interface ValidationErrorDetail {
  field: string;
  message: string;
  value: unknown;
  location: 'body' | 'params' | 'query' | 'headers';
  code?: string;
}

// Enhanced validation error
export interface ValidationError {
  message: string;
  code: string;
  category: 'validation';
  details: {
    validationErrors: ValidationErrorDetail[];
    requestId?: string;
  };
}

// Validated request type
export interface ValidatedRequest<
  TBody = any,
  TParams = any,
  TQuery = any,
  THeaders = any
> extends Request {
  validatedBody?: TBody;
  validatedParams?: TParams;
  validatedQuery?: TQuery;
  validatedHeaders?: THeaders;
}

// Schema registry for reusable schemas
export interface SchemaRegistry {
  register(name: string, schema: ValidationSchema): void;
  get(name: string): ValidationSchema | undefined;
  getAll(): Record<string, ValidationSchema>;
  has(name: string): boolean;
}

// Validation result
export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}

// Common validation patterns
export interface ValidationPatterns {
  email: ValidationSchema;
  password: ValidationSchema;
  uuid: ValidationSchema;
  url: ValidationSchema;
  positiveInteger: ValidationSchema;
  nonEmptyString: ValidationSchema;
  timestamp: ValidationSchema;
  pagination: ValidationSchema;
}

// Validation middleware factory options
export interface ValidationMiddlewareOptions {
  enableResponseValidation?: boolean;
  logValidationErrors?: boolean;
  includeErrorDetails?: boolean;
  transformRequest?: boolean;
  performanceTracking?: boolean;
}

// Performance metrics for validation
export interface ValidationMetrics {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  averageValidationTime: number;
  schemaCompilationTime: number;
}

// Schema compilation cache
export interface CompiledSchema {
  schema: ValidationSchema;
  compiledAt: Date;
  usageCount: number;
  lastUsed: Date;
}

// Validation context for advanced scenarios
export interface ValidationContext {
  request: Request;
  user?: any;
  userRole?: string;
  rateLimitInfo?: {
    remaining: number;
    resetTime: Date;
  };
  customData?: Record<string, any>;
}

// Conditional validation rule
export interface ConditionalValidation {
  condition: (context: ValidationContext) => boolean;
  schema: ValidationSchema;
  message?: string;
}

// Advanced validation configuration
export interface AdvancedValidationConfig extends RequestValidationConfig {
  conditionalValidations?: ConditionalValidation[];
  asyncValidations?: AsyncValidation[];
  rateLimiting?: {
    maxRequests: number;
    windowMs: number;
  };
  customValidators?: Record<string, CustomValidator>;
}

// Async validation for database lookups
export interface AsyncValidation {
  field: string;
  validator: (value: any, context: ValidationContext) => Promise<boolean>;
  message: string;
  timeout?: number;
}

// Custom validator function
export type CustomValidator = (value: any, context?: ValidationContext) => boolean | Promise<boolean>;

// Schema builder helpers
export interface SchemaBuilder {
  createPaginationSchema(options?: { maxLimit?: number; defaultLimit?: number }): ValidationSchema;
  createSortingSchema(allowedFields: string[]): ValidationSchema;
  createFilterSchema(allowedFilters: Record<string, ValidationSchema>): ValidationSchema;
  createIdSchema(format?: 'uuid' | 'numeric' | 'string'): ValidationSchema;
}

// Validation middleware configuration for specific use cases
export interface EndpointValidationConfig {
  create?: RequestValidationConfig;
  update?: RequestValidationConfig;
  get?: RequestValidationConfig;
  list?: RequestValidationConfig;
  delete?: RequestValidationConfig;
}

// Response transformation options
export interface ResponseTransformOptions {
  stripSensitiveFields?: string[];
  formatDates?: boolean;
  includeMetadata?: boolean;
  customTransformers?: Record<string, (value: any) => any>;
}

// Validation cache configuration
export interface ValidationCacheConfig {
  enabled: boolean;
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  keyGenerator: (req: Request, config: RequestValidationConfig) => string;
}