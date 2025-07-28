/**
 * @fileoverview Robots.txt compliance checker for ethical web scraping
 * @lastmodified 2025-07-28T00:55:47Z
 * 
 * Features: Robots.txt parsing, crawl delay detection, caching, permissive fallbacks
 * Main APIs: RobotsChecker class, checkRobotsTxt(), clearCache(), getCacheStats()
 * Constraints: 24h cache TTL, 5s fetch timeout, defaults to allow on errors
 * Patterns: LRU-style caching, graceful degradation, domain-based grouping
 */

import robotsParser from 'robots-parser';
import axios from 'axios';
import { injectable, inject } from 'inversify';
import { Logger } from 'winston';
import { TOKENS } from '../../container/tokens';
import { RobotsTxtResult } from './types';

@injectable()
export class RobotsChecker {
  private robotsCache = new Map<string, { robots: any; timestamp: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @inject(TOKENS.Logger) private logger: Logger
  ) {}

  async checkRobotsTxt(url: string, userAgent: string = '*'): Promise<RobotsTxtResult> {
    try {
      const domain = this.extractDomain(url);
      const robotsUrl = `${domain}/robots.txt`;
      
      let robots = await this.getRobotsFromCache(domain);
      
      if (!robots) {
        robots = await this.fetchAndParseRobots(robotsUrl, userAgent);
        this.cacheRobots(domain, robots);
      }

      const isAllowed = robots.isAllowed(url, userAgent);
      const crawlDelay = robots.getCrawlDelay(userAgent);

      return {
        isAllowed,
        crawlDelay: crawlDelay || undefined,
        userAgent
      };
    } catch (error) {
      this.logger.warn('Failed to check robots.txt, allowing by default', {
        url,
        userAgent,
        error: error instanceof Error ? error.message : error
      });
      
      // Default to allowing if robots.txt check fails
      return {
        isAllowed: true,
        userAgent
      };
    }
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  private async getRobotsFromCache(domain: string): Promise<any | null> {
    const cached = this.robotsCache.get(domain);
    
    if (!cached) {
      return null;
    }

    const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL;
    if (isExpired) {
      this.robotsCache.delete(domain);
      return null;
    }

    return cached.robots;
  }

  private async fetchAndParseRobots(robotsUrl: string, userAgent: string): Promise<any> {
    try {
      const response = await axios.get(robotsUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': userAgent
        },
        validateStatus: (status) => status === 200 || status === 404
      });

      if (response.status === 404) {
        // No robots.txt found, create permissive robots
        return robotsParser(robotsUrl, '');
      }

      return robotsParser(robotsUrl, response.data);
    } catch (error) {
      this.logger.debug('Failed to fetch robots.txt', {
        robotsUrl,
        error: error instanceof Error ? error.message : error
      });
      
      // Return permissive robots if fetch fails
      return robotsParser(robotsUrl, '');
    }
  }

  private cacheRobots(domain: string, robots: any): void {
    this.robotsCache.set(domain, {
      robots,
      timestamp: Date.now()
    });

    // Clean up old entries if cache gets too large
    if (this.robotsCache.size > 1000) {
      const oldestEntries = Array.from(this.robotsCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)
        .slice(0, 100);

      oldestEntries.forEach(([domain]) => {
        this.robotsCache.delete(domain);
      });
    }
  }

  clearCache(): void {
    this.robotsCache.clear();
    this.logger.info('Robots.txt cache cleared');
  }

  getCacheStats(): { size: number; domains: string[] } {
    return {
      size: this.robotsCache.size,
      domains: Array.from(this.robotsCache.keys())
    };
  }
}