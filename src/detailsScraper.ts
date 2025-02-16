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
  content: string,
  url: string,
  selectors: ScraperConfig['selectors']
): Promise<BookDetails> => {
  try {
    const $ = cheerio.load(content);
    const title = $(selectors.bookTitle).text().trim();
    const author = $(selectors.bookAuthor).text().trim();
    
    let recommendationsCount = 0;
    const recommendations = $(selectors.recommendations).first();
    if ($('h4', recommendations).text().trim().startsWith('To βιβλίο')) {
      recommendationsCount = recommendations.children().length - 1;
    }

    if (!title || !author) {
      throw new ParseError(url, undefined, { title, author });
    }

    return {
      title,
      author,
      recommendationsCount,
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
): Promise<BookDetails> => {
  const pageContent = await browserService.executeOperation(async (page: Page) => {
    const retryConfig: RetryConfig = {
      maxAttempts: 3,
      delayMs: 1000,
      backoffFactor: 2,
      timeout: config.scraping.timeout
    };

    return await retry(
      async () => {
        await page.goto(url);
        return await page.content();
      },
      retryConfig,
      url
    );
  }, url);

  return await extractBookDetails(pageContent, url, config.selectors);
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
  
  // Create a concurrency limiter
  const limit = pLimit(config.scraping.maxConcurrent);
  
  try {
    // Process links concurrently with error handling for each
    const operations = links.map(url => limit(async () => {
      try {
        const details = await processLink(url, browserService, config);
        return { success: true, details };
      } catch (error) {
        logger.error(`Failed to process ${url}`, error as Error);
        return { success: false, url };
      }
    }));

    const results = await Promise.all(operations);
    
    // Separate successful and failed results
    const successfulResults = results
      .filter((r): r is { success: true; details: BookDetails } => r.success)
      .map(r => r.details);
    
    const failedUrls = results
      .filter((r): r is { success: false; url: string } => !r.success)
      .map(r => r.url);

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
        // Exponential backoff when waiting for new links
        await new Promise(resolve => setTimeout(resolve, Math.min(1000, linkQueue.getStats().avgProcessingTime / 2)));
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
