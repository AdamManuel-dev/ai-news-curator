/**
 * @fileoverview Global test setup and environment configuration
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: Environment mocking, timeouts, console overrides
 * Main APIs: Global Jest configuration, process.env setup
 * Constraints: Requires test environment variables
 * Patterns: Mocks console methods in test mode
 */

// Global test setup
import { config } from '@config/index';

// Mock environment variables for testing
process.env['NODE_ENV'] = 'test';
process.env['ANTHROPIC_API_KEY'] = 'test-key';
process.env['PINECONE_API_KEY'] = 'test-key';
process.env['OPENAI_API_KEY'] = 'test-key';
process.env['JWT_SECRET'] = 'test-secret';

// Set test timeouts
jest.setTimeout(10000);

// Mock console methods in test environment
if (config.nodeEnv === 'test') {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}