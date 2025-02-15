import { Logger } from './types.js';

/**
 * Implementation of the Logger interface that handles console logging
 */
export class ConsoleLogger implements Logger {
  private formatMessage(message: string, context?: Record<string, unknown>): string {
    return context ? `${message} ${JSON.stringify(context)}` : message;
  }

  async info(message: string, context?: Record<string, unknown>): Promise<void> {
    console.info(`[INFO] ${this.formatMessage(message, context)}`);
  }

  async warn(message: string, context?: Record<string, unknown>): Promise<void> {
    console.warn(`[WARN] ${this.formatMessage(message, context)}`);
  }

  async error(message: string, error?: Error, context?: Record<string, unknown>): Promise<void> {
    const errorContext = {
      ...context,
      ...(error && {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack
      })
    };

    console.error(`[ERROR] ${this.formatMessage(message, errorContext)}`);
  }

  async debug(message: string, context?: Record<string, unknown>): Promise<void> {
    if (process.env.DEBUG === 'true') {
      console.debug(`[DEBUG] ${this.formatMessage(message, context)}`);
    }
  }
}

/**
 * Creates a singleton logger instance
 */
export const createLogger = (): Logger => {
  return new ConsoleLogger();
};
