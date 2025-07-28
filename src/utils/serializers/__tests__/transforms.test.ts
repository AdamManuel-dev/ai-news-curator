/**
 * @fileoverview Tests for data transformation utilities with comprehensive data processing
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Date transformations, URL sanitization, null removal, case conversions, text truncation
 * Main APIs: transformDates(), sanitizeUrls(), removeNulls(), toCamelCase(), truncateText()
 * Constraints: Requires date parsing, URL validation, deep object traversal capabilities
 * Patterns: Test data mutations, validate transformations, handle edge cases and errors
 */

import { DataTransforms } from '../transforms';

describe('DataTransforms', () => {
  describe('transformDates', () => {
    const testData = {
      id: 1,
      name: 'test',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: new Date('2024-01-16T15:45:00Z'),
      publishDate: 1705410600000, // Unix timestamp in ms
      nonDateField: 'keep this'
    };

    it('should transform dates to ISO format by default', () => {
      const result = DataTransforms.transformDates(testData);

      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.publishDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(result.nonDateField).toBe('keep this');
    });

    it('should transform dates to unix format', () => {
      const result = DataTransforms.transformDates(testData, ['createdAt', 'updatedAt'], 'unix');

      expect(typeof result.createdAt).toBe('number');
      expect(typeof result.updatedAt).toBe('number');
      expect(result.createdAt).toBeGreaterThan(1000000000); // Should be a valid unix timestamp
    });

    it('should transform dates to relative format', () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const testDataRecent = { ...testData, createdAt: recentDate.toISOString() };

      const result = DataTransforms.transformDates(testDataRecent, ['createdAt'], 'relative');

      expect(result.createdAt).toBe('2 hours ago');
    });

    it('should transform dates to human readable format', () => {
      const result = DataTransforms.transformDates(testData, ['createdAt'], 'human');

      expect(result.createdAt).toMatch(/^[A-Za-z]+ \d{1,2}, \d{4}$/);
    });

    it('should handle array data', () => {
      const arrayData = [testData, { ...testData, id: 2 }];
      const result = DataTransforms.transformDates(arrayData, ['createdAt'], 'iso');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      result.forEach((item: any) => {
        expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });
    });

    it('should handle invalid dates gracefully', () => {
      const invalidData = { ...testData, createdAt: 'invalid-date' };
      const result = DataTransforms.transformDates(invalidData, ['createdAt'], 'iso');

      expect(result.createdAt).toBe('invalid-date');
    });
  });

  describe('getRelativeTime', () => {
    it('should return "just now" for very recent dates', () => {
      const now = new Date();
      const result = DataTransforms.getRelativeTime(now);
      expect(result).toBe('just now');
    });

    it('should return minutes ago', () => {
      const date = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const result = DataTransforms.getRelativeTime(date);
      expect(result).toBe('5 minutes ago');
    });

    it('should return hours ago', () => {
      const date = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
      const result = DataTransforms.getRelativeTime(date);
      expect(result).toBe('3 hours ago');
    });

    it('should return days ago', () => {
      const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const result = DataTransforms.getRelativeTime(date);
      expect(result).toBe('2 days ago');
    });

    it('should return weeks ago', () => {
      const date = new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000); // 2 weeks ago
      const result = DataTransforms.getRelativeTime(date);
      expect(result).toBe('2 weeks ago');
    });

    it('should handle singular forms', () => {
      const date = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago
      const result = DataTransforms.getRelativeTime(date);
      expect(result).toBe('1 minute ago');
    });
  });

  describe('sanitizeUrls', () => {
    const testData = {
      id: 1,
      url: 'example.com',
      avatar: 'https://example.com/avatar.jpg',
      website: 'javascript:alert("xss")',
      normalField: 'keep this'
    };

    it('should sanitize URLs and add https protocol', () => {
      const result = DataTransforms.sanitizeUrls(testData);

      expect(result.url).toBe('https://example.com/');
      expect(result.avatar).toBe('https://example.com/avatar.jpg');
      expect(result.normalField).toBe('keep this');
    });

    it('should remove dangerous protocols', () => {
      const dangerousData = {
        url1: 'javascript:alert("xss")',
        url2: 'data:text/html,<script>alert("xss")</script>',
        url3: 'vbscript:msgbox("xss")',
        url4: 'file:///etc/passwd'
      };

      const result = DataTransforms.sanitizeUrls(dangerousData, ['url1', 'url2', 'url3', 'url4']);

      expect(result.url1).toBe('');
      expect(result.url2).toBe('');
      expect(result.url3).toBe('');
      expect(result.url4).toBe('');
    });

    it('should handle array data', () => {
      const arrayData = [testData, { ...testData, id: 2 }];
      const result = DataTransforms.sanitizeUrls(arrayData);

      expect(Array.isArray(result)).toBe(true);
      result.forEach((item: any) => {
        expect(item.url).toBe('https://example.com/');
      });
    });

    it('should handle invalid URLs', () => {
      const invalidData = { url: 'not-a-url' };
      const result = DataTransforms.sanitizeUrls(invalidData);

      expect(result.url).toBe('');
    });
  });

  describe('removeNulls', () => {
    const testData = {
      id: 1,
      name: 'test',
      description: null,
      metadata: undefined,
      nested: {
        value: 'keep',
        empty: null,
        zero: 0,
        falsy: false
      },
      array: [1, null, 3, undefined, 5]
    };

    it('should remove null and undefined values', () => {
      const result = DataTransforms.removeNulls(testData);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).not.toHaveProperty('description');
      expect(result).not.toHaveProperty('metadata');
      expect(result.nested).toHaveProperty('value');
      expect(result.nested).toHaveProperty('zero');
      expect(result.nested).toHaveProperty('falsy');
      expect(result.nested).not.toHaveProperty('empty');
      expect(result.array).toEqual([1, 3, 5]);
    });

    it('should handle shallow removal', () => {
      const result = DataTransforms.removeNulls(testData, false);

      expect(result.nested.empty).toBeNull(); // Should keep nested nulls
      expect(result.array).toEqual([1, null, 3, undefined, 5]); // Should keep array nulls
    });

    it('should handle null input', () => {
      const result = DataTransforms.removeNulls(null);
      expect(result).toBeUndefined();
    });
  });

  describe('toCamelCase', () => {
    const testData = {
      user_id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email_address: 'john@example.com',
      nested_object: {
        created_at: '2024-01-01',
        updated_at: '2024-01-02'
      },
      array_data: [
        { item_name: 'test1' },
        { item_name: 'test2' }
      ]
    };

    it('should convert snake_case keys to camelCase', () => {
      const result = DataTransforms.toCamelCase(testData);

      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('firstName');
      expect(result).toHaveProperty('lastName');
      expect(result).toHaveProperty('emailAddress');
      expect(result.nestedObject).toHaveProperty('createdAt');
      expect(result.nestedObject).toHaveProperty('updatedAt');
      expect(result.arrayData[0]).toHaveProperty('itemName');
    });

    it('should handle non-object input', () => {
      expect(DataTransforms.toCamelCase('string')).toBe('string');
      expect(DataTransforms.toCamelCase(123)).toBe(123);
      expect(DataTransforms.toCamelCase(null)).toBeNull();
    });
  });

  describe('toSnakeCase', () => {
    const testData = {
      userId: 1,
      firstName: 'John',
      lastName: 'Doe',
      emailAddress: 'john@example.com',
      nestedObject: {
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02'
      }
    };

    it('should convert camelCase keys to snake_case', () => {
      const result = DataTransforms.toSnakeCase(testData);

      expect(result).toHaveProperty('user_id');
      expect(result).toHaveProperty('first_name');
      expect(result).toHaveProperty('last_name');
      expect(result).toHaveProperty('email_address');
      expect(result.nested_object).toHaveProperty('created_at');
      expect(result.nested_object).toHaveProperty('updated_at');
    });
  });

  describe('truncateText', () => {
    const testData = {
      title: 'This is a very long title that should be truncated',
      summary: 'Short summary',
      description: 'This is an extremely long description that definitely exceeds the maximum length and should be truncated with ellipsis',
      normalField: 123
    };

    it('should truncate long text fields', () => {
      const result = DataTransforms.truncateText(testData, ['title', 'description'], 20, '...');

      expect(result.title).toBe('This is a very lo...');
      expect(result.summary).toBe('Short summary'); // Should not be truncated
      expect(result.description).toBe('This is an extrem...');
      expect(result.normalField).toBe(123); // Non-string fields should be unchanged
    });

    it('should handle custom suffix', () => {
      const result = DataTransforms.truncateText(testData, ['title'], 20, ' [more]');

      expect(result.title).toBe('This is a [more]');
    });

    it('should handle array data', () => {
      const arrayData = [testData, { ...testData }];
      const result = DataTransforms.truncateText(arrayData, ['title'], 20);

      expect(Array.isArray(result)).toBe(true);
      result.forEach((item: any) => {
        expect(item.title.length).toBeLessThanOrEqual(20);
      });
    });
  });

  describe('addComputedFields', () => {
    const testData = {
      firstName: 'John',
      lastName: 'Doe',
      price: 100,
      tax: 10
    };

    it('should add computed fields', () => {
      const computations = {
        fullName: (item: any) => `${item.firstName} ${item.lastName}`,
        total: (item: any) => item.price + item.tax,
        isExpensive: (item: any) => item.price > 50
      };

      const result = DataTransforms.addComputedFields(testData, computations);

      expect(result.fullName).toBe('John Doe');
      expect(result.total).toBe(110);
      expect(result.isExpensive).toBe(true);
      expect(result.firstName).toBe('John'); // Original fields should remain
    });

    it('should handle array data', () => {
      const arrayData = [testData, { ...testData, firstName: 'Jane' }];
      const computations = {
        fullName: (item: any) => `${item.firstName} ${item.lastName}`
      };

      const result = DataTransforms.addComputedFields(arrayData, computations);

      expect(result[0].fullName).toBe('John Doe');
      expect(result[1].fullName).toBe('Jane Doe');
    });

    it('should handle computation errors gracefully', () => {
      const computations = {
        errorField: () => { throw new Error('Computation error'); },
        validField: () => 'success'
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = DataTransforms.addComputedFields(testData, computations);

      expect(result).not.toHaveProperty('errorField');
      expect(result.validField).toBe('success');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('sortBy', () => {
    const testData = [
      { id: 3, name: 'Charlie', score: 85 },
      { id: 1, name: 'Alice', score: 92 },
      { id: 2, name: 'Bob', score: 78 }
    ];

    it('should sort by field in ascending order', () => {
      const result = DataTransforms.sortBy(testData, 'name', 'asc');

      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
      expect(result[2].name).toBe('Charlie');
    });

    it('should sort by field in descending order', () => {
      const result = DataTransforms.sortBy(testData, 'score', 'desc');

      expect(result[0].score).toBe(92);
      expect(result[1].score).toBe(85);
      expect(result[2].score).toBe(78);
    });

    it('should handle nested field paths', () => {
      const nestedData = [
        { user: { profile: { age: 30 } } },
        { user: { profile: { age: 25 } } },
        { user: { profile: { age: 35 } } }
      ];

      const result = DataTransforms.sortBy(nestedData, 'user.profile.age', 'asc');

      expect(result[0].user.profile.age).toBe(25);
      expect(result[1].user.profile.age).toBe(30);
      expect(result[2].user.profile.age).toBe(35);
    });

    it('should not mutate original array', () => {
      const original = [...testData];
      DataTransforms.sortBy(testData, 'name', 'asc');

      expect(testData).toEqual(original);
    });
  });

  describe('getNestedValue', () => {
    const testData = {
      user: {
        profile: {
          name: 'John',
          contact: {
            email: 'john@example.com'
          }
        },
        settings: {
          theme: 'dark'
        }
      },
      id: 123
    };

    it('should get simple property value', () => {
      const result = DataTransforms.getNestedValue(testData, 'id');
      expect(result).toBe(123);
    });

    it('should get nested property value', () => {
      const result = DataTransforms.getNestedValue(testData, 'user.profile.name');
      expect(result).toBe('John');
    });

    it('should get deeply nested property value', () => {
      const result = DataTransforms.getNestedValue(testData, 'user.profile.contact.email');
      expect(result).toBe('john@example.com');
    });

    it('should return undefined for non-existent path', () => {
      const result = DataTransforms.getNestedValue(testData, 'user.profile.nonexistent');
      expect(result).toBeUndefined();
    });

    it('should handle null/undefined objects', () => {
      const result = DataTransforms.getNestedValue(null, 'any.path');
      expect(result).toBeUndefined();
    });
  });

  describe('pipeline', () => {
    const testData = { value: 10 };

    it('should apply transformations in sequence', () => {
      const transformations = [
        (data: any) => ({ ...data, doubled: data.value * 2 }),
        (data: any) => ({ ...data, squared: data.doubled * data.doubled }),
        (data: any) => ({ ...data, final: data.squared + 100 })
      ];

      const result = DataTransforms.pipeline(testData, transformations);

      expect(result.value).toBe(10);
      expect(result.doubled).toBe(20);
      expect(result.squared).toBe(400);
      expect(result.final).toBe(500);
    });

    it('should handle empty transformations array', () => {
      const result = DataTransforms.pipeline(testData, []);
      expect(result).toEqual(testData);
    });
  });
});