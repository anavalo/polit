import { getConfig } from './config.js';
import { scrapeBookLinks } from './linkScraper.js';
import { scrapeBookDetails } from './detailsScraper.js';
import { BrowserService } from './services/browser.js';
import { StorageService } from './services/storage.js';
import { ConsoleLogger } from './logger.js';
import { LinkQueue } from './services/linkQueue.js';

/**
 * Main scraping process that collects links and scrapes details in parallel
 */
const main = async (): Promise<void> => {
  const config = getConfig();
  const logger = new ConsoleLogger();
  const linkQueue = new LinkQueue(logger);

  try {
    logger.info('Starting parallel scraping process...');

    // Create separate browser services for links and details
    const linkBrowserService = new BrowserService(config, logger);
    const detailsBrowserService = new BrowserService(config, logger);
    const storageService = new StorageService(logger);

    // Run both scrapers in parallel
    await Promise.all([
      scrapeBookLinks(linkBrowserService, storageService, logger, linkQueue),
      scrapeBookDetails(detailsBrowserService, storageService, logger, linkQueue)
    ]);
    
    logger.info('Parallel scraping process completed successfully');
  } catch (error) {
    logger.error('Scraping process failed', error as Error);
    process.exit(1);
  }
};

// Run the scraper if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
