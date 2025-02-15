import { RetryConfig, ScrapingError } from './types.js';

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
