import puppeteer from 'puppeteer';
import cheerio from 'cheerio';
import { promises as fs } from 'fs';
import { config } from './config';
import { retry, delay, randomInteger, createProgressLogger, ensureDirectoryExists } from './utils';
import { ScrapingError } from './types';

const log = createProgressLogger();

/**
 * Scrapes book links from the website and saves them to a file
 */
export async function scrapeBookLinks(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: config.scraping.headless
  });

  try {
    await ensureDirectoryExists(config.files.links);
    const page = await browser.newPage();
    let url = `${config.base.url}${config.base.bookListPath}`;
    let pageNum = 1;
    let totalLinks = 0;

    while (true) {
      log(`Processing page ${pageNum}...`);
      
      await retry(
        async () => {
          await page.goto(url);
          await delay(config.scraping.timeout);
        },
        {
          maxAttempts: 3,
          delayMs: 1000,
          backoffFactor: 2
        },
        url
      );

      const content = await page.content();
      const $ = cheerio.load(content);
      const links: string[] = [];

      $(config.selectors.bookLinks).each((_, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          links.push(href);
        }
      });

      if (links.length === 0) {
        log('No more links found. Scraping completed.');
        break;
      }

      // Append links to file
      await fs.appendFile(
        config.files.links,
        links.join('\n') + '\n'
      );

      totalLinks += links.length;
      log(`Found ${links.length} links on page ${pageNum}. Total: ${totalLinks}`);

      // Get next page URL
      const nextURL = $(config.selectors.nextPage).attr('href');
      if (!nextURL) {
        log('No next page link found. Scraping completed.');
        break;
      }

      url = config.base.url + nextURL;
      pageNum++;

      // Random delay between requests
      await delay(randomInteger(config.scraping.minDelay, config.scraping.maxDelay));
    }

    log(`Scraping completed. Total links collected: ${totalLinks}`);
  } catch (error) {
    if (error instanceof ScrapingError) {
      throw error;
    }
    throw new ScrapingError(
      'Failed to scrape book links',
      'link scraping',
      error instanceof Error ? error : new Error(String(error))
    );
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  scrapeBookLinks().catch(error => {
    console.error('Scraping failed:', error);
    process.exit(1);
  });
}
