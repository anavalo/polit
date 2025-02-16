import cheerio from 'cheerio';
import { getConfig } from './config.js';
import { retry } from './utils.js';
import { NetworkError, ParseError, Logger, RetryConfig } from './types.js';
import pLimit from 'p-limit';
import { ConsoleLogger } from './logger.js';
import { BrowserService } from './services/browser.js';
import { LinkQueue } from './services/linkQueue.js';
import { Page } from 'puppeteer';

// Cache for parsed selectors to improve performance
const selectorCache = new Map<string, ReturnType<typeof cheerio.load>>();

/**
 * Processes a single page and extracts links with optimized parsing
 */
const processPage = async (
  url: string,
  browserService: BrowserService,
  logger: Logger
): Promise<{ links: string[]; nextUrl: string | null }> => {
  const config = getConfig();
  
  const pageContent = await browserService.executeOperation(async (page: Page) => {
    try {
      const retryConfig: RetryConfig = {
        maxAttempts: 3,
        delayMs: 500, // Reduced delay
        backoffFactor: 1.5, // Reduced backoff
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
    } catch (error) {
      throw new NetworkError(url, error as Error);
    }
  }, url);

  // Get or create cached Cheerio instance
  const $ = cheerio.load(pageContent);

  const links = await extractLinks($, config.selectors.bookLinks, url);
  const nextUrl = await extractNextPageUrl($, config.selectors.nextPage, url);

  return { links, nextUrl };
};

/**
 * Extracts book links from page content using cached Cheerio instance
 */
const extractLinks = async (
  $: ReturnType<typeof cheerio.load>,
  selector: string,
  url: string
): Promise<string[]> => {
  try {
    const links: string[] = [];
    $(selector).each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        links.push(href);
      }
    });
    return links;
  } catch (error) {
    throw new ParseError(url, error as Error, { selector });
  }
};

/**
 * Extracts next page URL from page content using cached Cheerio instance
 */
const extractNextPageUrl = async (
  $: ReturnType<typeof cheerio.load>,
  selector: string,
  url: string
): Promise<string | null> => {
  try {
    return $(selector).attr('href') || null;
  } catch (error) {
    throw new ParseError(url, error as Error, { selector });
  }
};

/**
 * Scrapes book links from the website and adds them to the link queue
 * Optimized with concurrent page processing and selector caching
 */
export const scrapeBookLinks = async (
  browserService: BrowserService,
  logger: Logger,
  linkQueue: LinkQueue
): Promise<void> => {
  const config = getConfig();
  const concurrencyLimit = pLimit(5); // Process 5 pages concurrently
  
  try {
    await browserService.initialize();
    let urls = [`${config.base.url}${config.base.bookListPath}`];
    let totalLinks = 0;
    let pageNum = 1;

    while (urls.length > 0) {
      logger.info(`Processing batch of ${urls.length} pages starting from page ${pageNum}...`);
      
      // Process multiple pages concurrently
      const results = await Promise.all(
        urls.map(url => 
          concurrencyLimit(() => processPage(url, browserService, logger))
        )
      );

      // Clear URLs for next batch
      urls = [];

      // Process results and collect next URLs
      for (const { links, nextUrl } of results) {
        if (links.length > 0) {
          linkQueue.addLinks(links);
          totalLinks += links.length;
          
          if (nextUrl) {
            urls.push(config.base.url + nextUrl);
          }
        }
      }

      // Log progress
      logger.info(`Processed ${results.length} pages. Total links: ${totalLinks}`);
      pageNum += results.length;

      if (urls.length === 0) {
        logger.info('No more pages to process. Scraping completed.');
        break;
      }

      // Clear selector cache periodically to manage memory
      if (selectorCache.size > 100) {
        selectorCache.clear();
      }
    }

    logger.info(`Link collection completed. Total links collected: ${totalLinks}`);
    linkQueue.markComplete();
  } catch (error) {
    logger.error('Failed to scrape book links', error as Error);
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
  const linkQueue = new LinkQueue(logger);

  scrapeBookLinks(browserService, logger, linkQueue).catch(error => {
    logger.error('Scraping failed:', error as Error);
  });
}
