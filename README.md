# Book Recommendations Scraper

A high-performance, TypeScript application for scraping `politeia.net` books data with robust error handling, intelligent concurrency, and comprehensive logging.

## Features

- **Intelligent Concurrency**
  - Adaptive batch processing with dynamic sizing
  - Rate limiting to respect server constraints
  - Smart queue management with deduplication
  - Concurrent processing with configurable limits

- **Robust Error Handling**
  - Automatic retries with exponential backoff
  - Custom error types for different failure scenarios
  - Comprehensive error tracking and logging
  - Graceful error recovery in batch processing

- **Performance Optimizations**
  - Event throttling to prevent system overload
  - Efficient memory usage with Set data structures
  - Moving average calculations for processing statistics
  - Adaptive concurrency based on system performance

## Prerequisites

- Node.js (v16 or higher)
- TypeScript
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Configuration

Create a `.env` file in the project root with your configuration:

```env
BASE_URL=https://www.politeianet.gr/
OUTPUT_FILE=books.csv
BOOK_LIST_PATH
HEADLESS=true
MAX_CONCURRENT=5
RATE_LIMIT_PER_MINUTE=30
```

## Usage

The scraper operates in two phases:

### 1. Collect Book Links

Scrapes all book links from the listing pages

### 2. Scrape Book Details

Processes the collected links to gather detailed book information

## Project Structure

```
src/
├── services/           # Core services
│   ├── browser.ts     # Browser automation service
│   ├── linkQueue.ts   # Queue management service
│   └── storage.ts     # Data persistence service
├── config.ts          # Configuration management
├── detailsScraper.ts  # Book details scraping logic
├── linkScraper.ts     # Book links collection logic
├── logger.ts          # Logging implementation
├── types.ts           # TypeScript type definitions
└── utils.ts           # Utility functions
```

## Output

The scraper generates a CSV file with the following information for each book:
- Title
- Author
- Number of recommendations
- Source URL
- Scraping timestamp

## License

ISC
