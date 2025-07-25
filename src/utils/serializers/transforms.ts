/**
 * @fileoverview Data transformation utilities for serialization
 * 
 * Provides common data transformation functions used across serializers
 * including date formatting, URL sanitization, and field normalization.
 * 
 * @module utils/serializers/transforms
 */

/**
 * Transform options interface
 */
export interface TransformOptions {
  timezone?: string;
  locale?: string;
  dateFormat?: 'iso' | 'unix' | 'relative' | 'human';
  urlSanitization?: boolean;
  includeNulls?: boolean;
  camelCaseKeys?: boolean;
}

/**
 * Data transformation utilities
 */
export class DataTransforms {
  /**
   * Transform date fields to requested format
   */
  static transformDates(
    obj: any, 
    dateFields: string[] = ['createdAt', 'updatedAt', 'publishDate'],
    format: 'iso' | 'unix' | 'relative' | 'human' = 'iso',
    timezone?: string
  ): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const transformed = Array.isArray(obj) ? [...obj] : { ...obj };

    if (Array.isArray(transformed)) {
      return transformed.map(item => 
        this.transformDates(item, dateFields, format, timezone)
      );
    }

    dateFields.forEach(field => {
      if (transformed[field]) {
        transformed[field] = this.formatDate(transformed[field], format, timezone);
      }
    });

    return transformed;
  }

  /**
   * Format individual date
   */
  static formatDate(
    date: string | Date | number,
    format: 'iso' | 'unix' | 'relative' | 'human' = 'iso',
    timezone?: string
  ): string | number {
    const dateObj = new Date(date);

    if (isNaN(dateObj.getTime())) {
      return date as string; // Return original if invalid
    }

    switch (format) {
      case 'unix':
        return Math.floor(dateObj.getTime() / 1000);
      
      case 'iso':
        return dateObj.toISOString();
      
      case 'relative':
        return this.getRelativeTime(dateObj);
      
      case 'human':
        return this.getHumanReadableDate(dateObj, timezone);
      
      default:
        return dateObj.toISOString();
    }
  }

  /**
   * Get relative time (e.g., "2 hours ago")
   */
  static getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return 'just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months === 1 ? '' : 's'} ago`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} year${years === 1 ? '' : 's'} ago`;
    }
  }

  /**
   * Get human-readable date (e.g., "January 15, 2024")
   */
  static getHumanReadableDate(date: Date, timezone?: string): string {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...(timezone && { timeZone: timezone })
    };

    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Sanitize URLs to ensure they're safe and properly formatted
   */
  static sanitizeUrls(obj: any, urlFields: string[] = ['url', 'avatar', 'website']): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const transformed = Array.isArray(obj) ? [...obj] : { ...obj };

    if (Array.isArray(transformed)) {
      return transformed.map(item => this.sanitizeUrls(item, urlFields));
    }

    urlFields.forEach(field => {
      if (transformed[field] && typeof transformed[field] === 'string') {
        transformed[field] = this.sanitizeUrl(transformed[field]);
      }
    });

    return transformed;
  }

  /**
   * Sanitize individual URL
   */
  static sanitizeUrl(url: string): string {
    try {
      // Remove dangerous protocols
      const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
      const urlLower = url.toLowerCase();
      
      if (dangerousProtocols.some(protocol => urlLower.startsWith(protocol))) {
        return '';
      }

      // Ensure proper protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      // Validate URL format
      const urlObj = new URL(url);
      return urlObj.toString();
    } catch {
      return ''; // Return empty string for invalid URLs
    }
  }

  /**
   * Remove null and undefined values
   */
  static removeNulls(obj: any, deep: boolean = true): any {
    if (obj === null || obj === undefined) {
      return undefined;
    }

    if (Array.isArray(obj)) {
      return obj
        .map(item => deep ? this.removeNulls(item, deep) : item)
        .filter(item => item !== null && item !== undefined);
    }

    if (typeof obj === 'object') {
      const cleaned: any = {};
      
      Object.entries(obj).forEach(([key, value]) => {
        const cleanedValue = deep ? this.removeNulls(value, deep) : value;
        if (cleanedValue !== null && cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      });

      return cleaned;
    }

    return obj;
  }

  /**
   * Convert snake_case keys to camelCase
   */
  static toCamelCase(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.toCamelCase(item));
    }

    const camelCased: any = {};

    Object.entries(obj).forEach(([key, value]) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      camelCased[camelKey] = typeof value === 'object' ? this.toCamelCase(value) : value;
    });

    return camelCased;
  }

  /**
   * Convert camelCase keys to snake_case
   */
  static toSnakeCase(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.toSnakeCase(item));
    }

    const snakeCased: any = {};

    Object.entries(obj).forEach(([key, value]) => {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      snakeCased[snakeKey] = typeof value === 'object' ? this.toSnakeCase(value) : value;
    });

    return snakeCased;
  }

  /**
   * Truncate text fields to specified length
   */
  static truncateText(
    obj: any,
    textFields: string[] = ['title', 'summary', 'description'],
    maxLength: number = 255,
    suffix: string = '...'
  ): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const transformed = Array.isArray(obj) ? [...obj] : { ...obj };

    if (Array.isArray(transformed)) {
      return transformed.map(item => 
        this.truncateText(item, textFields, maxLength, suffix)
      );
    }

    textFields.forEach(field => {
      if (transformed[field] && typeof transformed[field] === 'string') {
        const text = transformed[field];
        if (text.length > maxLength) {
          transformed[field] = text.substring(0, maxLength - suffix.length) + suffix;
        }
      }
    });

    return transformed;
  }

  /**
   * Add computed fields to objects
   */
  static addComputedFields(obj: any, computations: Record<string, (item: any) => any>): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.addComputedFields(item, computations));
    }

    const enhanced = { ...obj };

    Object.entries(computations).forEach(([fieldName, computation]) => {
      try {
        enhanced[fieldName] = computation(obj);
      } catch (error) {
        // Skip computation if it fails
        console.warn(`Failed to compute field ${fieldName}:`, error);
      }
    });

    return enhanced;
  }

  /**
   * Sort array of objects by specified field
   */
  static sortBy(
    array: any[],
    field: string,
    direction: 'asc' | 'desc' = 'asc'
  ): any[] {
    if (!Array.isArray(array)) {
      return array;
    }

    return [...array].sort((a, b) => {
      const aValue = this.getNestedValue(a, field);
      const bValue = this.getNestedValue(b, field);

      if (aValue === bValue) return 0;

      const comparison = aValue < bValue ? -1 : 1;
      return direction === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Get nested object value by dot notation path
   */
  static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Apply multiple transformations in sequence
   */
  static pipeline(obj: any, transformations: Array<(data: any) => any>): any {
    return transformations.reduce((data, transform) => transform(data), obj);
  }
}