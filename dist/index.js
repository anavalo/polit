"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const linkScraper_1 = require("./linkScraper");
const detailsScraper_1 = require("./detailsScraper");
/**
 * Main scraping process that collects links and then scrapes details
 */
async function main() {
    try {
        console.log('Starting book link collection...');
        await (0, linkScraper_1.scrapeBookLinks)();
        console.log('\nStarting book details scraping...');
        await (0, detailsScraper_1.scrapeBookDetails)();
        console.log('\nScraping process completed successfully');
    }
    catch (error) {
        console.error('Scraping process failed:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
