/**
 * Represents a book's details scraped from the website
 */
export interface BookDetails {
  title: string;
  author: string;
  recommendationsCount: number;
  url: string;
}

/**
 * Represents the scraping progress state
 */
export interface ScrapingProgress {
  processedLinks: number;
  totalLinks: number;
  failedLinks: string[];
  lastProcessedUrl?: string;
}

/**
 * Custom error for scraping operations
 */
export class ScrapingError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ScrapingError';
  }
}

/**
 * Type for retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffFactor: number;
}
