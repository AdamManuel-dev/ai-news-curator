/**
 * @fileoverview Repository pattern interfaces and base implementation
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Generic repository interface, base repository class, CRUD operations
 * Main APIs: Repository<T> interface, BaseRepository<T> abstract class
 * Constraints: String ID requirement, Promise-based async operations, generic type constraints
 * Patterns: Repository pattern, generic interfaces, abstract base class, standardized CRUD
 */

export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export abstract class BaseRepository<T> implements Repository<T> {
  abstract findById(id: string): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  abstract update(id: string, updates: Partial<T>): Promise<T | null>;
  abstract delete(id: string): Promise<boolean>;
}
