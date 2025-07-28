/**
 * @fileoverview Tags table seed data with hierarchical taxonomy
 * @lastmodified 2025-07-28T00:45:59Z
 * 
 * Features: Hierarchical topics, technologies, frameworks, difficulty levels, use cases
 * Main APIs: seedTags(), createTag(), TagSeedData interface
 * Constraints: Requires tags table, handles parent-child relationships, two-pass creation
 * Patterns: Parent-child mapping, category-based organization, usage count tracking
 */

import { DatabaseConnection } from '@database/connection';
import { SeedConfig } from './index';
import logger from '@utils/logger';

export interface TagSeedData {
  name: string;
  category: 'topic' | 'difficulty' | 'use_case' | 'technology' | 'framework' | 'domain';
  description?: string;
  parent_tag?: string; // Name of parent tag
  is_active: boolean;
  usage_count: number;
}

/**
 * Comprehensive seed data for tags with hierarchical structure
 */
const TAGS_SEED_DATA: TagSeedData[] = [
  // Core Technology Topics (Parent Categories)
  {
    name: 'artificial-intelligence',
    category: 'topic',
    description: 'Artificial Intelligence and Machine Learning technologies',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'web-development',
    category: 'topic',
    description: 'Frontend and backend web development',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'mobile-development',
    category: 'topic',
    description: 'iOS, Android, and cross-platform mobile development',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'cloud-computing',
    category: 'topic',
    description: 'Cloud platforms, services, and architectures',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'data-science',
    category: 'topic',
    description: 'Data analysis, visualization, and scientific computing',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'cybersecurity',
    category: 'topic',
    description: 'Information security, privacy, and cybersecurity practices',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'devops',
    category: 'topic',
    description: 'Development operations, CI/CD, and infrastructure',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'blockchain',
    category: 'topic',
    description: 'Blockchain technology, cryptocurrencies, and DeFi',
    is_active: true,
    usage_count: 0
  },

  // AI/ML Subtopics
  {
    name: 'machine-learning',
    category: 'topic',
    description: 'Machine learning algorithms and techniques',
    parent_tag: 'artificial-intelligence',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'deep-learning',
    category: 'topic',
    description: 'Deep neural networks and architectures',
    parent_tag: 'machine-learning',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'computer-vision',
    category: 'topic',
    description: 'Image processing and computer vision',
    parent_tag: 'artificial-intelligence',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'natural-language-processing',
    category: 'topic',
    description: 'NLP, text processing, and language models',
    parent_tag: 'artificial-intelligence',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'reinforcement-learning',
    category: 'topic',
    description: 'RL algorithms and applications',
    parent_tag: 'machine-learning',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'neural-networks',
    category: 'topic',
    description: 'Neural network architectures and training',
    parent_tag: 'deep-learning',
    is_active: true,
    usage_count: 0
  },

  // Web Development Subtopics
  {
    name: 'frontend-development',
    category: 'topic',
    description: 'Client-side web development',
    parent_tag: 'web-development',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'backend-development',
    category: 'topic',
    description: 'Server-side web development',
    parent_tag: 'web-development',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'full-stack-development',
    category: 'topic',
    description: 'End-to-end web application development',
    parent_tag: 'web-development',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'web-performance',
    category: 'topic',
    description: 'Website optimization and performance',
    parent_tag: 'web-development',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'progressive-web-apps',
    category: 'topic',
    description: 'PWA development and implementation',
    parent_tag: 'web-development',
    is_active: true,
    usage_count: 0
  },

  // Technology/Framework Tags
  {
    name: 'javascript',
    category: 'technology',
    description: 'JavaScript programming language',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'python',
    category: 'technology',
    description: 'Python programming language',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'typescript',
    category: 'technology',
    description: 'TypeScript programming language',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'java',
    category: 'technology',
    description: 'Java programming language',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'go',
    category: 'technology',
    description: 'Go programming language',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'rust',
    category: 'technology',
    description: 'Rust programming language',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'c-plus-plus',
    category: 'technology',
    description: 'C++ programming language',
    is_active: true,
    usage_count: 0
  },

  // Framework Tags
  {
    name: 'react',
    category: 'framework',
    description: 'React JavaScript library',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'vue.js',
    category: 'framework',
    description: 'Vue.js JavaScript framework',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'angular',
    category: 'framework',
    description: 'Angular web application framework',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'node.js',
    category: 'framework',
    description: 'Node.js JavaScript runtime',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'express.js',
    category: 'framework',
    description: 'Express.js web framework for Node.js',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'django',
    category: 'framework',
    description: 'Django Python web framework',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'flask',
    category: 'framework',
    description: 'Flask Python web framework',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'spring-boot',
    category: 'framework',
    description: 'Spring Boot Java framework',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'tensorflow',
    category: 'framework',
    description: 'TensorFlow machine learning framework',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'pytorch',
    category: 'framework',
    description: 'PyTorch machine learning framework',
    is_active: true,
    usage_count: 0
  },

  // Cloud Platform Tags
  {
    name: 'aws',
    category: 'technology',
    description: 'Amazon Web Services cloud platform',
    parent_tag: 'cloud-computing',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'azure',
    category: 'technology',
    description: 'Microsoft Azure cloud platform',
    parent_tag: 'cloud-computing',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'google-cloud',
    category: 'technology',
    description: 'Google Cloud Platform',
    parent_tag: 'cloud-computing',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'kubernetes',
    category: 'technology',
    description: 'Kubernetes container orchestration',
    parent_tag: 'devops',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'docker',
    category: 'technology',
    description: 'Docker containerization platform',
    parent_tag: 'devops',
    is_active: true,
    usage_count: 0
  },

  // Difficulty Level Tags
  {
    name: 'beginner',
    category: 'difficulty',
    description: 'Suitable for beginners and newcomers',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'intermediate',
    category: 'difficulty',
    description: 'Requires some experience and knowledge',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'advanced',
    category: 'difficulty',
    description: 'For experienced practitioners',
    is_active: true,
    usage_count: 0
  },

  // Use Case Tags
  {
    name: 'tutorial',
    category: 'use_case',
    description: 'Step-by-step learning content',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'best-practices',
    category: 'use_case',
    description: 'Industry best practices and guidelines',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'case-study',
    category: 'use_case',
    description: 'Real-world implementation examples',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'architecture',
    category: 'use_case',
    description: 'System design and architecture patterns',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'performance-optimization',
    category: 'use_case',
    description: 'Performance tuning and optimization',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'debugging',
    category: 'use_case',
    description: 'Debugging techniques and tools',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'testing',
    category: 'use_case',
    description: 'Software testing methodologies',
    is_active: true,
    usage_count: 0
  },

  // Domain-Specific Tags
  {
    name: 'fintech',
    category: 'domain',
    description: 'Financial technology applications',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'healthcare',
    category: 'domain',
    description: 'Healthcare and medical technology',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'e-commerce',
    category: 'domain',
    description: 'E-commerce platforms and solutions',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'gaming',
    category: 'domain',
    description: 'Game development and gaming technology',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'education',
    category: 'domain',
    description: 'Educational technology and e-learning',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'iot',
    category: 'domain',
    description: 'Internet of Things applications',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'automotive',
    category: 'domain',
    description: 'Automotive technology and autonomous vehicles',
    is_active: true,
    usage_count: 0
  },

  // Specialized Technologies
  {
    name: 'graphql',
    category: 'technology',
    description: 'GraphQL query language and runtime',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'rest-api',
    category: 'technology',
    description: 'RESTful API design and implementation',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'microservices',
    category: 'use_case',
    description: 'Microservices architecture pattern',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'serverless',
    category: 'technology',
    description: 'Serverless computing and functions',
    parent_tag: 'cloud-computing',
    is_active: true,
    usage_count: 0
  },
  {
    name: 'edge-computing',
    category: 'technology',
    description: 'Edge computing and distributed systems',
    is_active: true,
    usage_count: 0
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
 * Seed tags table with hierarchical structure
 */
export async function seedTags(db: DatabaseConnection, config: SeedConfig): Promise<SeedResult> {
  const result: SeedResult = {
    created: 0,
    skipped: 0,
    errors: []
  };

  logger.info('Starting tags seeding...', {
    totalTags: TAGS_SEED_DATA.length,
    environment: config.environment
  });

  try {
    // Track created tags by name for parent-child relationships
    const createdTags = new Map<string, string>(); // name -> id

    // First pass: Create tags without parent relationships
    const tagsWithoutParents = TAGS_SEED_DATA.filter(tag => !tag.parent_tag);
    
    for (const tag of tagsWithoutParents) {
      try {
        const tagId = await createTag(db, tag, null, config, result);
        if (tagId) {
          createdTags.set(tag.name, tagId);
        }
      } catch (error) {
        const errorMessage = `Failed to seed tag ${tag.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors?.push(errorMessage);
        logger.error(errorMessage, { tag: tag.name });
      }
    }

    // Second pass: Create tags with parent relationships
    const tagsWithParents = TAGS_SEED_DATA.filter(tag => tag.parent_tag);
    
    for (const tag of tagsWithParents) {
      try {
        const parentId = createdTags.get(tag.parent_tag!);
        if (!parentId && config.skipExisting) {
          // Try to find existing parent
          const existingParent = await db.queryOne<{ id: string }>(
            'SELECT id FROM tags WHERE name = $1',
            [tag.parent_tag!]
          );
          if (existingParent) {
            createdTags.set(tag.parent_tag!, existingParent.id);
          }
        }
        
        const finalParentId = createdTags.get(tag.parent_tag!) || null;
        const tagId = await createTag(db, tag, finalParentId, config, result);
        if (tagId) {
          createdTags.set(tag.name, tagId);
        }
      } catch (error) {
        const errorMessage = `Failed to seed tag ${tag.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors?.push(errorMessage);
        logger.error(errorMessage, { tag: tag.name });
      }
    }

    logger.info('Tags seeding completed', {
      created: result.created,
      skipped: result.skipped,
      errors: result.errors?.length || 0
    });

  } catch (error) {
    const errorMessage = `Tags seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    result.errors?.push(errorMessage);
    logger.error(errorMessage);
    throw error;
  }

  return result;
}

/**
 * Helper function to create a single tag
 */
async function createTag(
  db: DatabaseConnection, 
  tag: TagSeedData, 
  parentId: string | null, 
  config: SeedConfig,
  result: SeedResult
): Promise<string | null> {
  // Check if tag already exists
  if (config.skipExisting) {
    const existing = await db.queryOne<{ id: string }>(
      'SELECT id FROM tags WHERE name = $1',
      [tag.name]
    );

    if (existing) {
      result.skipped++;
      if (config.verbose) {
        logger.debug(`Skipped existing tag: ${tag.name}`);
      }
      return existing.id;
    }
  }

  // Insert new tag
  const insertQuery = `
    INSERT INTO tags (
      name, category, description, parent_tag_id, is_active, usage_count
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `;

  const insertParams = [
    tag.name,
    tag.category,
    tag.description || null,
    parentId,
    tag.is_active,
    tag.usage_count
  ];

  const inserted = await db.queryOne<{ id: string }>(insertQuery, insertParams);
  
  if (inserted) {
    result.created++;
    if (config.verbose) {
      logger.debug(`Created tag: ${tag.name}`, { 
        id: inserted.id,
        category: tag.category,
        hasParent: !!parentId
      });
    }
    return inserted.id;
  }

  return null;
}