import { promises as fs } from 'fs';
import { BookDetails, ScrapingProgress, Logger, ScrapingErrorRecord } from '../types.js';
import { ensureDirectoryExists } from '../utils.js';
import path from 'path';

/**
 * Service for handling data persistence operations
 */
export class StorageService {
  constructor(
    private logger: Logger
  ) {}

  /**
   * Saves book details to CSV file
   */
  async saveBookDetails(filePath: string, details: BookDetails): Promise<void> {
    await ensureDirectoryExists(filePath);
    
    const csvLine = [
      this.escapeCsvField(details.title),
      this.escapeCsvField(details.author),
      details.recommendationsCount,
      this.escapeCsvField(details.url),
      details.scrapedAt.toISOString()
    ].join(',');

    try {
      await fs.appendFile(filePath, csvLine + '\n', 'utf-8');
      this.logger.debug('Saved book details', { title: details.title });
    } catch (error) {
      this.logger.error('Failed to save book details', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Saves multiple book details in batch
   */
  async saveBookDetailsBatch(filePath: string, detailsList: BookDetails[]): Promise<void> {
    await ensureDirectoryExists(filePath);
    
    const csvLines = detailsList.map(details => 
      [
        this.escapeCsvField(details.title),
        this.escapeCsvField(details.author),
        details.recommendationsCount,
        this.escapeCsvField(details.url),
        details.scrapedAt.toISOString()
      ].join(',')
    );

    try {
      await fs.appendFile(filePath, csvLines.join('\n') + '\n', 'utf-8');
      this.logger.debug('Saved book details batch', { count: detailsList.length });
    } catch (error) {
      this.logger.error('Failed to save book details batch', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Saves book links to file
   */
  async saveLinks(filePath: string, links: string[]): Promise<void> {
    await ensureDirectoryExists(filePath);
    
    try {
      await fs.appendFile(filePath, links.join('\n') + '\n', 'utf-8');
      this.logger.debug('Saved links', { count: links.length });
    } catch (error) {
      this.logger.error('Failed to save links', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Loads book links from file
   */
  async loadLinks(filePath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const links = content.split('\n').filter(line => line.trim());
      this.logger.debug('Loaded links', { count: links.length });
      return links;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      this.logger.error('Failed to load links', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Saves scraping progress
   */
  async saveProgress(filePath: string, progress: ScrapingProgress): Promise<void> {
    await ensureDirectoryExists(filePath);
    
    try {
      await fs.writeFile(
        filePath,
        JSON.stringify(progress, null, 2),
        'utf-8'
      );
      this.logger.debug('Saved progress', {
        processed: progress.processedLinks,
        total: progress.totalLinks
      });
    } catch (error) {
      this.logger.error('Failed to save progress', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Loads scraping progress
   */
  async loadProgress(filePath: string): Promise<ScrapingProgress> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const progress = JSON.parse(content) as ScrapingProgress;
      this.logger.debug('Loaded progress', {
        processed: progress.processedLinks,
        total: progress.totalLinks
      });
      return progress;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          processedLinks: 0,
          totalLinks: 0,
          failedLinks: [],
          startedAt: new Date(),
          lastUpdatedAt: new Date(),
          errors: []
        };
      }
      this.logger.error('Failed to load progress', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Logs a scraping error
   */
  async logError(filePath: string, error: ScrapingErrorRecord): Promise<void> {
    await ensureDirectoryExists(filePath);
    
    try {
      await fs.appendFile(
        filePath,
        JSON.stringify(error, null, 2) + '\n',
        'utf-8'
      );
      this.logger.debug('Logged error', { url: error.url });
    } catch (err) {
      this.logger.error('Failed to log error', err as Error, { filePath });
      throw err;
    }
  }

  /**
   * Escapes a field for CSV format
   */
  private escapeCsvField(field: string): string {
    if (field.includes('"') || field.includes(',') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
