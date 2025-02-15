import { RetryConfig, ScrapingError } from './types';

/**
 * Generates a random integer between min and max (inclusive)
 */
export function randomInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Delays execution for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async operation with exponential backoff
 * @param operation - The async operation to retry
 * @param config - Retry configuration
 * @param context - Context for error messages
 */
export async function retry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  context: string
): Promise<T> {
  let lastError: Error | undefined;
  let currentDelay = config.delayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === config.maxAttempts) {
        throw new ScrapingError(
          `Failed after ${attempt} attempts: ${context}`,
          context,
          lastError
        );
      }

      console.warn(`Attempt ${attempt} failed: ${context}. Retrying in ${currentDelay}ms...`);
      await delay(currentDelay);
      currentDelay *= config.backoffFactor;
    }
  }

  // This should never be reached due to the throw above, but TypeScript needs it
  throw new Error('Unexpected retry failure');
}

/**
 * Creates a progress logger that outputs at most once per second
 */
export function createProgressLogger() {
  let lastLog = 0;
  const minInterval = 1000; // 1 second

  return function log(message: string) {
    const now = Date.now();
    if (now - lastLog >= minInterval) {
      console.log(`[${new Date().toISOString()}] ${message}`);
      lastLog = now;
    }
  };
}

/**
 * Ensures a directory exists, creating it if necessary
 */
export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const dir = path.dirname(filePath);
  
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}
