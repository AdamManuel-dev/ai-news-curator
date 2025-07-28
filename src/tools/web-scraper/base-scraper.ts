/**
 * @fileoverview Base web scraper with robots.txt compliance and retry logic
 * @lastmodified 2025-07-28T00:55:47Z
 * 
 * Features: Content extraction, robots.txt compliance, retry mechanism, custom parsers
 * Main APIs: BaseScraper class, scrapeUrl(), fetchContent(), parseContent()
 * Constraints: Requires axios, cheerio, dependency injection, robots checker
 * Patterns: Template method, retry with backoff, site-specific parsers, generic fallbacks
 */

import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { injectable, inject } from 'inversify';
import { Logger } from 'winston';
import { TOKENS } from '../../container/tokens';
import { 
  ScrapedContent, 
  ScraperConfig, 
  SiteParser, 
  ScrapingResult 
} from './types';
import { RobotsChecker } from './robots-checker';
import { RequestThrottle } from './request-throttle';

@injectable()
export class BaseScraper {
  private readonly config: ScraperConfig;
  private readonly version = '1.0.0';

  constructor(
    @inject(TOKENS.Logger) private logger: Logger,
    @inject(TOKENS.RobotsChecker) private robotsChecker: RobotsChecker,
    @inject(TOKENS.RequestThrottle) private requestThrottle: RequestThrottle,
    config?: Partial<ScraperConfig>
  ) {
    this.config = {
      userAgent: 'AI-Content-Curator-Bot/1.0.0 (+https://ai-content-curator.com/bot)',
      requestDelay: 1000,
      timeout: 30000,
      maxRetries: 3,
      respectRobotsTxt: true,
      enableJavaScript: false,
      ...config
    };
  }

  async scrapeUrl(url: string, parser?: SiteParser): Promise<ScrapingResult> {
    const startTime = Date.now();
    let retryCount = 0;

    this.logger.info('Starting scrape', { url, parser: parser?.name });

    // Check robots.txt compliance
    if (this.config.respectRobotsTxt) {
      const robotsResult = await this.robotsChecker.checkRobotsTxt(url, this.config.userAgent);
      
      if (!robotsResult.isAllowed) {
        this.logger.warn('Robots.txt disallows scraping', { url, userAgent: this.config.userAgent });
        return {
          success: false,
          error: {
            code: 'ROBOTS_BLOCKED',
            message: 'Site robots.txt disallows scraping',
            details: { robotsResult }
          },
          metrics: {
            requestTime: 0,
            parseTime: 0,
            totalTime: Date.now() - startTime,
            retryCount
          }
        };
      }

      // Use crawl delay from robots.txt if specified
      if (robotsResult.crawlDelay) {
        await this.requestThrottle.waitForTurn(url, robotsResult.crawlDelay * 1000);
      } else {
        await this.requestThrottle.waitForTurn(url, this.config.requestDelay);
      }
    } else {
      await this.requestThrottle.waitForTurn(url, this.config.requestDelay);
    }

    while (retryCount <= this.config.maxRetries) {
      try {
        const requestStartTime = Date.now();
        const response = await this.fetchContent(url);
        const requestTime = Date.now() - requestStartTime;

        const parseStartTime = Date.now();
        const content = await this.parseContent(response.data, url, parser);
        const parseTime = Date.now() - parseStartTime;

        const totalTime = Date.now() - startTime;

        this.logger.info('Scrape completed successfully', {
          url,
          contentLength: content.content.length,
          totalTime,
          retryCount
        });

        return {
          success: true,
          content,
          metrics: {
            requestTime,
            parseTime,
            totalTime,
            retryCount
          }
        };

      } catch (error) {
        retryCount++;
        const isLastRetry = retryCount > this.config.maxRetries;

        this.logger.warn('Scrape attempt failed', {
          url,
          attempt: retryCount,
          maxRetries: this.config.maxRetries,
          error: error instanceof Error ? error.message : error,
          willRetry: !isLastRetry
        });

        if (isLastRetry) {
          return {
            success: false,
            error: {
              code: this.getErrorCode(error),
              message: error instanceof Error ? error.message : 'Unknown error',
              details: { originalError: error, retryCount }
            },
            metrics: {
              requestTime: 0,
              parseTime: 0,
              totalTime: Date.now() - startTime,
              retryCount
            }
          };
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected end of retry loop');
  }

  private async fetchContent(url: string): Promise<AxiosResponse<string>> {
    return axios.get(url, {
      timeout: this.config.timeout,
      headers: {
        'User-Agent': this.config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      },
      responseType: 'text',
      maxRedirects: 5,
      proxy: this.config.proxy ? {
        host: this.config.proxy.host,
        port: this.config.proxy.port,
        auth: this.config.proxy.auth
      } : undefined
    });
  }

  private async parseContent(html: string, url: string, parser?: SiteParser): Promise<ScrapedContent> {
    const $ = cheerio.load(html);
    
    let title = '';
    let content = '';
    let author: string | undefined;
    let publishDate: Date | undefined;
    let summary: string | undefined;
    let tags: string[] = [];

    if (parser && parser.isSupported(url)) {
      // Use custom parser
      title = this.extractText($, parser.selectors.title);
      content = parser.contentProcessor ? 
        parser.contentProcessor(this.extractText($, parser.selectors.content)) :
        this.extractText($, parser.selectors.content);
      
      if (parser.selectors.author) {
        author = this.extractText($, parser.selectors.author);
      }
      
      if (parser.selectors.publishDate) {
        const dateStr = this.extractText($, parser.selectors.publishDate);
        publishDate = parser.dateParser ? 
          parser.dateParser(dateStr) : 
          this.parseDate(dateStr);
      }
      
      if (parser.selectors.summary) {
        summary = this.extractText($, parser.selectors.summary);
      }
      
      if (parser.selectors.tags) {
        tags = this.extractTags($, parser.selectors.tags);
      }
    } else {
      // Use generic parsing
      title = this.extractGenericTitle($);
      content = this.extractGenericContent($);
      author = this.extractGenericAuthor($);
      publishDate = this.extractGenericDate($);
      summary = this.extractGenericSummary($);
    }

    // Clean and validate content
    title = this.cleanText(title);
    content = this.cleanText(content);
    summary = summary ? this.cleanText(summary) : undefined;

    if (!title || !content) {
      throw new Error('Failed to extract required content (title or body)');
    }

    return {
      url,
      title,
      content,
      summary,
      author,
      publishDate,
      tags,
      metadata: {
        scrapedAt: new Date(),
        scraperVersion: this.version,
        contentLength: content.length,
        hasCodeExamples: this.hasCodeExamples($),
        hasImages: this.hasImages($),
        language: this.detectLanguage($)
      }
    };
  }

  private extractText($: cheerio.CheerioAPI, selector: string): string {
    return $(selector).map((_, el) => $(el).text()).get().join(' ').trim();
  }

  private extractTags($: cheerio.CheerioAPI, selector: string): string[] {
    return $(selector)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(tag => tag.length > 0);
  }

  private extractGenericTitle($: cheerio.CheerioAPI): string {
    // Try multiple selectors in order of preference
    const selectors = [
      'h1',
      'h2', 
      'title',
      '[property="og:title"]',
      '[name="twitter:title"]',
      '.title',
      '.headline'
    ];

    for (const selector of selectors) {
      const title = this.extractText($, selector);
      if (title) return title;
    }

    return '';
  }

  private extractGenericContent($: cheerio.CheerioAPI): string {
    // Remove script, style, and navigation elements
    $('script, style, nav, header, footer, aside, .navigation, .sidebar, .comments').remove();

    // Try content selectors in order of preference
    const selectors = [
      'article',
      '.content',
      '.post-content',
      '.entry-content',
      '.article-content',
      'main',
      '.main'
    ];

    for (const selector of selectors) {
      const content = this.extractText($, selector);
      if (content && content.length > 100) return content;
    }

    // Fallback to body content
    return this.extractText($, 'body');
  }

  private extractGenericAuthor($: cheerio.CheerioAPI): string | undefined {
    const selectors = [
      '.author',
      '.byline',
      '[rel="author"]',
      '[property="article:author"]',
      '[name="author"]'
    ];

    for (const selector of selectors) {
      const author = this.extractText($, selector);
      if (author) return author;
    }

    return undefined;
  }

  private extractGenericDate($: cheerio.CheerioAPI): Date | undefined {
    const selectors = [
      'time[datetime]',
      '.date',
      '.published',
      '[property="article:published_time"]'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      let dateStr = element.attr('datetime') || element.text();
      
      if (dateStr) {
        const date = this.parseDate(dateStr);
        if (date) return date;
      }
    }

    return undefined;
  }

  private extractGenericSummary($: cheerio.CheerioAPI): string | undefined {
    const selectors = [
      '[property="og:description"]',
      '[name="description"]',
      '[name="twitter:description"]',
      '.summary',
      '.excerpt'
    ];

    for (const selector of selectors) {
      const summary = $(selector).attr('content') || this.extractText($, selector);
      if (summary && summary.length > 20) return summary;
    }

    return undefined;
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Try various date formats
    const formats = [
      // ISO 8601
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      // Common date formats
      /^\d{4}-\d{2}-\d{2}/,
      /^\d{2}\/\d{2}\/\d{4}/,
      /^\d{2}-\d{2}-\d{4}/
    ];

    const cleanDateStr = dateStr.trim();
    const parsedDate = new Date(cleanDateStr);
    
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }

    return null;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[\r\n\t]/g, ' ')  // Remove line breaks and tabs
      .trim();
  }

  private hasCodeExamples($: cheerio.CheerioAPI): boolean {
    return $('code, pre, .code, .highlight').length > 0;
  }

  private hasImages($: cheerio.CheerioAPI): boolean {
    return $('img').length > 0;
  }

  private detectLanguage($: cheerio.CheerioAPI): string | undefined {
    const lang = $('html').attr('lang') || $('body').attr('lang');
    return lang || undefined;
  }

  private getErrorCode(error: any): 'NETWORK_ERROR' | 'PARSE_ERROR' | 'TIMEOUT' {
    if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
      return 'TIMEOUT';
    }
    if (error?.response || error?.request) {
      return 'NETWORK_ERROR';
    }
    return 'PARSE_ERROR';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  updateConfig(newConfig: Partial<ScraperConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.info('Scraper configuration updated', { config: this.config });
  }

  getConfig(): ScraperConfig {
    return { ...this.config };
  }
}