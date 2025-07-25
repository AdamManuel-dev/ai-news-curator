/**
 * @fileoverview API keys seed data
 * 
 * @module database/seeds/api-keys
 */

import { DatabaseConnection } from '@database/connection';
import { SeedConfig } from './index';
import logger from '@utils/logger';

export interface SeedResult {
  created: number;
  skipped: number;
  errors?: string[];
}

export async function seedApiKeys(db: DatabaseConnection, config: SeedConfig): Promise<SeedResult> {
  const result: SeedResult = {
    created: 0,
    skipped: 0,
    errors: []
  };

  // Skip API keys seeding for now - these should be created through the API
  logger.info('API keys seeding skipped - will be created through authentication system');

  return result;
}