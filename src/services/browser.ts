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
  private pagePool: Page[] = [];
  private readonly PAGE_POOL_SIZE = 20; // Increased pool size for better concurrency

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
   * Initializes the browser instance with optimized settings
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      // Pre-warm the browser with initial pages
      this.browser = await puppeteer.launch({
        headless: this.config.scraping.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-features=TranslateUI,BlinkGenPropertyTrees',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--force-color-profile=srgb',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-first-run',
          '--no-pings',
          '--no-zygote',
        ]
      });

      // Pre-warm the page pool
      await Promise.all(
        Array(this.PAGE_POOL_SIZE).fill(null).map(async () => {
          const page = await this.getPage();
          this.pagePool.push(page);
        })
      );

      this.logger.info('Browser initialized with optimized settings and pre-warmed pool', {
        headless: this.config.scraping.headless,
        poolSize: this.PAGE_POOL_SIZE
      });
    }
  }

  /**
   * Gets or creates a page with optimized settings
   */
  private async getPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    // Try to get a page from the pool
    let page = this.pagePool.pop();
    
    if (!page || page.isClosed()) {
      page = await this.browser.newPage();
      
      // Optimize page settings
      await Promise.all([
        page.setDefaultNavigationTimeout(this.config.scraping.timeout),
        page.setRequestInterception(true),
        page.setJavaScriptEnabled(true),
        page.setCacheEnabled(true),
        // Optimize memory usage
        page.setViewport({ width: 800, height: 600 }),
        // Reduce memory usage by limiting cache
        page.setCacheEnabled(true),
        // Disable features we don't need
        page.evaluateOnNewDocument(() => {
          // Disable analytics, tracking, and unnecessary features
          (window as any).ga = undefined;
          (window as any).analytics = undefined;
          (window as any)._gaq = undefined;
          (window as any).dataLayer = undefined;
        })
      ]);

      // Block unnecessary resources
      page.on('request', request => {
        const resourceType = request.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Log console messages
      page.on('console', msg => {
        this.logger.debug('Browser console:', {
          type: msg.type(),
          text: msg.text()
        });
      });
    }

    return page;
  }

  /**
   * Returns a page to the pool or closes it if pool is full
   */
  private async releasePage(page: Page): Promise<void> {
    if (!page.isClosed()) {
      if (this.pagePool.length < this.PAGE_POOL_SIZE) {
        try {
          // Simplified cleanup - just clear navigation
          await page.evaluate(() => window.stop());
          this.pagePool.push(page);
        } catch (error) {
          await page.close();
        }
      } else {
        await page.close();
      }
    }
  }

  /**
   * Navigates to a URL with rate limiting and retries
   */
  private async navigateToUrl(page: Page, url: string): Promise<void> {
    const maxRetries = this.config.scraping.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wait for rate limit token
        await this.limiter.removeTokens(1);
        
        // Check if page is still valid
        if (page.isClosed()) {
          throw new Error('Page was closed before navigation');
        }
        
        await page.goto(url, {
          waitUntil: 'domcontentloaded', // Less strict than networkidle0
          timeout: this.config.scraping.timeout
        });
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          this.logger.warn(`Attempt ${attempt} failed: ${url}. Retrying in ${delay}ms...`, { error });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Executes a page operation with concurrency control and proper cleanup
   */
  async executeOperation<T>(
    operation: (page: Page) => Promise<T>,
    url?: string
  ): Promise<T> {
    return this.concurrencyLimit(async () => {
      let page: Page | null = null;
      
      try {
        page = await this.getPage();
        
        if (url) {
          await this.navigateToUrl(page, url);
        }
        
        const result = await operation(page);
        return result;
      } catch (error) {
        throw error;
      } finally {
        if (page) {
          try {
            await this.releasePage(page);
          } catch (closeError) {
            this.logger.warn('Failed to release page', { error: closeError });
          }
        }
      }
    });
  }

  /**
   * Closes the browser instance and ensures cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        // Close all pooled pages
        await Promise.all(this.pagePool.map(page => 
          page.isClosed() ? Promise.resolve() : page.close()
        ));
        this.pagePool = [];

        // Close any other pages and the browser
        if (this.browser.isConnected()) {
          const pages = await this.browser.pages();
          await Promise.all(pages.map(page => 
            page.isClosed() ? Promise.resolve() : page.close()
          ));
          await this.browser.close();
        }
      } catch (error) {
        this.logger.warn('Error during browser cleanup', { error });
      } finally {
        this.browser = null;
        this.logger.info('Browser closed');
      }
    }
  }
}
