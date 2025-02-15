"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeBookDetails = scrapeBookDetails;
const puppeteer_1 = __importDefault(require("puppeteer"));
const cheerio_1 = __importDefault(require("cheerio"));
const fs_1 = require("fs");
const fs_2 = require("fs");
const readline_1 = require("readline");
const config_1 = require("./config");
const utils_1 = require("./utils");
const types_1 = require("./types");
const log = (0, utils_1.createProgressLogger)();
/**
 * Extracts book details from a page
 */
async function extractBookDetails($, url) {
    const title = $(config_1.config.selectors.bookTitle).text().trim();
    const author = $(config_1.config.selectors.bookAuthor).text().trim();
    let recommendationsCount = 0;
    const recommendations = $(config_1.config.selectors.recommendations).first();
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
async function loadProgress() {
    try {
        const data = await fs_2.promises.readFile('scraping-progress.json', 'utf-8');
        return JSON.parse(data);
    }
    catch {
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
async function saveProgress(progress) {
    await fs_2.promises.writeFile('scraping-progress.json', JSON.stringify(progress, null, 2));
}
/**
 * Scrapes details for all books from the collected links
 */
async function scrapeBookDetails() {
    const browser = await puppeteer_1.default.launch({
        headless: config_1.config.scraping.headless
    });
    try {
        await (0, utils_1.ensureDirectoryExists)(config_1.config.files.output);
        const progress = await loadProgress();
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(0);
        // Count total links if not already counted
        if (!progress.totalLinks) {
            const fileContent = await fs_2.promises.readFile(config_1.config.files.links, 'utf-8');
            progress.totalLinks = fileContent.split('\n').filter(line => line.trim()).length;
        }
        const fileStream = (0, fs_1.createReadStream)(config_1.config.files.links);
        const rl = (0, readline_1.createInterface)({
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
            if (!url)
                continue;
            try {
                log(`Processing book ${currentLine}/${progress.totalLinks} (${Math.round(currentLine / progress.totalLinks * 100)}%)`);
                await (0, utils_1.retry)(async () => {
                    await page.goto(url);
                    await (0, utils_1.delay)(config_1.config.scraping.timeout);
                }, {
                    maxAttempts: 3,
                    delayMs: 1000,
                    backoffFactor: 2
                }, url);
                const content = await page.content();
                const $ = cheerio_1.default.load(content);
                const details = await extractBookDetails($, url);
                // Append to CSV
                const csvLine = `${details.title}\t${details.author}\t${details.recommendationsCount}\t${details.url}\n`;
                await fs_2.promises.appendFile(config_1.config.files.output, csvLine);
                // Update and save progress
                progress.processedLinks = currentLine;
                progress.lastProcessedUrl = url;
                await saveProgress(progress);
                // Random delay between requests
                await (0, utils_1.delay)((0, utils_1.randomInteger)(config_1.config.scraping.minDelay, config_1.config.scraping.maxDelay));
            }
            catch (error) {
                console.error(`Failed to process ${url}:`, error);
                progress.failedLinks.push(url);
                await saveProgress(progress);
            }
        }
        log('Scraping completed successfully');
        if (progress.failedLinks.length > 0) {
            log(`Failed to process ${progress.failedLinks.length} links. Check scraping-progress.json for details.`);
        }
    }
    catch (error) {
        if (error instanceof types_1.ScrapingError) {
            throw error;
        }
        throw new types_1.ScrapingError('Failed to scrape book details', 'details scraping', error instanceof Error ? error : new Error(String(error)));
    }
    finally {
        await browser.close();
    }
}
if (require.main === module) {
    scrapeBookDetails().catch(error => {
        console.error('Scraping failed:', error);
        process.exit(1);
    });
}
