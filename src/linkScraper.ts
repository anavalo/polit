import cheerio from 'cheerio';
import { getConfig } from './config.js';
import { retry } from './utils.js';
import { NetworkError, ParseError, Logger, RetryConfig, ScrapingErrorRecord } from './types.js';
import { ConsoleLogger } from './logger.js';
import { BrowserService } from './services/browser.js';
import { LinkQueue } from './services/linkQueue.js';
import { Page } from 'puppeteer';

/**
 * Scrapes book links from the website and adds them to the link queue
 * @param browserService - Service for browser operations
 * @param logger - Logger for operation tracking
 * @param linkQueue - Queue for managing scraped links
 */
export const scrapeBookLinks = async (
  browserService: BrowserService,
  logger: Logger,
  linkQueue: LinkQueue
): Promise<void> => {
  const config = getConfig();
  
  try {
    await browserService.initialize();
    let url = `${config.base.url}${config.base.bookListPath}`;
    let pageNum = 1;
    let totalLinks = 0;

    while (true) {
      logger.info(`Processing page ${pageNum}...`);
      
      const pageContent = await browserService.executeOperation(async (page: Page) => {
        try {
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
        } catch (error) {
          throw new NetworkError(url, error as Error);
        }
      }, url);

      // Parse links from page
      const links = await extractLinks(pageContent, config.selectors.bookLinks, url);
      
      if (links.length === 0) {
        logger.info('No more links found. Scraping completed.');
        break;
      }

      // Add links to queue
      linkQueue.addLinks(links);

      totalLinks += links.length;
      logger.info(`Found ${links.length} links on page ${pageNum}. Total: ${totalLinks}`);

      // Get next page URL
      const nextUrl = await extractNextPageUrl(pageContent, config.selectors.nextPage, url);
      if (!nextUrl) {
        logger.info('No next page link found. Scraping completed.');
        break;
      }

      url = config.base.url + nextUrl;
      pageNum++;
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

/**
 * Extracts book links from page content
 */
const extractLinks = async (
  content: string,
  selector: string,
  url: string
): Promise<string[]> => {
  try {
    const $ = cheerio.load(content);
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
 * Extracts next page URL from page content
 */
const extractNextPageUrl = async (
  content: string,
  selector: string,
  url: string
): Promise<string | null> => {
  try {
    const $ = cheerio.load(content);
    return $(selector).attr('href') || null;
  } catch (error) {
    throw new ParseError(url, error as Error, { selector });
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
