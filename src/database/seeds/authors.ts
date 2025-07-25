/**
 * @fileoverview Authors table seed data
 * 
 * Creates seed data for content authors including:
 * - Tech industry thought leaders
 * - Academic researchers
 * - Open source contributors
 * - Developer advocates
 * 
 * @module database/seeds/authors
 */

import { DatabaseConnection } from '@database/connection';
import { SeedConfig } from './index';
import logger from '@utils/logger';

export interface AuthorSeedData {
  name: string;
  email?: string;
  affiliation?: string;
  social_profiles: Record<string, string>;
  expertise: string[];
  reputation: number;
  is_verified: boolean;
}

/**
 * Comprehensive seed data for authors
 */
const AUTHORS_SEED_DATA: AuthorSeedData[] = [
  // Tech Industry Leaders
  {
    name: 'Linus Torvalds',
    email: 'torvalds@linux-foundation.org',
    affiliation: 'Linux Foundation',
    social_profiles: {
      github: 'torvalds',
      twitter: 'linus__torvalds'
    },
    expertise: ['linux', 'kernel-development', 'systems-programming', 'git', 'c-programming'],
    reputation: 0.98,
    is_verified: true
  },
  {
    name: 'Brendan Eich',
    affiliation: 'Brave Software',
    social_profiles: {
      twitter: 'BrendanEich',
      github: 'BrendanEich'
    },
    expertise: ['javascript', 'web-development', 'browser-technology', 'programming-languages'],
    reputation: 0.95,
    is_verified: true
  },
  {
    name: 'Dan Abramov',
    affiliation: 'Meta',
    social_profiles: {
      twitter: 'dan_abramov',
      github: 'gaearon'
    },
    expertise: ['react', 'javascript', 'frontend-development', 'redux', 'tooling'],
    reputation: 0.92,
    is_verified: true
  },
  {
    name: 'Andrej Karpathy',
    affiliation: 'OpenAI',
    social_profiles: {
      twitter: 'karpathy',
      github: 'karpathy'
    },
    expertise: ['machine-learning', 'deep-learning', 'computer-vision', 'neural-networks', 'ai'],
    reputation: 0.94,
    is_verified: true
  },
  {
    name: 'Yann LeCun',
    affiliation: 'Meta AI',
    social_profiles: {
      twitter: 'ylecun'
    },
    expertise: ['deep-learning', 'computer-vision', 'ai-research', 'convolutional-networks'],
    reputation: 0.97,
    is_verified: true
  },

  // Academic Researchers
  {
    name: 'Geoffrey Hinton',
    affiliation: 'University of Toronto',
    social_profiles: {
      twitter: 'geoffreyhinton'
    },
    expertise: ['neural-networks', 'deep-learning', 'machine-learning', 'ai-research'],
    reputation: 0.98,
    is_verified: true
  },
  {
    name: 'Fei-Fei Li',
    affiliation: 'Stanford University',
    social_profiles: {
      twitter: 'drfeifei'
    },
    expertise: ['computer-vision', 'ai-ethics', 'machine-learning', 'imagenet'],
    reputation: 0.96,
    is_verified: true
  },
  {
    name: 'Andrew Ng',
    affiliation: 'Stanford University',
    social_profiles: {
      twitter: 'AndrewYNg'
    },
    expertise: ['machine-learning', 'deep-learning', 'ai-education', 'coursera'],
    reputation: 0.95,
    is_verified: true
  },

  // Open Source Contributors
  {
    name: 'Evan You',
    social_profiles: {
      twitter: 'youyuxi',
      github: 'yyx990803'
    },
    expertise: ['vue.js', 'frontend-frameworks', 'javascript', 'web-development'],
    reputation: 0.91,
    is_verified: true
  },
  {
    name: 'Ryan Dahl',
    social_profiles: {
      twitter: 'rough__sea',
      github: 'ry'
    },
    expertise: ['node.js', 'deno', 'javascript', 'runtime-development', 'systems-programming'],
    reputation: 0.93,
    is_verified: true
  },
  {
    name: 'Guido van Rossum',
    affiliation: 'Microsoft',
    social_profiles: {
      twitter: 'gvanrossum',
      github: 'gvanrossum'
    },
    expertise: ['python', 'programming-languages', 'language-design'],
    reputation: 0.96,
    is_verified: true
  },

  // Developer Advocates & Educators
  {
    name: 'Kent C. Dodds',
    social_profiles: {
      twitter: 'kentcdodds',
      github: 'kentcdodds'
    },
    expertise: ['react', 'testing', 'javascript', 'web-development', 'education'],
    reputation: 0.89,
    is_verified: true
  },
  {
    name: 'Addy Osmani',
    affiliation: 'Google',
    social_profiles: {
      twitter: 'addyosmani',
      github: 'addyosmani'
    },
    expertise: ['web-performance', 'javascript', 'chrome-devtools', 'frontend-optimization'],
    reputation: 0.90,
    is_verified: true
  },
  {
    name: 'Kyle Simpson',
    social_profiles: {
      twitter: 'getify',
      github: 'getify'
    },
    expertise: ['javascript', 'functional-programming', 'education', 'you-dont-know-js'],
    reputation: 0.88,
    is_verified: true
  },

  // Industry Experts
  {
    name: 'Martin Fowler',
    affiliation: 'ThoughtWorks',
    social_profiles: {
      twitter: 'martinfowler'
    },
    expertise: ['software-architecture', 'refactoring', 'agile-development', 'enterprise-patterns'],
    reputation: 0.94,
    is_verified: true
  },
  {
    name: 'Robert C. Martin',
    social_profiles: {
      twitter: 'unclebobmartin'
    },
    expertise: ['clean-code', 'software-craftsmanship', 'agile-development', 'solid-principles'],
    reputation: 0.92,
    is_verified: true
  },
  {
    name: 'DHH (David Heinemeier Hansson)',
    affiliation: 'Basecamp',
    social_profiles: {
      twitter: 'dhh',
      github: 'dhh'
    },
    expertise: ['ruby-on-rails', 'web-development', 'startup-culture', 'business'],
    reputation: 0.87,
    is_verified: true
  },

  // Emerging Voices & Diverse Perspectives
  {
    name: 'Sarah Drasner',
    affiliation: 'Google',
    social_profiles: {
      twitter: 'sarah_edo',
      github: 'sdras'
    },
    expertise: ['vue.js', 'animation', 'javascript', 'frontend-development', 'developer-experience'],
    reputation: 0.86,
    is_verified: true
  },
  {
    name: 'Cassidy Williams',
    affiliation: 'Remote',
    social_profiles: {
      twitter: 'cassidoo',
      github: 'cassidoo'
    },
    expertise: ['javascript', 'react', 'developer-relations', 'education', 'career-advice'],
    reputation: 0.84,
    is_verified: true
  },
  {
    name: 'Ali Spittel',
    social_profiles: {
      twitter: 'ASpittel',
      github: 'aspittel'
    },
    expertise: ['python', 'web-development', 'education', 'diversity-in-tech', 'blogging'],
    reputation: 0.82,
    is_verified: true
  },
  {
    name: 'Quincy Larson',
    affiliation: 'freeCodeCamp',
    social_profiles: {
      twitter: 'ossia',
      github: 'QuincyLarson'
    },
    expertise: ['education', 'web-development', 'nonprofit', 'coding-bootcamps'],
    reputation: 0.85,
    is_verified: true
  }
];

/**
 * Seed result interface
 */
export interface SeedResult {
  created: number;
  skipped: number;
  errors?: string[];
}

/**
 * Seed authors table with comprehensive data
 */
export async function seedAuthors(db: DatabaseConnection, config: SeedConfig): Promise<SeedResult> {
  const result: SeedResult = {
    created: 0,
    skipped: 0,
    errors: []
  };

  logger.info('Starting authors seeding...', {
    totalAuthors: AUTHORS_SEED_DATA.length,
    environment: config.environment
  });

  try {
    for (const author of AUTHORS_SEED_DATA) {
      try {
        // Check if author already exists
        if (config.skipExisting) {
          const existing = await db.query<{ count: string }>(
            'SELECT COUNT(*) as count FROM authors WHERE name = $1',
            [author.name]
          );

          if (existing.rows[0] && parseInt(existing.rows[0].count) > 0) {
            result.skipped++;
            if (config.verbose) {
              logger.debug(`Skipped existing author: ${author.name}`);
            }
            continue;
          }
        }

        // Insert new author
        const insertQuery = `
          INSERT INTO authors (
            name, email, affiliation, social_profiles, expertise, 
            reputation, is_verified, content_count, avg_quality_score
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `;

        const insertParams = [
          author.name,
          author.email || null,
          author.affiliation || null,
          JSON.stringify(author.social_profiles),
          author.expertise,
          author.reputation,
          author.is_verified,
          0, // content_count - will be updated as content is added
          author.reputation // Use reputation as initial avg_quality_score
        ];

        const inserted = await db.query<{ id: string }>(insertQuery, insertParams);
        
        if (inserted.rows[0]) {
          result.created++;
          if (config.verbose) {
            logger.debug(`Created author: ${author.name}`, { id: inserted.rows[0].id });
          }
        }

      } catch (error) {
        const errorMessage = `Failed to seed author ${author.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors?.push(errorMessage);
        logger.error(errorMessage, { author: author.name });
      }
    }

    logger.info('Authors seeding completed', {
      created: result.created,
      skipped: result.skipped,
      errors: result.errors?.length || 0
    });

  } catch (error) {
    const errorMessage = `Authors seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    result.errors?.push(errorMessage);
    logger.error(errorMessage);
    throw error;
  }

  return result;
}