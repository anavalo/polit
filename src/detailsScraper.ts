import puppeteer from 'puppeteer';
import cheerio from 'cheerio';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import { createInterface } from 'readline';
import { config } from './config';
import { retry, delay, randomInteger, createProgressLogger, ensureDirectoryExists } from './utils';
import { BookDetails, ScrapingError, ScrapingProgress } from './types';

const log = createProgressLogger();

/**
 * Extracts book details from a page
 */
async function extractBookDetails(
  $: cheerio.Root,
  url: string
): Promise<BookDetails> {
  const title = $(config.selectors.bookTitle).text().trim();
  const author = $(config.selectors.bookAuthor).text().trim();
  
  let recommendationsCount = 0;
  const recommendations = $(config.selectors.recommendations).first();
  if ($('h4', recommendations).text().trim().startsWith('To βιβλίο')) {
    recommendationsCount = recommendations.children().length - 1;
  }

  if (!title || !author) {
    throw new Error('Failed to extract required book details');
  }

  return {
    title,
    author,
    recommendationsCount,
    url
  };
}

/**
 * Loads the progress state from a file if it exists
 */
async function loadProgress(): Promise<ScrapingProgress> {
  try {
    const data = await fs.readFile('scraping-progress.json', 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      processedLinks: 0,
      totalLinks: 0,
      failedLinks: []
    };
  }
}

/**
 * Saves the current progress state to a file
 */
async function saveProgress(progress: ScrapingProgress): Promise<void> {
  await fs.writeFile(
    'scraping-progress.json',
    JSON.stringify(progress, null, 2)
  );
}

/**
 * Scrapes details for all books from the collected links
 */
export async function scrapeBookDetails(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: config.scraping.headless
  });

  try {
    await ensureDirectoryExists(config.files.output);
    const progress = await loadProgress();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);

    // Count total links if not already counted
    if (!progress.totalLinks) {
      const fileContent = await fs.readFile(config.files.links, 'utf-8');
      progress.totalLinks = fileContent.split('\n').filter(line => line.trim()).length;
    }

    const fileStream = createReadStream(config.files.links);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let currentLine = 0;
    for await (const line of rl) {
      currentLine++;
      
      // Skip already processed links
      if (currentLine <= progress.processedLinks) {
        continue;
      }

      const url = line.trim();
      if (!url) continue;

      try {
        log(`Processing book ${currentLine}/${progress.totalLinks} (${Math.round(currentLine/progress.totalLinks*100)}%)`);
        
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
        const details = await extractBookDetails($, url);

        // Append to CSV
        const csvLine = `${details.title}\t${details.author}\t${details.recommendationsCount}\t${details.url}\n`;
        await fs.appendFile(config.files.output, csvLine);

        // Update and save progress
        progress.processedLinks = currentLine;
        progress.lastProcessedUrl = url;
        await saveProgress(progress);

        // Random delay between requests
        await delay(randomInteger(config.scraping.minDelay, config.scraping.maxDelay));
      } catch (error) {
        console.error(`Failed to process ${url}:`, error);
        progress.failedLinks.push(url);
        await saveProgress(progress);
      }
    }

    log('Scraping completed successfully');
    if (progress.failedLinks.length > 0) {
      log(`Failed to process ${progress.failedLinks.length} links. Check scraping-progress.json for details.`);
    }
  } catch (error) {
    if (error instanceof ScrapingError) {
      throw error;
    }
    throw new ScrapingError(
      'Failed to scrape book details',
      'details scraping',
      error instanceof Error ? error : new Error(String(error))
    );
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  scrapeBookDetails().catch(error => {
    console.error('Scraping failed:', error);
    process.exit(1);
  });
}
