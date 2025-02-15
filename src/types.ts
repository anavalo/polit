/**
 * Represents a book's details scraped from the website
 */
export interface BookDetails {
  title: string;
  author: string;
  recommendationsCount: number;
  url: string;
  scrapedAt: Date;  // Add timestamp
}

/**
 * Represents the scraping progress state
 */
export interface ScrapingProgress {
  processedLinks: number;
  totalLinks: number;
  failedLinks: string[];
  lastProcessedUrl?: string;
  startedAt: Date;
  lastUpdatedAt: Date;
  errors: ScrapingErrorRecord[];
}

/**
 * Record of scraping errors for better error tracking
 */
export interface ScrapingErrorRecord {
  url: string;
  error: string;
  timestamp: Date;
  attemptCount: number;
}

/**
 * Base error class for all scraping related errors
 */
export class ScrapingError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ScrapingError';
  }
}

/**
 * Specific error for network-related issues
 */
export class NetworkError extends ScrapingError {
  constructor(url: string, cause?: Error, context?: Record<string, unknown>) {
    super('Network error occurred during scraping', url, cause, context);
    this.name = 'NetworkError';
  }
}

/**
 * Specific error for parsing-related issues
 */
export class ParseError extends ScrapingError {
  constructor(url: string, cause?: Error, context?: Record<string, unknown>) {
    super('Failed to parse page content', url, cause, context);
    this.name = 'ParseError';
  }
}

/**
 * Type for retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffFactor: number;
  maxDelay?: number;  // Add maximum delay cap
  timeout?: number;   // Add operation timeout
}

/**
 * Configuration interface for type safety
 */
export interface ScraperConfig {
  base: {
    url: string;
    bookListPath: string;
  };
  scraping: {
    headless: boolean;
    minDelay: number;
    maxDelay: number;
    timeout: number;
    maxConcurrent: number;  // Add concurrency control
    rateLimitPerMinute: number;  // Add rate limiting
  };
  selectors: {
    bookLinks: string;
    nextPage: string;
    bookTitle: string;
    bookAuthor: string;
    recommendations: string;
  };
  files: {
    output: string;
  };
}

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}
