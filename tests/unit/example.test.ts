/**
 * @fileoverview Unit tests for utility functions
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: URL validation, string sanitization, sleep utilities
 * Main APIs: sleep(), isValidUrl(), sanitizeString()
 * Constraints: None
 * Patterns: Standard Jest test patterns with describe/it blocks
 */

// Basic unit tests for utilities
import { sleep, isValidUrl, sanitizeString } from '../../src/utils/index';

describe('Utility Functions', () => {
  describe('sleep', () => {
    it('should wait for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(50);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://test.org')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('just-text')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
      expect(sanitizeString('Hello <world>')).toBe('Hello world');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });
  });
});