import puppeteer, { Browser, Page } from 'puppeteer';
import { ScraperConfig, Logger } from '../types.js';
import pLimit from 'p-limit';
import { RateLimiter } from 'limiter';

/**
 * Service for managing browser operations with rate limiting and concurrency control
 */
export class BrowserService {
  private browser: Browser | null = null;
  private limiter: RateLimiter;
  private concurrencyLimit: (fn: () => Promise<any>) => Promise<any>;

  constructor(
    private config: ScraperConfig,
    private logger: Logger
  ) {
    // Initialize rate limiter (requests per minute)
    this.limiter = new RateLimiter({
      tokensPerInterval: config.scraping.rateLimitPerMinute,
      interval: 'minute'
    });

    // Initialize concurrency limiter
    this.concurrencyLimit = pLimit(config.scraping.maxConcurrent);
  }

  /**
   * Initializes the browser instance
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: this.config.scraping.headless
      });
      this.logger.info('Browser initialized', {
        headless: this.config.scraping.headless
      });
    }
  }

  /**
   * Creates a new page with default configuration
   */
  private async createPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();
    await page.setDefaultNavigationTimeout(this.config.scraping.timeout);
    
    // Log console messages
    page.on('console', msg => {
      this.logger.debug('Browser console:', {
        type: msg.type(),
        text: msg.text()
      });
    });

    return page;
  }

  /**
   * Navigates to a URL with rate limiting
   */
  private async navigateToUrl(page: Page, url: string): Promise<void> {
    // Wait for rate limit token
    await this.limiter.removeTokens(1);
    await page.goto(url);
  }

  /**
   * Executes a page operation with concurrency control
   */
  async executeOperation<T>(
    operation: (page: Page) => Promise<T>,
    url?: string
  ): Promise<T> {
    return this.concurrencyLimit(async () => {
      const page = await this.createPage();
      
      try {
        if (url) {
          await this.navigateToUrl(page, url);
        }
        return await operation(page);
      } finally {
        await page.close();
      }
    });
  }

  /**
   * Closes the browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.info('Browser closed');
    }
  }
}
