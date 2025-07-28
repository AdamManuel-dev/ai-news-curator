# Web Scraper Module

## Overview

The Web Scraper module provides ethical and robust content extraction capabilities for the AI News Curator system. It implements comprehensive scraping infrastructure with robots.txt compliance, rate limiting, retry mechanisms, and content parsing.

## Module Structure

```
src/tools/web-scraper/
├── base-scraper.ts         # Core scraping functionality
├── robots-checker.ts       # Robots.txt compliance checking
├── request-throttle.ts     # Polite crawling rate limiting
└── types.ts               # Type definitions for scraping
```

## Core Components

### Base Scraper (`src/tools/web-scraper/base-scraper.ts`)

The main scraping engine that orchestrates content extraction with built-in error handling and retry logic.

**Key Features:**
- **Robots.txt Compliance**: Automatically checks and respects robots.txt directives
- **Smart Rate Limiting**: Configurable delays with throttling to prevent server overload
- **Retry Mechanism**: Exponential backoff for failed requests (3 retries by default)
- **Content Parsing**: Generic and site-specific content extraction
- **Metadata Extraction**: Automatic detection of language, images, code examples

**Configuration Options:**
```typescript
interface ScraperConfig {
  userAgent: string;           // Bot identification
  requestDelay: number;        // Delay between requests (ms)
  timeout: number;             // Request timeout (ms)
  maxRetries: number;          // Maximum retry attempts
  respectRobotsTxt: boolean;   // Honor robots.txt
  enableJavaScript: boolean;   // JS rendering (future)
  proxy?: ProxyConfig;         // Proxy configuration
}
```

**Main Methods:**
- `scrapeUrl(url, parser?)` - Extract content from URL with optional custom parser
- `fetchContent(url)` - Low-level HTTP content retrieval
- `parseContent(html, url, parser?)` - Extract structured data from HTML
- `updateConfig(config)` - Modify scraper configuration

**Usage Example:**
```typescript
const scraper = new BaseScraper(logger, robotsChecker, throttle, {
  userAgent: 'AI-Content-Curator-Bot/1.0.0',
  requestDelay: 2000,
  respectRobotsTxt: true
});

const result = await scraper.scrapeUrl('https://example.com/article');
if (result.success) {
  console.log('Title:', result.content.title);
  console.log('Content:', result.content.content);
  console.log('Tags:', result.content.tags);
}
```

### Robots Checker (`src/tools/web-scraper/robots-checker.ts`)

Implements ethical scraping by checking and respecting robots.txt directives.

**Key Features:**
- **Robots.txt Parsing**: Full robots.txt standard compliance
- **User-Agent Matching**: Specific and wildcard directive support
- **Crawl Delay Extraction**: Automatic delay configuration from robots.txt
- **Caching**: Robots.txt responses cached to reduce requests
- **Fallback Handling**: Graceful handling when robots.txt unavailable

**Main Methods:**
- `checkRobotsTxt(url, userAgent)` - Check if URL is allowed for scraping
- `getRobotsContent(domain)` - Fetch and parse robots.txt file
- `isPathAllowed(path, rules)` - Evaluate path against robots.txt rules
- `getCrawlDelay(userAgent, robots)` - Extract recommended crawl delay

**Usage Example:**
```typescript
const robotsChecker = new RobotsChecker();
const result = await robotsChecker.checkRobotsTxt(
  'https://example.com/article',
  'AI-Content-Curator-Bot/1.0.0'
);

if (result.isAllowed) {
  console.log('Scraping allowed');
  if (result.crawlDelay) {
    console.log('Recommended delay:', result.crawlDelay, 'seconds');
  }
} else {
  console.log('Scraping blocked by robots.txt');
}
```

### Request Throttle (`src/tools/web-scraper/request-throttle.ts`)

Implements polite crawling patterns with domain-specific rate limiting.

**Key Features:**
- **Domain-Based Throttling**: Separate rate limits per domain
- **Queue Management**: Request queuing to prevent server overload
- **Configurable Delays**: Per-domain and global delay settings
- **Burst Protection**: Prevents rapid-fire requests to same domain
- **Memory Efficient**: Automatic cleanup of old throttle state

**Main Methods:**
- `waitForTurn(url, delay)` - Wait for permission to make request
- `setDomainDelay(domain, delay)` - Configure domain-specific delays
- `getDomainDelay(domain)` - Get current delay for domain
- `resetDomain(domain)` - Clear throttle state for domain

**Usage Example:**
```typescript
const throttle = new RequestThrottle();

// Wait before making request
await throttle.waitForTurn('https://example.com/page1', 1000);
// Make request...

await throttle.waitForTurn('https://example.com/page2', 1000); 
// Automatically throttled based on domain
```

## Content Parsing

### Generic Content Extraction

The scraper includes intelligent generic parsers that work across various website structures:

**Title Extraction:**
```typescript
// Tries multiple selectors in priority order
const titleSelectors = [
  'h1',                          // Primary heading
  'h2',                          // Secondary heading
  'title',                       // Document title
  '[property="og:title"]',       // Open Graph
  '[name="twitter:title"]',      // Twitter Cards
  '.title', '.headline'          // Common CSS classes
];
```

**Content Extraction:**
```typescript
// Removes navigation and extracts main content
const contentSelectors = [
  'article',                     // Semantic article element
  '.content', '.post-content',   // Common content classes
  '.entry-content',              // WordPress default
  '.article-content',            // News sites
  'main', '.main'                // Main content area
];
```

**Metadata Extraction:**
- **Author**: From bylines, author meta tags, rel="author"
- **Publish Date**: From time elements, meta tags, structured data
- **Tags**: From category links, tag elements, meta keywords
- **Summary**: From meta descriptions, excerpt elements

### Site-Specific Parsers

Support for custom parsers tailored to specific websites:

```typescript
interface SiteParser {
  name: string;
  isSupported: (url: string) => boolean;
  selectors: {
    title: string;
    content: string;
    author?: string;
    publishDate?: string;
    summary?: string;
    tags?: string;
  };
  contentProcessor?: (content: string) => string;
  dateParser?: (dateStr: string) => Date;
}

// Example custom parser
const techCrunchParser: SiteParser = {
  name: 'TechCrunch',
  isSupported: (url) => url.includes('techcrunch.com'),
  selectors: {
    title: '.article__title',
    content: '.article-content',
    author: '.article__byline a',
    publishDate: '.article__byline time',
    tags: '.tags a'
  },
  contentProcessor: (content) => content.replace(/\[.*?\]/g, ''),
  dateParser: (dateStr) => new Date(dateStr)
};
```

## Scraping Results

The scraper returns comprehensive results with metadata:

```typescript
interface ScrapingResult {
  success: boolean;
  content?: ScrapedContent;
  error?: {
    code: 'ROBOTS_BLOCKED' | 'NETWORK_ERROR' | 'PARSE_ERROR' | 'TIMEOUT';
    message: string;
    details?: any;
  };
  metrics: {
    requestTime: number;    // HTTP request duration
    parseTime: number;      // Content parsing duration  
    totalTime: number;      // Total operation time
    retryCount: number;     // Number of retries performed
  };
}

interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  summary?: string;
  author?: string;
  publishDate?: Date;
  tags: string[];
  metadata: {
    scrapedAt: Date;
    scraperVersion: string;
    contentLength: number;
    hasCodeExamples: boolean;
    hasImages: boolean;
    language?: string;
  };
}
```

## Error Handling

The scraper implements comprehensive error handling with categorized error types:

### Error Categories

1. **ROBOTS_BLOCKED**: Site robots.txt disallows scraping
2. **NETWORK_ERROR**: HTTP request failures, connectivity issues
3. **PARSE_ERROR**: Content extraction failures, malformed HTML
4. **TIMEOUT**: Request timeout exceeded

### Retry Logic

```typescript
// Exponential backoff retry strategy
const retryDelays = [
  1000,  // 1 second
  2000,  // 2 seconds  
  4000,  // 4 seconds
  8000   // 8 seconds (max)
];

// Retry conditions
const retryableErrors = [
  'ECONNRESET',     // Connection reset
  'ENOTFOUND',      // DNS resolution failure
  'TIMEOUT',        // Request timeout
  'ECONNREFUSED'    // Connection refused
];
```

### Error Recovery

```typescript
try {
  const result = await scraper.scrapeUrl(url);
  return result;
} catch (error) {
  // Log error with context
  logger.error('Scraping failed', {
    url,
    error: error.message,
    attempts: retryCount
  });
  
  // Return structured error
  return {
    success: false,
    error: {
      code: getErrorCode(error),
      message: error.message,
      details: { originalError: error }
    }
  };
}
```

## Ethical Scraping Practices

### Robots.txt Compliance

The scraper strictly follows robots.txt directives:

```typescript
// Example robots.txt parsing
User-agent: *
Disallow: /admin/
Disallow: /private/
Crawl-delay: 1

User-agent: AI-Content-Curator-Bot
Allow: /articles/
Disallow: /user-content/
Crawl-delay: 2
```

### Rate Limiting

Implements polite crawling with configurable delays:

```typescript
const ethicalDefaults = {
  requestDelay: 1000,        // 1 second between requests
  maxConcurrent: 1,          // No parallel requests to same domain
  respectCrawlDelay: true,   // Honor robots.txt crawl-delay
  userAgent: 'AI-Content-Curator-Bot/1.0.0 (+https://ai-curator.com/bot)'
};
```

### Content Usage

- **Attribution**: Preserve author and source information
- **Fair Use**: Extract only necessary content for curation
- **Cache Responsibly**: Avoid redundant requests for same content
- **Monitor Impact**: Track and limit resource usage

## Performance Optimization

### Caching Strategy

```typescript
// Multi-level caching
const cacheStrategy = {
  robotsTxt: '24h',          // Cache robots.txt for 24 hours
  content: '1h',             // Cache successful content for 1 hour
  errors: '5m',              // Cache error responses for 5 minutes
  domainDelay: 'session'     // Domain throttling for session
};
```

### Request Optimization

```typescript
// Optimized HTTP headers
const headers = {
  'User-Agent': config.userAgent,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};
```

### Memory Management

```typescript
// Automatic cleanup
setInterval(() => {
  throttle.cleanupOldEntries();
  robotsChecker.clearExpiredCache();
}, 60000); // Every minute
```

## Integration Examples

### Basic Content Scraping

```typescript
import { BaseScraper } from '@tools/web-scraper';

const scraper = container.resolve(BaseScraper);

async function scrapeArticle(url: string) {
  const result = await scraper.scrapeUrl(url);
  
  if (result.success) {
    // Store content in database
    await contentRepository.create({
      title: result.content.title,
      content: result.content.content,
      sourceUrl: url,
      author: result.content.author,
      publishDate: result.content.publishDate,
      tags: result.content.tags
    });
    
    return result.content;
  } else {
    throw new Error(`Scraping failed: ${result.error.message}`);
  }
}
```

### Batch Processing

```typescript
async function scrapeBatch(urls: string[]) {
  const results = [];
  
  for (const url of urls) {
    try {
      const result = await scraper.scrapeUrl(url);
      results.push({ url, success: true, data: result.content });
      
      // Respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      results.push({ url, success: false, error: error.message });
    }
  }
  
  return results;
}
```

### Custom Parser Integration

```typescript
// Register custom parser
const customParser: SiteParser = {
  name: 'AI Research Blog',
  isSupported: (url) => url.includes('ai-research-blog.com'),
  selectors: {
    title: 'h1.research-title',
    content: '.research-content',
    author: '.author-bio .name',
    publishDate: '.publication-date',
    tags: '.research-tags .tag'
  }
};

// Use with scraper
const result = await scraper.scrapeUrl(url, customParser);
```

## Monitoring and Analytics

### Scraping Metrics

```typescript
interface ScrapingMetrics {
  totalRequests: number;
  successfulScrapes: number;
  failedScrapes: number;
  averageResponseTime: number;
  robotsBlocked: number;
  timeouts: number;
  retries: number;
}
```

### Performance Monitoring

```typescript
// Track scraping performance
logger.info('Scraping completed', {
  url,
  success: result.success,
  duration: result.metrics.totalTime,
  retries: result.metrics.retryCount,
  contentLength: result.content?.content.length,
  hasImages: result.content?.metadata.hasImages
});
```

### Error Analysis

```typescript
// Categorize and track errors
const errorCategories = {
  'ROBOTS_BLOCKED': 'Ethical compliance',
  'NETWORK_ERROR': 'Infrastructure',
  'PARSE_ERROR': 'Content structure',
  'TIMEOUT': 'Performance'
};
```

## Testing

### Unit Tests

```typescript
describe('BaseScraper', () => {
  it('should respect robots.txt disallow', async () => {
    const result = await scraper.scrapeUrl('https://example.com/disallowed');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('ROBOTS_BLOCKED');
  });
  
  it('should extract content successfully', async () => {
    const result = await scraper.scrapeUrl('https://example.com/article');
    expect(result.success).toBe(true);
    expect(result.content?.title).toBeDefined();
    expect(result.content?.content).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe('Web Scraper Integration', () => {
  it('should handle rate limiting correctly', async () => {
    const urls = [
      'https://example.com/page1',
      'https://example.com/page2'
    ];
    
    const startTime = Date.now();
    for (const url of urls) {
      await scraper.scrapeUrl(url);
    }
    const duration = Date.now() - startTime;
    
    expect(duration).toBeGreaterThan(1000); // Rate limit enforced
  });
});
```

## Best Practices

### Configuration

```typescript
// Production configuration
const productionConfig = {
  userAgent: 'AI-Content-Curator-Bot/1.0.0 (+https://your-domain.com/bot)',
  requestDelay: 2000,           // 2 seconds between requests
  timeout: 30000,               // 30 second timeout
  maxRetries: 3,                // 3 retry attempts
  respectRobotsTxt: true,       // Always respect robots.txt
  enableJavaScript: false       // Disable JS for security/performance
};
```

### Error Handling

```typescript
// Comprehensive error handling
try {
  const result = await scraper.scrapeUrl(url);
  return result;
} catch (error) {
  // Log with context
  logger.error('Scraping error', {
    url,
    error: error.message,
    stack: error.stack,
    userAgent: scraper.getConfig().userAgent
  });
  
  // Return user-friendly error
  throw new ScrapingError('Content extraction failed', {
    url,
    originalError: error
  });
}
```

### Resource Management

```typescript
// Cleanup and resource management
class ScrapingManager {
  private scrapers = new Map<string, BaseScraper>();
  
  async scrapeWithCleanup(url: string) {
    const scraper = this.getOrCreateScraper(domain);
    try {
      return await scraper.scrapeUrl(url);
    } finally {
      // Cleanup if needed
      this.maybeCleanupScraper(domain);
    }
  }
}
```