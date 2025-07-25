/**
 * @fileoverview Users table seed data
 * 
 * Creates seed data for test users with different profiles and preferences
 * 
 * @module database/seeds/users
 */

import { DatabaseConnection } from '@database/connection';
import { SeedConfig } from './index';
import logger from '@utils/logger';

export interface UserSeedData {
  email: string;
  username: string;
  expertise_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  interests: string[];
  preferred_formats: ('article' | 'paper' | 'tutorial' | 'news' | 'video' | 'podcast')[];
  timezone: string;
  is_active: boolean;
  preferences: Record<string, any>;
}

const USERS_SEED_DATA: UserSeedData[] = [
  {
    email: 'john.developer@example.com',
    username: 'john_dev',
    expertise_level: 'intermediate',
    interests: ['javascript', 'react', 'node.js', 'web-development'],
    preferred_formats: ['article', 'tutorial'],
    timezone: 'America/New_York',
    is_active: true,
    preferences: {
      notification_frequency: 'daily',
      content_types: ['technical', 'news'],
      min_reading_time: 5,
      max_reading_time: 20
    }
  },
  {
    email: 'sarah.ml@example.com',
    username: 'sarah_ml',
    expertise_level: 'advanced',
    interests: ['machine-learning', 'python', 'data-science', 'artificial-intelligence'],
    preferred_formats: ['paper', 'article'],
    timezone: 'America/Los_Angeles',
    is_active: true,
    preferences: {
      notification_frequency: 'weekly',
      content_types: ['research', 'technical'],
      min_reading_time: 10,
      max_reading_time: 45
    }
  },
  {
    email: 'mike.fullstack@example.com',
    username: 'mike_fullstack',
    expertise_level: 'expert',
    interests: ['full-stack-development', 'cloud-computing', 'devops', 'architecture'],
    preferred_formats: ['article', 'tutorial', 'video'],
    timezone: 'Europe/London',
    is_active: true,
    preferences: {
      notification_frequency: 'bi-weekly',
      content_types: ['technical', 'case-study'],
      min_reading_time: 15,
      max_reading_time: 60
    }
  }
];

export interface SeedResult {
  created: number;
  skipped: number;
  errors?: string[];
}

export async function seedUsers(db: DatabaseConnection, config: SeedConfig): Promise<SeedResult> {
  const result: SeedResult = {
    created: 0,
    skipped: 0,
    errors: []
  };

  logger.info('Starting users seeding...', {
    totalUsers: USERS_SEED_DATA.length,
    environment: config.environment
  });

  for (const user of USERS_SEED_DATA) {
    try {
      if (config.skipExisting) {
        const existing = await db.queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM users WHERE email = $1',
          [user.email]
        );

        if (existing && existing.count > 0) {
          result.skipped++;
          if (config.verbose) {
            logger.debug(`Skipped existing user: ${user.email}`);
          }
          continue;
        }
      }

      const insertQuery = `
        INSERT INTO users (
          email, username, expertise_level, interests, preferred_formats,
          timezone, is_active, preferences
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const insertParams = [
        user.email,
        user.username,
        user.expertise_level,
        user.interests,
        user.preferred_formats,
        user.timezone,
        user.is_active,
        JSON.stringify(user.preferences)
      ];

      const inserted = await db.queryOne<{ id: string }>(insertQuery, insertParams);
      
      if (inserted) {
        result.created++;
        if (config.verbose) {
          logger.debug(`Created user: ${user.email}`, { id: inserted.id });
        }
      }

    } catch (error) {
      const errorMessage = `Failed to seed user ${user.email}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors?.push(errorMessage);
      logger.error(errorMessage, { user: user.email });
    }
  }

  return result;
}