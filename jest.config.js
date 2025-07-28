/**
 * @fileoverview Jest testing configuration for TypeScript Node.js application
 * @lastmodified 2025-07-28T00:42:00Z
 * 
 * Features: TypeScript support, path mapping, coverage collection, multiple test locations
 * Main APIs: N/A (configuration only)
 * Constraints: Requires ts-jest, tsconfig.test.json, 10s timeout limit
 * Patterns: @ alias imports, __tests__ and tests/ directories, excludes index.ts from coverage
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@tools/(.*)$': '<rootDir>/src/tools/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@repositories/(.*)$': '<rootDir>/src/repositories/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@container/(.*)$': '<rootDir>/src/container/$1',
    '^@adapters/(.*)$': '<rootDir>/src/adapters/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 10000,
  verbose: true,
};