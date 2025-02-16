import { getConfig } from './config.js';
import { scrapeBookLinks } from './linkScraper.js';
import { scrapeBookDetails } from './detailsScraper.js';
import { BrowserService } from './services/browser.js';
import { StorageService } from './services/storage.js';
import { ConsoleLogger } from './logger.js';
import { LinkQueue } from './services/linkQueue.js';

/**
 * Handles graceful shutdown of services
 */
const cleanup = async (
  linkBrowser: BrowserService,
  detailsBrowser: BrowserService,
  storage: StorageService,
  logger: ConsoleLogger
): Promise<void> => {
  logger.info('Shutting down services...');
  
  try {
    await Promise.all([
      linkBrowser.close(),
      detailsBrowser.close(),
      storage.close()
    ]);
    logger.info('Services shut down successfully');
  } catch (error) {
    logger.error('Error during cleanup', error as Error);
    throw error;
  }
};

/**
 * Main scraping process that collects links and scrapes details in parallel
 */
const main = async (): Promise<void> => {
  let linkBrowserService: BrowserService | null = null;
  let detailsBrowserService: BrowserService | null = null;
  let storageService: StorageService | null = null;
  const config = getConfig();
  const logger = new ConsoleLogger();
  const linkQueue = new LinkQueue(logger);

  try {
    logger.info('Starting parallel scraping process...');

    // Create separate browser services for links and details
    linkBrowserService = new BrowserService(config, logger);
    detailsBrowserService = new BrowserService(config, logger);
    storageService = new StorageService(logger);

    // Setup graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      if (linkBrowserService && detailsBrowserService && storageService) {
        await cleanup(linkBrowserService, detailsBrowserService, storageService, logger);
      }
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal');
      if (linkBrowserService && detailsBrowserService && storageService) {
        await cleanup(linkBrowserService, detailsBrowserService, storageService, logger);
      }
      process.exit(0);
    });

    // Run both scrapers in parallel
    await Promise.all([
      scrapeBookLinks(linkBrowserService, logger, linkQueue),
      scrapeBookDetails(detailsBrowserService, storageService, logger, linkQueue)
    ]);
    
    logger.info('Parallel scraping process completed successfully');
  } catch (error) {
    logger.error('Scraping process failed', error as Error);
    throw error;
  } finally {
    // Ensure cleanup happens even if there's an error
    if (linkBrowserService && detailsBrowserService && storageService) {
      await cleanup(linkBrowserService, detailsBrowserService, storageService, logger);
    }
  }
};

// Run the scraper if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
