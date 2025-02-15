import { promises as fs } from 'fs';
import { BookDetails, ScrapingProgress, Logger } from '../types.js';
import { ensureDirectoryExists } from '../utils.js';

/**
 * Service for handling data persistence operations
 */
export class StorageService {
  constructor(
    private logger: Logger
  ) {}

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
   * Escapes a field for CSV format
   */
  private escapeCsvField(field: string): string {
    if (field.includes('"') || field.includes(',') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
