import { scrapeBookLinks } from './linkScraper';
import { scrapeBookDetails } from './detailsScraper';

/**
 * Main scraping process that collects links and then scrapes details
 */
async function main() {
  try {
    console.log('Starting book link collection...');
    await scrapeBookLinks();
    
    console.log('\nStarting book details scraping...');
    await scrapeBookDetails();
    
    console.log('\nScraping process completed successfully');
  } catch (error) {
    console.error('Scraping process failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
