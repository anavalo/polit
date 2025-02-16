import cheerio from 'cheerio';
import { getConfig } from './config.js';
import { retry } from './utils.js';
import { BookDetails, NetworkError, ParseError, RetryConfig, ScrapingErrorRecord, Logger, ScraperConfig } from './types.js';
import { LinkQueue } from './services/linkQueue.js';
import { ConsoleLogger } from './logger.js';
import { BrowserService } from './services/browser.js';
import { StorageService } from './services/storage.js';
import { Page } from 'puppeteer';

/**
 * Extracts book details from a page
 */
const extractBookDetails = async (
  page: Page,
  url: string,
  selectors: ScraperConfig['selectors']
): Promise<BookDetails | null> => {
  try {
    // Use page.evaluate to extract data directly in the browser context
    const details = await page.evaluate((selectors) => {
      const title = document.querySelector(selectors.bookTitle)?.textContent?.trim() || '';
      const author = document.querySelector(selectors.bookAuthor)?.textContent?.trim() || '';
      
      let recommendationsCount = 0;
      const recommendations = document.querySelector(selectors.recommendations);
      const header = recommendations?.querySelector('h4')?.textContent?.trim() || '';
      
      if (header.startsWith('To βιβλίο')) {
        recommendationsCount = recommendations?.children.length - 1 || 0;
      }

      return { title, author, recommendationsCount };
    }, selectors);

    // Skip processing if recommendations are zero
    if (details.recommendationsCount === 0) {
      return null;
    }

    if (!details.title || !details.author) {
      throw new ParseError(url, undefined, details);
    }

    return {
      ...details,
      url,
      scrapedAt: new Date()
    };
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw new ParseError(url, error as Error);
  }
};

import pLimit from 'p-limit';

/**
 * Processes a single link with error handling and retries
 */
const processLink = async (
  url: string,
  browserService: BrowserService,
  config: ScraperConfig
): Promise<BookDetails | null> => {
  const retryConfig: RetryConfig = {
    maxAttempts: 3,
    delayMs: 1000, // Reduced from 2000ms
    backoffFactor: 2, // Reduced from 3
    timeout: config.scraping.timeout
  };

  return await retry(
    async () => {
      return await browserService.executeOperation(async (page: Page) => {
        // Wait for critical elements instead of fixed delay
        await Promise.race([
          page.waitForSelector(config.selectors.bookTitle),
          page.waitForSelector(config.selectors.bookAuthor),
          page.waitForSelector(config.selectors.recommendations),
          new Promise(resolve => setTimeout(resolve, 5000)) // 5s max wait
        ]);
        
        return await extractBookDetails(page, url, config.selectors);
      }, url);
    },
    retryConfig,
    url
  );
};

/**
 * Processes links concurrently with adaptive batching and error recovery
 */
const processBatch = async (
  links: string[],
  browserService: BrowserService,
  storageService: StorageService,
  logger: Logger,
  linkQueue: LinkQueue
): Promise<void> => {
  const config = getConfig();
  const startTime = Date.now();
  
  // Reduce batch size if there were recent failures
  const stats = linkQueue.getStats();
  const effectiveBatchSize = stats.failed > 0 
    ? Math.max(1, Math.floor(config.scraping.maxConcurrent / 2))
    : config.scraping.maxConcurrent;
  
  // Create a concurrency limiter with reduced limit if there were failures
  const limit = pLimit(effectiveBatchSize);
  
  try {
    // Process links with adaptive delays
    const operations = links.map((url) => limit(async () => {
      try {
        // Calculate dynamic delay based on active operations and recent performance
        const activeOps = limit.activeCount;
        const queueStats = linkQueue.getStats();
        const avgTime = queueStats.avgProcessingTime;
        
        // Add small delay if system is under load
        if (activeOps > effectiveBatchSize / 2) {
          const dynamicDelay = Math.min(
            avgTime * 0.1, // 10% of avg processing time
            500 // max 500ms
          );
          await new Promise(resolve => setTimeout(resolve, dynamicDelay));
        }
        
        const details = await processLink(url, browserService, config);
        // Skip if null (zero recommendations)
        if (!details) {
          return { success: true, skipped: true };
        }
        return { success: true, details };
      } catch (error) {
        logger.error(`Failed to process ${url}`, error as Error);
        // Brief delay on failure to allow system recovery
        await new Promise(resolve => setTimeout(resolve, 500));
        return { success: false, url };
      }
    }));

    // Process all operations in parallel with rate limiting
    const results = await Promise.all(operations);
    
    // Separate successful and failed results
    const successfulResults = results
      .filter((r): r is { success: true; details: BookDetails } => r.success && !('skipped' in r))
      .map(r => r.details);
    
    const failedUrls = results
      .filter((r): r is { success: false; url: string } => !r.success)
      .map(r => r.url);

    const skippedCount = results.filter(r => r.success && 'skipped' in r).length;

    // Save successful results
    if (successfulResults.length > 0) {
      await storageService.saveBookDetailsBatch(config.files.output, successfulResults);
    }

    // Update queue statistics
    const processingTime = Date.now() - startTime;
    linkQueue.markProcessed(
      links,
      failedUrls.length === 0,
      processingTime
    );

    // Log batch results
    const stats = linkQueue.getStats();
    logger.info('Batch processing completed', {
      successful: successfulResults.length,
      failed: failedUrls.length,
      skipped: skippedCount,
      queueSize: stats.queueSize,
      avgProcessingTime: Math.round(stats.avgProcessingTime),
      totalProcessed: stats.processed
    });
  } catch (error) {
    // Mark entire batch as failed if we hit an unexpected error
    linkQueue.markProcessed(links, false, Date.now() - startTime);
    throw error;
  }
};

/**
 * Scrapes details for all books from the collected links with improved concurrency
 */
export const scrapeBookDetails = async (
  browserService: BrowserService,
  storageService: StorageService,
  logger: Logger,
  linkQueue: LinkQueue
): Promise<void> => {
  const config = getConfig();
  const startTime = new Date();
  
  try {
    await browserService.initialize();

    // Process links with adaptive batching
    while (linkQueue.hasMore()) {
      const batch = linkQueue.getBatch(config.scraping.maxConcurrent);
      
      if (batch.length > 0) {
        await processBatch(batch, browserService, storageService, logger, linkQueue);
      } else if (!linkQueue.hasMore()) {
        break;
      } else {
        // Dynamic delay when waiting for new links based on current performance
        const stats = linkQueue.getStats();
        const waitTime = Math.min(
          stats.avgProcessingTime * 0.2, // 20% of avg processing time
          1000 // max 1 second
        );
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const duration = (new Date().getTime() - startTime.getTime()) / 1000;
    const stats = linkQueue.getStats();
    logger.info('Details scraping completed', {
      processed: stats.processed,
      failed: stats.failed,
      duration: `${duration}s`,
      avgProcessingTime: `${Math.round(stats.avgProcessingTime)}ms`
    });
  } catch (error) {
    logger.error('Failed to scrape book details', error as Error);
    throw error;
  } finally {
    await browserService.close();
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = getConfig();
  const logger = new ConsoleLogger();
  const browserService = new BrowserService(config, logger);
  const storageService = new StorageService(logger);
  const linkQueue = new LinkQueue(logger);

  scrapeBookDetails(browserService, storageService, logger, linkQueue).catch(error => {
    logger.error('Scraping failed:', error as Error);
    process.exit(1);
  });
}
