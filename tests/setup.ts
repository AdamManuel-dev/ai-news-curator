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