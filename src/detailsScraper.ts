import cheerio from 'cheerio';
import { getConfig } from './config.js';
import { retry } from './utils.js';
import { BookDetails, NetworkError, ParseError, RetryConfig, ScrapingErrorRecord, Logger, ScraperConfig } from './types.js';
import { LinkQueue } from './services/linkQueue.js';
import { FileLogger } from './logger.js';
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

/**
 * Processes a batch of links concurrently
 */
const processBatch = async (
  links: string[],
  browserService: BrowserService,
  storageService: StorageService,
  logger: Logger
): Promise<void> => {
  const config = getConfig();
  const operations = links.map(url => async (): Promise<BookDetails | null> => {
    try {
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

      const details = await extractBookDetails(pageContent, url, config.selectors);
      return details;
    } catch (error) {
      const errorRecord: ScrapingErrorRecord = {
        url,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        attemptCount: 1
      };
      await storageService.logError(config.files.errorLog, errorRecord);
      logger.error(`Failed to process ${url}`, error as Error);
      return null;
    }
  });

  const results = await Promise.all(operations.map(op => op()));
  const validResults = results.filter((result): result is BookDetails => result !== null);
  
  if (validResults.length > 0) {
    await storageService.saveBookDetailsBatch(config.files.output, validResults);
  }
};

/**
 * Scrapes details for all books from the collected links
 */
export const scrapeBookDetails = async (
  browserService: BrowserService,
  storageService: StorageService,
  logger: Logger,
  linkQueue: LinkQueue
): Promise<void> => {
  const config = getConfig();
  const batchSize = config.scraping.maxConcurrent;
  
  try {
    await browserService.initialize();
    let processedLinks = 0;
    const startTime = new Date();

    // Process links as they become available
    while (linkQueue.hasMore()) {
      const batch = linkQueue.getBatch(batchSize);
      
      if (batch.length > 0) {
        logger.info(`Processing batch of ${batch.length} links...`);
        await processBatch(batch, browserService, storageService, logger);
        processedLinks += batch.length;
        
        logger.info(`Processed ${processedLinks} links so far`);
      } else {
        // Wait for more links if queue is empty but collection isn't complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const duration = (new Date().getTime() - startTime.getTime()) / 1000;
    logger.info(`Details scraping completed successfully`, {
      totalProcessed: processedLinks,
      duration: `${duration}s`
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
  const logger = new FileLogger(config.files.errorLog);
  const browserService = new BrowserService(config, logger);
  const storageService = new StorageService(logger);
  const linkQueue = new LinkQueue(logger);

  scrapeBookDetails(browserService, storageService, logger, linkQueue).catch(error => {
    logger.error('Scraping failed:', error as Error);
    process.exit(1);
  });
}
