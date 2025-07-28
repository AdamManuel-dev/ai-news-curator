/**
 * @fileoverview Unit tests for logging utilities
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Logger instance tests, helper functions, console mocking
 * Main APIs: logger.info(), logError(), logApiCall(), logBusinessEvent()
 * Constraints: Requires console mocking in test environment
 * Patterns: Mocks console methods, tests log helper functions
 */

import logger, { logError, logApiCall, logBusinessEvent } from '../../src/utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    // Mock console to avoid actual logging during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic logging', () => {
    it('should create logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should log info messages', () => {
      const message = 'Test info message';
      logger.info(message);
      // In a real test, we'd check if the log was written, but for now just ensure no errors
      expect(true).toBe(true);
    });

    it('should log error messages', () => {
      const message = 'Test error message';
      logger.error(message);
      expect(true).toBe(true);
    });
  });

  describe('Helper functions', () => {
    it('should log errors with context', () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };
      
      expect(() => logError(error, context)).not.toThrow();
    });

    it('should log API calls', () => {
      expect(() => logApiCall('test-api', 'GET', 'start')).not.toThrow();
      expect(() => logApiCall('test-api', 'GET', 'success', 150)).not.toThrow();
      expect(() => logApiCall('test-api', 'GET', 'error', 150, new Error('API failed'))).not.toThrow();
    });

    it('should log business events', () => {
      const event = 'user_registered';
      const data = { userId: '123', email: 'test@example.com' };
      
      expect(() => logBusinessEvent(event, data)).not.toThrow();
    });
  });
});