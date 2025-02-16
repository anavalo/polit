import { EventEmitter } from 'events';
import { Logger } from '../types.js';
import pLimit from 'p-limit';

interface QueueStats {
  processed: number;
  failed: number;
  avgProcessingTime: number;
}

/**
 * Manages an optimized queue of links for parallel processing with adaptive batching
 */
export class LinkQueue extends EventEmitter {
  private queue: string[] = [];
  private processing: Set<string> = new Set();
  private isComplete = false;
  private logger: Logger;
  private stats: QueueStats = {
    processed: 0,
    failed: 0,
    avgProcessingTime: 0,
  };
  private lastEmitTime = 0;
  private readonly EMIT_THROTTLE = 100; // ms

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Adds new links to the queue and emits 'links-available' event with throttling
   */
  public addLinks(links: string[]): void {
    // Deduplicate links before adding
    const newLinks = links.filter(link => !this.processing.has(link));
    this.queue.push(...newLinks);
    
    const now = Date.now();
    if (now - this.lastEmitTime >= this.EMIT_THROTTLE) {
      this.logger.info(`Added ${newLinks.length} links to queue. Queue size: ${this.queue.length}`);
      this.emit('links-available');
      this.lastEmitTime = now;
    }
  }

  /**
   * Gets the next batch of links from the queue with adaptive sizing
   */
  public getBatch(maxBatchSize: number): string[] {
    // Adjust batch size based on processing stats
    const adaptiveBatchSize = this.calculateAdaptiveBatchSize(maxBatchSize);
    const batch = this.queue.splice(0, adaptiveBatchSize);
    
    // Track processing items
    batch.forEach(link => this.processing.add(link));
    
    return batch;
  }

  /**
   * Marks items as processed and updates statistics
   */
  public markProcessed(links: string[], success: boolean, processingTime: number): void {
    links.forEach(link => this.processing.delete(link));
    
    if (success) {
      this.stats.processed += links.length;
      // Update moving average of processing time
      this.stats.avgProcessingTime = 
        (this.stats.avgProcessingTime * this.stats.processed + processingTime) / 
        (this.stats.processed + 1);
    } else {
      this.stats.failed += links.length;
    }
  }

  /**
   * Marks the link collection as complete
   */
  public markComplete(): void {
    this.isComplete = true;
    this.emit('collection-complete');
  }

  /**
   * Checks if there are more links to process
   */
  public hasMore(): boolean {
    return this.queue.length > 0 || !this.isComplete || this.processing.size > 0;
  }

  /**
   * Gets the current queue size and processing statistics
   */
  public getStats(): { queueSize: number } & QueueStats {
    return {
      queueSize: this.queue.length,
      ...this.stats
    };
  }

  /**
   * Calculates adaptive batch size based on performance metrics
   */
  private calculateAdaptiveBatchSize(maxBatchSize: number): number {
    if (this.stats.processed === 0) {
      return maxBatchSize;
    }

    const successRate = this.stats.processed / (this.stats.processed + this.stats.failed);
    const processingLoad = this.processing.size;
    
    // Reduce batch size if:
    // 1. Success rate is low (< 80%)
    // 2. Current processing load is high
    // 3. Average processing time is increasing
    let adjustedSize = maxBatchSize;
    
    if (successRate < 0.8) {
      adjustedSize = Math.max(1, Math.floor(adjustedSize * 0.8));
    }
    
    if (processingLoad > maxBatchSize * 2) {
      adjustedSize = Math.max(1, Math.floor(adjustedSize * 0.7));
    }
    
    return Math.min(adjustedSize, this.queue.length);
  }
}
