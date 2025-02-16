import { promises as fs, createWriteStream } from 'fs';
import { WriteStream } from 'fs';
import { BookDetails, ScrapingProgress, Logger } from '../types.js';
import { ensureDirectoryExists } from '../utils.js';

/**
 * Service for handling data persistence operations
 */
export class StorageService {
  private writeStream: WriteStream | null = null;
  private writeBuffer: string[] = [];
  private readonly BUFFER_SIZE = 1000; // Number of lines to buffer before writing

  constructor(
    private logger: Logger
  ) {}

  /**
   * Initializes the write stream for a file
   */
  private async initializeWriteStream(filePath: string): Promise<void> {
    await ensureDirectoryExists(filePath);
    this.writeStream = createWriteStream(filePath, { flags: 'a', encoding: 'utf-8' });
    
    this.writeStream.on('error', (error) => {
      this.logger.error('Write stream error', error as Error, { filePath });
    });
  }

  /**
   * Saves multiple book details in batch
   */
  async saveBookDetailsBatch(filePath: string, detailsList: BookDetails[]): Promise<void> {
    try {
      if (!this.writeStream) {
        await this.initializeWriteStream(filePath);
      }

      const csvLines = detailsList.map(details => 
        [
          this.escapeCsvField(details.title),
          this.escapeCsvField(details.author),
          details.recommendationsCount,
          this.escapeCsvField(details.url),
          details.scrapedAt.toISOString()
        ].join(',')
      );

      this.writeBuffer.push(...csvLines);

      if (this.writeBuffer.length >= this.BUFFER_SIZE) {
        await this.flushBuffer();
      }

      this.logger.debug('Processed book details batch', { count: detailsList.length });
    } catch (error) {
      this.logger.error('Failed to save book details batch', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Flushes the write buffer to disk
   */
  private async flushBuffer(): Promise<void> {
    if (!this.writeStream || this.writeBuffer.length === 0) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const data = this.writeBuffer.join('\n') + '\n';
      this.writeStream!.write(data, (error: Error | null | undefined) => {
        if (error) {
          reject(error);
        } else {
          this.writeBuffer = [];
          resolve();
        }
      });
    });
  }

  /**
   * Closes the write stream and flushes any remaining data
   */
  async close(): Promise<void> {
    if (this.writeStream) {
      try {
        await this.flushBuffer();
        await new Promise<void>((resolve, reject) => {
          this.writeStream!.end((error: Error | null | undefined) => {
            if (error) reject(error);
            else resolve();
          });
        });
        this.writeStream = null;
      } catch (error) {
        this.logger.error('Error closing write stream', error as Error);
        throw error;
      }
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
