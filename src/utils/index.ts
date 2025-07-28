/**
 * @fileoverview Common utility functions and helpers
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Sleep utility, URL validation, string sanitization
 * Main APIs: sleep(), isValidUrl(), sanitizeString()
 * Constraints: Basic validation only, minimal dependencies
 * Patterns: Pure functions, Promise-based async, simple validation logic
 */

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const sanitizeString = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};
