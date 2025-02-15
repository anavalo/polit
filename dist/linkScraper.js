"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeBookLinks = scrapeBookLinks;
const puppeteer_1 = __importDefault(require("puppeteer"));
const cheerio_1 = __importDefault(require("cheerio"));
const fs_1 = require("fs");
const config_1 = require("./config");
const utils_1 = require("./utils");
const types_1 = require("./types");
const log = (0, utils_1.createProgressLogger)();
/**
 * Scrapes book links from the website and saves them to a file
 */
async function scrapeBookLinks() {
    const browser = await puppeteer_1.default.launch({
        headless: config_1.config.scraping.headless
    });
    try {
        await (0, utils_1.ensureDirectoryExists)(config_1.config.files.links);
        const page = await browser.newPage();
        let url = `${config_1.config.base.url}${config_1.config.base.bookListPath}`;
        let pageNum = 1;
        let totalLinks = 0;
        while (true) {
            log(`Processing page ${pageNum}...`);
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
            const links = [];
            $(config_1.config.selectors.bookLinks).each((_, elem) => {
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
            await fs_1.promises.appendFile(config_1.config.files.links, links.join('\n') + '\n');
            totalLinks += links.length;
            log(`Found ${links.length} links on page ${pageNum}. Total: ${totalLinks}`);
            // Get next page URL
            const nextURL = $(config_1.config.selectors.nextPage).attr('href');
            if (!nextURL) {
                log('No next page link found. Scraping completed.');
                break;
            }
            url = config_1.config.base.url + nextURL;
            pageNum++;
            // Random delay between requests
            await (0, utils_1.delay)((0, utils_1.randomInteger)(config_1.config.scraping.minDelay, config_1.config.scraping.maxDelay));
        }
        log(`Scraping completed. Total links collected: ${totalLinks}`);
    }
    catch (error) {
        if (error instanceof types_1.ScrapingError) {
            throw error;
        }
        throw new types_1.ScrapingError('Failed to scrape book links', 'link scraping', error instanceof Error ? error : new Error(String(error)));
    }
    finally {
        await browser.close();
    }
}
if (require.main === module) {
    scrapeBookLinks().catch(error => {
        console.error('Scraping failed:', error);
        process.exit(1);
    });
}
