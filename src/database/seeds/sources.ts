/**
 * @fileoverview Sources table seed data with comprehensive content feeds
 * @lastmodified 2025-07-28T00:45:59Z
 * 
 * Features: RSS feeds, API endpoints, web scrapers, social monitors with configurations
 * Main APIs: seedSources(), SourceSeedData interface
 * Constraints: Requires sources table, validates unique names when skipExisting enabled
 * Patterns: JSON configuration storage, reputation scoring, frequency scheduling
 */

import { DatabaseConnection } from '@database/connection';
import { SeedConfig } from './index';
import logger from '@utils/logger';

export interface SourceSeedData {
  name: string;
  url: string;
  type: 'rss' | 'api' | 'scraper' | 'social' | 'manual';
  reputation: number;
  is_active: boolean;
  check_frequency: number; // minutes
  success_rate: number;
  avg_quality_score: number;
  configuration: Record<string, any>;
}

/**
 * Comprehensive seed data for content sources
 */
const SOURCES_SEED_DATA: SourceSeedData[] = [
  // Major Tech Publications (RSS)
  {
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    type: 'rss',
    reputation: 0.85,
    is_active: true,
    check_frequency: 15, // Check every 15 minutes
    success_rate: 0.98,
    avg_quality_score: 0.8,
    configuration: {
      max_items: 50,
      min_score: 50,
      exclude_jobs: true,
      exclude_show_hn: false
    }
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    type: 'rss',
    reputation: 0.78,
    is_active: true,
    check_frequency: 30,
    success_rate: 0.95,
    avg_quality_score: 0.75,
    configuration: {
      max_items: 20,
      categories: ['startups', 'ai', 'enterprise', 'security']
    }
  },
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    type: 'rss',
    reputation: 0.82,
    is_active: true,
    check_frequency: 45,
    success_rate: 0.97,
    avg_quality_score: 0.85,
    configuration: {
      max_items: 15,
      focus_areas: ['science', 'technology', 'policy']
    }
  },
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    type: 'rss',
    reputation: 0.74,
    is_active: true,
    check_frequency: 30,
    success_rate: 0.93,
    avg_quality_score: 0.72,
    configuration: {
      max_items: 20,
      exclude_reviews: false
    }
  },
  {
    name: 'Wired',
    url: 'https://www.wired.com/feed/rss',
    type: 'rss',
    reputation: 0.80,
    is_active: true,
    check_frequency: 60,
    success_rate: 0.94,
    avg_quality_score: 0.82,
    configuration: {
      max_items: 10,
      focus_areas: ['future-tech', 'science', 'culture']
    }
  },

  // Developer-Focused Publications
  {
    name: 'Dev.to',
    url: 'https://dev.to/feed',
    type: 'rss',
    reputation: 0.65,
    is_active: true,
    check_frequency: 20,
    success_rate: 0.96,
    avg_quality_score: 0.65,
    configuration: {
      max_items: 30,
      min_reactions: 10,
      exclude_beginner: false
    }
  },
  {
    name: 'Stack Overflow Blog',
    url: 'https://stackoverflow.blog/feed/',
    type: 'rss',
    reputation: 0.88,
    is_active: true,
    check_frequency: 120,
    success_rate: 0.99,
    avg_quality_score: 0.87,
    configuration: {
      max_items: 5,
      focus_areas: ['developer-survey', 'engineering', 'community']
    }
  },
  {
    name: 'GitHub Blog',
    url: 'https://github.blog/feed/',
    type: 'rss',
    reputation: 0.86,
    is_active: true,
    check_frequency: 180,
    success_rate: 0.98,
    avg_quality_score: 0.84,
    configuration: {
      max_items: 10,
      categories: ['engineering', 'security', 'open-source']
    }
  },
  {
    name: 'Google Developers Blog',
    url: 'https://developers.googleblog.com/feeds/posts/default',
    type: 'rss',
    reputation: 0.84,
    is_active: true,
    check_frequency: 240,
    success_rate: 0.97,
    avg_quality_score: 0.83,
    configuration: {
      max_items: 8,
      focus_areas: ['web', 'mobile', 'cloud', 'ai']
    }
  },

  // AI/ML Specialized Sources
  {
    name: 'Towards Data Science',
    url: 'https://towardsdatascience.com/feed',
    type: 'rss',
    reputation: 0.79,
    is_active: true,
    check_frequency: 30,
    success_rate: 0.95,
    avg_quality_score: 0.78,
    configuration: {
      max_items: 25,
      min_claps: 100,
      focus_areas: ['machine-learning', 'data-science', 'ai']
    }
  },
  {
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    type: 'rss',
    reputation: 0.91,
    is_active: true,
    check_frequency: 120,
    success_rate: 0.96,
    avg_quality_score: 0.89,
    configuration: {
      max_items: 8,
      focus_areas: ['emerging-tech', 'ai', 'biotechnology']
    }
  },
  {
    name: 'AI News',
    url: 'https://artificialintelligence-news.com/feed/',
    type: 'rss',
    reputation: 0.72,
    is_active: true,
    check_frequency: 60,
    success_rate: 0.92,
    avg_quality_score: 0.71,
    configuration: {
      max_items: 15,
      categories: ['industry', 'research', 'applications']
    }
  },

  // Academic Sources (API)
  {
    name: 'arXiv Computer Science',
    url: 'http://export.arxiv.org/api/query',
    type: 'api',
    reputation: 0.95,
    is_active: true,
    check_frequency: 360, // Check every 6 hours
    success_rate: 0.99,
    avg_quality_score: 0.92,
    configuration: {
      search_query: 'cat:cs.AI OR cat:cs.LG OR cat:cs.CV',
      max_results: 50,
      sort_by: 'submittedDate',
      sort_order: 'descending'
    }
  },
  {
    name: 'Papers With Code',
    url: 'https://paperswithcode.com/api/v1/papers/',
    type: 'api',
    reputation: 0.89,
    is_active: true,
    check_frequency: 480, // Check every 8 hours
    success_rate: 0.97,
    avg_quality_score: 0.88,
    configuration: {
      ordering: '-published',
      has_code: true,
      categories: ['computer-vision', 'natural-language-processing', 'machine-learning']
    }
  },

  // Web Scrapers for Specific Sites
  {
    name: 'Medium Technology',
    url: 'https://medium.com/topic/technology',
    type: 'scraper',
    reputation: 0.68,
    is_active: true,
    check_frequency: 45,
    success_rate: 0.89,
    avg_quality_score: 0.67,
    configuration: {
      selectors: {
        articles: 'article',
        title: 'h2',
        author: '[data-testid="authorName"]',
        claps: '[data-testid="clapMeter"]'
      },
      min_claps: 50,
      max_articles: 20
    }
  },
  {
    name: 'Product Hunt Tech',
    url: 'https://www.producthunt.com/topics/tech',
    type: 'scraper',
    reputation: 0.61,
    is_active: true,
    check_frequency: 60,
    success_rate: 0.85,
    avg_quality_score: 0.63,
    configuration: {
      selectors: {
        products: '[data-test="post-item"]',
        name: '[data-test="post-name"]',
        description: '[data-test="post-tagline"]',
        votes: '[data-test="vote-button"]'
      },
      min_votes: 100
    }
  },

  // Social Media Sources
  {
    name: 'Twitter Tech Influencers',
    url: 'https://api.twitter.com/2/tweets/search/recent',
    type: 'social',
    reputation: 0.58,
    is_active: false, // Disabled due to API costs
    check_frequency: 30,
    success_rate: 0.82,
    avg_quality_score: 0.55,
    configuration: {
      query: 'from:karpathy OR from:ylecun OR from:AndrewYNg -is:retweet',
      max_results: 10,
      tweet_fields: 'public_metrics,created_at,author_id'
    }
  },
  {
    name: 'Reddit Programming',
    url: 'https://www.reddit.com/r/programming.json',
    type: 'api',
    reputation: 0.71,
    is_active: true,
    check_frequency: 45,
    success_rate: 0.94,
    avg_quality_score: 0.69,
    configuration: {
      limit: 25,
      sort: 'hot',
      min_score: 100,
      exclude_stickied: true
    }
  },

  // Specialized Tech Areas
  {
    name: 'Kubernetes Blog',
    url: 'https://kubernetes.io/feed.xml',
    type: 'rss',
    reputation: 0.87,
    is_active: true,
    check_frequency: 360,
    success_rate: 0.98,
    avg_quality_score: 0.86,
    configuration: {
      max_items: 5,
      focus_areas: ['releases', 'community', 'case-studies']
    }
  },
  {
    name: 'Docker Blog',
    url: 'https://www.docker.com/blog/feed/',
    type: 'rss',
    reputation: 0.83,
    is_active: true,
    check_frequency: 240,
    success_rate: 0.96,
    avg_quality_score: 0.81,
    configuration: {
      max_items: 8,
      categories: ['engineering', 'community', 'product']
    }
  },
  {
    name: 'AWS Blog',
    url: 'https://aws.amazon.com/blogs/aws/feed/',
    type: 'rss',
    reputation: 0.85,
    is_active: true,
    check_frequency: 180,
    success_rate: 0.97,
    avg_quality_score: 0.83,
    configuration: {
      max_items: 10,
      focus_areas: ['new-services', 'best-practices', 'case-studies']
    }
  },

  // Security-Focused Sources
  {
    name: 'Krebs on Security',
    url: 'https://krebsonsecurity.com/feed/',
    type: 'rss',
    reputation: 0.92,
    is_active: true,
    check_frequency: 240,
    success_rate: 0.98,
    avg_quality_score: 0.90,
    configuration: {
      max_items: 5,
      focus_areas: ['cybersecurity', 'data-breaches', 'fraud']
    }
  },
  {
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    type: 'rss',
    reputation: 0.76,
    is_active: true,
    check_frequency: 60,
    success_rate: 0.94,
    avg_quality_score: 0.74,
    configuration: {
      max_items: 15,
      categories: ['cybersecurity', 'data-privacy', 'hacking']
    }
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
 * Seed sources table with comprehensive data
 */
export async function seedSources(db: DatabaseConnection, config: SeedConfig): Promise<SeedResult> {
  const result: SeedResult = {
    created: 0,
    skipped: 0,
    errors: []
  };

  logger.info('Starting sources seeding...', {
    totalSources: SOURCES_SEED_DATA.length,
    environment: config.environment
  });

  try {
    for (const source of SOURCES_SEED_DATA) {
      try {
        // Check if source already exists
        if (config.skipExisting) {
          const existing = await db.queryOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM sources WHERE name = $1',
            [source.name]
          );

          if (existing && existing.count > 0) {
            result.skipped++;
            if (config.verbose) {
              logger.debug(`Skipped existing source: ${source.name}`);
            }
            continue;
          }
        }

        // Insert new source
        const insertQuery = `
          INSERT INTO sources (
            name, url, type, reputation, is_active, check_frequency,
            success_rate, avg_quality_score, configuration
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `;

        const insertParams = [
          source.name,
          source.url,
          source.type,
          source.reputation,
          source.is_active,
          source.check_frequency,
          source.success_rate,
          source.avg_quality_score,
          JSON.stringify(source.configuration)
        ];

        const inserted = await db.queryOne<{ id: string }>(insertQuery, insertParams);
        
        if (inserted) {
          result.created++;
          if (config.verbose) {
            logger.debug(`Created source: ${source.name}`, { 
              id: inserted.id,
              type: source.type,
              reputation: source.reputation
            });
          }
        }

      } catch (error) {
        const errorMessage = `Failed to seed source ${source.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors?.push(errorMessage);
        logger.error(errorMessage, { source: source.name });
      }
    }

    logger.info('Sources seeding completed', {
      created: result.created,
      skipped: result.skipped,
      errors: result.errors?.length || 0
    });

  } catch (error) {
    const errorMessage = `Sources seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    result.errors?.push(errorMessage);
    logger.error(errorMessage);
    throw error;
  }

  return result;
}