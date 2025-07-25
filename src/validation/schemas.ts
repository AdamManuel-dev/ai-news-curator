/**
 * @fileoverview Common validation schemas and patterns
 * 
 * Provides reusable Zod schemas for common data types, patterns,
 * and API request/response structures.
 */

import { z } from 'zod';
import type { ValidationPatterns, SchemaBuilder } from '@types/validation';

// Basic data type schemas
export const basicSchemas = {
  // String patterns
  nonEmptyString: z.string().min(1, 'Cannot be empty').trim(),
  email: z.string().email('Invalid email format'),
  url: z.string().url('Invalid URL format'),
  
  // ID patterns
  uuid: z.string().uuid('Invalid UUID format'),
  numericId: z.coerce.number().int().positive('Invalid ID'),
  stringId: z.string().min(1, 'ID cannot be empty'),
  
  // Password patterns
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  
  // Numeric patterns
  positiveInteger: z.coerce.number().int().positive('Must be a positive integer'),
  nonNegativeInteger: z.coerce.number().int().min(0, 'Must be non-negative'),
  
  // Date/time patterns
  isoDateTime: z.string().datetime('Invalid ISO datetime format'),
  unixTimestamp: z.coerce.number().int().positive('Invalid timestamp'),
  
  // Common formats
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format'),
  
  // Content types
  htmlContent: z.string().max(50000, 'Content too long'),
  plainText: z.string().max(10000, 'Text too long'),
  
  // Arrays
  stringArray: z.array(z.string()).default([]),
  numberArray: z.array(z.number()).default([]),
} as const;

// Pagination schemas
export const paginationSchemas = {
  query: z.object({
    page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
    offset: z.coerce.number().int().min(0, 'Offset must be non-negative').optional(),
  }),
  
  response: z.object({
    data: z.array(z.unknown()),
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().min(0),
      totalPages: z.number().int().min(0),
      hasNext: z.boolean(),
      hasPrevious: z.boolean(),
    }),
  }),
} as const;

// Sorting schemas
export const sortingSchemas = {
  createSortSchema: (allowedFields: string[]) => z.object({
    sortBy: z.enum(allowedFields as [string, ...string[]]).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
  
  multipleSortSchema: (allowedFields: string[]) => z.array(
    z.object({
      field: z.enum(allowedFields as [string, ...string[]]),
      order: z.enum(['asc', 'desc']).default('asc'),
    })
  ).max(3, 'Cannot sort by more than 3 fields'),
} as const;

// Filtering schemas
export const filteringSchemas = {
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }).refine(
    (data) => !data.startDate || !data.endDate || new Date(data.startDate) <= new Date(data.endDate),
    { message: 'Start date must be before end date', path: ['endDate'] }
  ),
  
  searchQuery: z.object({
    q: z.string().min(1, 'Search query cannot be empty').max(200, 'Search query too long').optional(),
    fields: z.array(z.string()).optional(),
  }),
  
  statusFilter: (allowedStatuses: string[]) => z.object({
    status: z.enum(allowedStatuses as [string, ...string[]]).optional(),
    statuses: z.array(z.enum(allowedStatuses as [string, ...string[]])).optional(),
  }),
} as const;

// API request schemas
export const requestSchemas = {
  // Common path parameters
  idParam: z.object({
    id: basicSchemas.uuid,
  }),
  
  numericIdParam: z.object({
    id: basicSchemas.numericId,
  }),
  
  // Common headers
  authHeaders: z.object({
    authorization: z.string().startsWith('Bearer ', 'Authorization must be Bearer token'),
  }).partial(),
  
  contentHeaders: z.object({
    'content-type': z.string().optional(),
    'content-length': z.string().optional(),
  }).partial(),
  
  // API versioning
  versionHeaders: z.object({
    'api-version': z.enum(['v1', 'v2']).default('v1'),
  }).partial(),
} as const;

// Response schemas
export const responseSchemas = {
  // Standard API response wrapper
  success: <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
    success: z.literal(true),
    data: dataSchema,
    requestId: z.string().optional(),
    timestamp: z.string().datetime().optional(),
  }),
  
  error: z.object({
    success: z.literal(false),
    error: z.object({
      message: z.string(),
      code: z.string(),
      category: z.string(),
      details: z.record(z.unknown()).optional(),
    }),
    requestId: z.string().optional(),
    timestamp: z.string().datetime().optional(),
  }),
  
  // Health check response
  healthCheck: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    timestamp: z.string().datetime(),
    version: z.string(),
    uptime: z.number(),
    environment: z.string(),
    dependencies: z.record(z.object({
      status: z.string(),
      latency: z.number().optional(),
      error: z.string().optional(),
    })),
  }),
} as const;

// Content validation schemas
export const contentSchemas = {
  article: z.object({
    title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
    content: basicSchemas.htmlContent,
    summary: z.string().max(500, 'Summary too long').optional(),
    tags: z.array(z.string().min(1)).max(10, 'Too many tags'),
    published: z.boolean().default(false),
    publishedAt: z.string().datetime().optional(),
    author: z.string().min(1, 'Author is required'),
  }),
  
  user: z.object({
    email: basicSchemas.email,
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
    avatar: basicSchemas.url.optional(),
    bio: z.string().max(1000, 'Bio too long').optional(),
    preferences: z.record(z.unknown()).default({}),
  }),
  
  comment: z.object({
    content: basicSchemas.plainText.min(1, 'Comment cannot be empty'),
    parentId: basicSchemas.uuid.optional(),
    mentions: z.array(basicSchemas.uuid).default([]),
  }),
} as const;

// Business logic schemas
export const businessSchemas = {
  // Rate limiting
  rateLimitInfo: z.object({
    remaining: z.number().int().min(0),
    resetTime: z.string().datetime(),
    limit: z.number().int().positive(),
  }),
  
  // File upload
  fileUpload: z.object({
    filename: z.string().min(1, 'Filename is required'),
    mimetype: z.string().min(1, 'MIME type is required'),
    size: z.number().int().positive().max(10 * 1024 * 1024, 'File too large (max 10MB)'),
  }),
  
  // Audit trail
  auditEntry: z.object({
    action: z.enum(['create', 'update', 'delete', 'view']),
    entityType: z.string().min(1),
    entityId: basicSchemas.uuid,
    userId: basicSchemas.uuid.optional(),
    timestamp: z.string().datetime(),
    changes: z.record(z.object({
      before: z.unknown(),
      after: z.unknown(),
    })).optional(),
    metadata: z.record(z.unknown()).default({}),
  }),
} as const;

// Implementation of ValidationPatterns interface
export const validationPatterns: ValidationPatterns = {
  email: basicSchemas.email,
  password: basicSchemas.password,
  uuid: basicSchemas.uuid,
  url: basicSchemas.url,
  positiveInteger: basicSchemas.positiveInteger,
  nonEmptyString: basicSchemas.nonEmptyString,
  timestamp: basicSchemas.isoDateTime,
  pagination: paginationSchemas.query,
} as const;

// Schema builder implementation
export const schemaBuilder: SchemaBuilder = {
  createPaginationSchema: (options = {}) => {
    const { maxLimit = 100, defaultLimit = 20 } = options;
    return z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    });
  },
  
  createSortingSchema: (allowedFields: string[]) => {
    if (allowedFields.length === 0) {
      throw new Error('Allowed fields cannot be empty');
    }
    return sortingSchemas.createSortSchema(allowedFields);
  },
  
  createFilterSchema: (allowedFilters: Record<string, z.ZodSchema>) => {
    return z.object(allowedFilters).partial();
  },
  
  createIdSchema: (format = 'uuid') => {
    switch (format) {
      case 'uuid':
        return basicSchemas.uuid;
      case 'numeric':
        return basicSchemas.numericId;
      case 'string':
        return basicSchemas.stringId;
      default:
        throw new Error(`Unsupported ID format: ${format}`);
    }
  },
} as const;

// Utility functions for schema composition
export const schemaUtils = {
  // Make all fields optional
  makeOptional: <T extends z.ZodTypeAny>(schema: T) => schema.partial(),
  
  // Make specific fields optional
  makeFieldsOptional: <T extends z.ZodObject<any>, K extends keyof T['shape']>(
    schema: T,
    fields: K[]
  ) => schema.omit(Object.fromEntries(fields.map(f => [f, true])) as any).merge(
    schema.pick(Object.fromEntries(fields.map(f => [f, true])) as any).partial()
  ),
  
  // Add default values
  withDefaults: <T extends z.ZodObject<any>>(
    schema: T,
    defaults: Partial<z.infer<T>>
  ) => schema.transform(data => ({ ...defaults, ...data })),
  
  // Create update schema (all fields optional except ID)
  createUpdateSchema: <T extends z.ZodObject<any>>(schema: T) => 
    schema.omit({ id: true }).partial(),
  
  // Merge multiple schemas
  mergeSchemas: <T extends z.ZodObject<any>[]>(...schemas: T) =>
    schemas.reduce((acc, schema) => acc.merge(schema)),
} as const;