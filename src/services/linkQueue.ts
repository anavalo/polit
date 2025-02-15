import { EventEmitter } from 'events';
import { Logger } from '../types.js';

/**
 * Manages a queue of links for parallel processing between link scraper and details scraper
 */
export class LinkQueue extends EventEmitter {
  private queue: string[] = [];
  private isComplete = false;
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Adds new links to the queue and emits 'links-available' event
   */
  public addLinks(links: string[]): void {
    this.queue.push(...links);
    this.logger.info(`Added ${links.length} links to queue. Queue size: ${this.queue.length}`);
    this.emit('links-available');
  }

  /**
   * Gets the next batch of links from the queue
   */
  public getBatch(batchSize: number): string[] {
    const batch = this.queue.splice(0, batchSize);
    return batch;
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
    return this.queue.length > 0 || !this.isComplete;
  }

  /**
   * Gets the current queue size
   */
  public size(): number {
    return this.queue.length;
  }
}
