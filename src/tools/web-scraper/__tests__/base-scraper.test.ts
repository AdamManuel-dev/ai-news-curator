import { BaseScraper } from '../base-scraper';
import { RobotsChecker } from '../robots-checker';
import { RequestThrottle } from '../request-throttle';
import { Logger } from 'winston';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BaseScraper', () => {
  let baseScraper: BaseScraper;
  let mockLogger: jest.Mocked<Logger>;
  let mockRobotsChecker: jest.Mocked<RobotsChecker>;
  let mockRequestThrottle: jest.Mocked<RequestThrottle>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as any;

    mockRobotsChecker = {
      checkRobotsTxt: jest.fn(),
    } as any;

    mockRequestThrottle = {
      waitForTurn: jest.fn(),
    } as any;

    baseScraper = new BaseScraper(
      mockLogger,
      mockRobotsChecker,
      mockRequestThrottle
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scrapeUrl', () => {
    const mockUrl = 'https://example.com/article';
    const mockHtml = `
      <html>
        <head>
          <title>Test Article</title>
          <meta name="description" content="This is a test article">
        </head>
        <body>
          <h1>Test Article Title</h1>
          <div class="content">
            <p>This is the main content of the article.</p>
            <p>It has multiple paragraphs.</p>
          </div>
          <div class="author">John Doe</div>
          <time datetime="2023-01-01T12:00:00Z">January 1, 2023</time>
        </body>
      </html>
    `;

    beforeEach(() => {
      mockRobotsChecker.checkRobotsTxt.mockResolvedValue({
        isAllowed: true,
        userAgent: '*'
      });
      mockRequestThrottle.waitForTurn.mockResolvedValue();
      mockedAxios.get.mockResolvedValue({
        data: mockHtml,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
    });

    it('should successfully scrape a webpage', async () => {
      const result = await baseScraper.scrapeUrl(mockUrl);

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content!.title).toBe('Test Article Title');
      expect(result.content!.content).toContain('This is the main content');
      expect(result.content!.author).toBe('John Doe');
      expect(result.content!.publishDate).toEqual(new Date('2023-01-01T12:00:00Z'));
      expect(result.content!.url).toBe(mockUrl);
      expect(result.metrics.retryCount).toBe(0);
    });

    it('should respect robots.txt when disallowed', async () => {
      mockRobotsChecker.checkRobotsTxt.mockResolvedValue({
        isAllowed: false,
        userAgent: '*'
      });

      const result = await baseScraper.scrapeUrl(mockUrl);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ROBOTS_BLOCKED');
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should use custom crawl delay from robots.txt', async () => {
      mockRobotsChecker.checkRobotsTxt.mockResolvedValue({
        isAllowed: true,
        crawlDelay: 5,
        userAgent: '*'
      });

      await baseScraper.scrapeUrl(mockUrl);

      expect(mockRequestThrottle.waitForTurn).toHaveBeenCalledWith(mockUrl, 5000);
    });

    it('should retry on network errors', async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: mockHtml,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      const result = await baseScraper.scrapeUrl(mockUrl);

      expect(result.success).toBe(true);
      expect(result.metrics.retryCount).toBe(1);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Persistent network error'));

      const result = await baseScraper.scrapeUrl(mockUrl);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.metrics.retryCount).toBe(3); // maxRetries + 1
      expect(mockedAxios.get).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      mockedAxios.get.mockRejectedValue(timeoutError);

      const result = await baseScraper.scrapeUrl(mockUrl);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
    });

    it('should extract metadata correctly', async () => {
      const htmlWithCode = `
        <html>
          <body>
            <h1>Code Tutorial</h1>
            <p>This tutorial shows code examples.</p>
            <pre><code>console.log('Hello World');</code></pre>
            <img src="example.jpg" alt="Example">
          </body>
        </html>
      `;

      mockedAxios.get.mockResolvedValue({
        data: htmlWithCode,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const result = await baseScraper.scrapeUrl(mockUrl);

      expect(result.success).toBe(true);
      expect(result.content!.metadata.hasCodeExamples).toBe(true);
      expect(result.content!.metadata.hasImages).toBe(true);
      expect(result.content!.metadata.contentLength).toBeGreaterThan(0);
      expect(result.content!.metadata.scrapedAt).toBeInstanceOf(Date);
    });

    it('should use custom site parser when provided', async () => {
      const customParser = {
        domain: 'example.com',
        name: 'Example Parser',
        selectors: {
          title: '.custom-title',
          content: '.custom-content',
          author: '.custom-author'
        },
        isSupported: (url: string) => url.includes('example.com'),
        contentProcessor: (content: string) => content.toUpperCase()
      };

      const customHtml = `
        <html>
          <body>
            <div class="custom-title">Custom Title</div>
            <div class="custom-content">custom content</div>
            <div class="custom-author">Jane Doe</div>
          </body>
        </html>
      `;

      mockedAxios.get.mockResolvedValue({
        data: customHtml,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const result = await baseScraper.scrapeUrl(mockUrl, customParser);

      expect(result.success).toBe(true);
      expect(result.content!.title).toBe('Custom Title');
      expect(result.content!.content).toBe('CUSTOM CONTENT'); // Content processor applied
      expect(result.content!.author).toBe('Jane Doe');
    });

    it('should handle missing required content gracefully', async () => {
      const emptyHtml = '<html><body></body></html>';

      mockedAxios.get.mockResolvedValue({
        data: emptyHtml,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const result = await baseScraper.scrapeUrl(mockUrl);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PARSE_ERROR');
      expect(result.error?.message).toContain('Failed to extract required content');
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        requestDelay: 2000,
        maxRetries: 5
      };

      baseScraper.updateConfig(newConfig);
      const config = baseScraper.getConfig();

      expect(config.requestDelay).toBe(2000);
      expect(config.maxRetries).toBe(5);
      expect(mockLogger.info).toHaveBeenCalledWith('Scraper configuration updated', { config });
    });

    it('should return current configuration', () => {
      const config = baseScraper.getConfig();

      expect(config).toEqual(expect.objectContaining({
        userAgent: expect.stringContaining('AI-Content-Curator-Bot'),
        requestDelay: expect.any(Number),
        timeout: expect.any(Number),
        maxRetries: expect.any(Number),
        respectRobotsTxt: expect.any(Boolean),
        enableJavaScript: expect.any(Boolean)
      }));
    });
  });
});