/**
 * @fileoverview User interactions seed data
 * 
 * @module database/seeds/interactions
 */

import { DatabaseConnection } from '@database/connection';
import { SeedConfig } from './index';
import logger from '@utils/logger';

export interface SeedResult {
  created: number;
  skipped: number;
  errors?: string[];
}

export async function seedUserInteractions(db: DatabaseConnection, config: SeedConfig): Promise<SeedResult> {
  const result: SeedResult = {
    created: 0,
    skipped: 0,
    errors: []
  };

  // Skip interactions seeding for now as it requires content to exist
  logger.info('User interactions seeding skipped - will be populated as users interact');

  return result;
}