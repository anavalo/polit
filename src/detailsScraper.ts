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
/**
 * Extracts book details with optimized selector handling and parallel evaluation
 */
const extractBookDetails = async (
  page: Page,
  url: string,
  selectors: ScraperConfig['selectors']
): Promise<BookDetails | null> => {
  try {
    // Evaluate all selectors in parallel for better performance
    const [title, author, recommendationsData] = await Promise.all([
      page.$eval(selectors.bookTitle, el => el.textContent?.trim() || ''),
      page.$eval(selectors.bookAuthor, el => el.textContent?.trim() || ''),
      page.$eval(selectors.recommendations, el => ({
        header: el.querySelector('h4')?.textContent?.trim() || '',
        count: el.children.length - 1
      }))
    ]);

    // Quick validation before full processing
    if (!title || !author) {
      throw new ParseError(url, undefined, { title, author });
    }

    const recommendationsCount = recommendationsData.header.startsWith('To βιβλίο') 
      ? recommendationsData.count 
      : 0;

    // Skip processing if recommendations are zero
    if (recommendationsCount === 0) {
      return null;
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
/**
 * Processes a single link with optimized waiting and error handling
 */
const processLink = async (
  url: string,
  browserService: BrowserService,
  config: ScraperConfig
): Promise<BookDetails | null> => {
  const retryConfig: RetryConfig = {
    maxAttempts: 3,
    delayMs: 500, // Further reduced delay
    backoffFactor: 1.5, // Reduced backoff
    timeout: config.scraping.timeout
  };

  return await retry(
    async () => {
      return await browserService.executeOperation(async (page: Page) => {
        // Wait for all critical elements in parallel with reduced timeout
        await Promise.all([
          page.waitForSelector(config.selectors.bookTitle, { timeout: 3000 }),
          page.waitForSelector(config.selectors.bookAuthor, { timeout: 3000 }),
          page.waitForSelector(config.selectors.recommendations, { timeout: 3000 })
        ]).catch(() => {
          // If selectors don't appear, page might still be usable
          // Let extractBookDetails handle any missing elements
        });
        
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
/**
 * Processes a batch of links with adaptive concurrency and optimized error handling
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
  
  // Dynamic batch sizing based on system performance
  const stats = linkQueue.getStats();
  const baseSize = config.scraping.maxConcurrent;
  const successRate = stats.processed > 0 ? (stats.processed - stats.failed) / stats.processed : 1;
  
  // Adjust batch size based on success rate and processing time
  const effectiveBatchSize = Math.max(
    1,
    Math.floor(baseSize * (
      successRate > 0.9 ? 1.2 : // Increase if very successful
      successRate > 0.7 ? 1 : // Keep same if moderately successful
      0.8 // Reduce if struggling
    ))
  );
  
  const limit = pLimit(effectiveBatchSize);
  
  try {
    // Process links with minimal delays
    const operations = links.map((url) => limit(async () => {
      try {
        const details = await processLink(url, browserService, config);
        return details ? { success: true, details } : { success: true, skipped: true };
      } catch (error) {
        logger.error(`Failed to process ${url}`, error as Error);
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
