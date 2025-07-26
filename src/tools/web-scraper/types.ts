export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  summary?: string;
  author?: string;
  publishDate?: Date;
  tags?: string[];
  metadata: {
    scrapedAt: Date;
    scraperVersion: string;
    contentLength: number;
    hasCodeExamples: boolean;
    hasImages: boolean;
    language?: string;
  };
}

export interface ScraperConfig {
  userAgent: string;
  requestDelay: number; // milliseconds between requests
  timeout: number; // request timeout in milliseconds
  maxRetries: number;
  respectRobotsTxt: boolean;
  enableJavaScript: boolean;
  proxy?: {
    host: string;
    port: number;
    auth?: {
      username: string;
      password: string;
    };
  };
}

export interface SiteParser {
  domain: string;
  name: string;
  selectors: {
    title: string;
    content: string;
    author?: string;
    publishDate?: string;
    tags?: string;
    summary?: string;
  };
  contentProcessor?: (content: string) => string;
  dateParser?: (dateString: string) => Date | null;
  isSupported: (url: string) => boolean;
}

export interface ScrapingResult {
  success: boolean;
  content?: ScrapedContent;
  error?: {
    code: 'NETWORK_ERROR' | 'PARSE_ERROR' | 'ROBOTS_BLOCKED' | 'RATE_LIMITED' | 'TIMEOUT';
    message: string;
    details?: any;
  };
  metrics: {
    requestTime: number;
    parseTime: number;
    totalTime: number;
    retryCount: number;
  };
}

export interface RobotsTxtResult {
  isAllowed: boolean;
  crawlDelay?: number;
  userAgent: string;
}

export interface RequestThrottleInfo {
  domain: string;
  lastRequestTime: number;
  requestCount: number;
  resetTime: number;
}