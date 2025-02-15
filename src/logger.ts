import { Logger } from './types.js';
import { promises as fs } from 'fs';
import { ensureDirectoryExists } from './utils.js';

/**
 * Implementation of the Logger interface that handles both console and file logging
 */
export class FileLogger implements Logger {
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
    this.initializeLogger().catch(error => {
      console.error('Failed to initialize logger:', error);
    });
  }

  private async initializeLogger(): Promise<void> {
    await ensureDirectoryExists(this.logFile);
  }

  private async writeToFile(level: string, message: string, context?: Record<string, unknown>): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(context && { context })
    };

    try {
      await fs.appendFile(
        this.logFile,
        JSON.stringify(logEntry) + '\n',
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private formatMessage(message: string, context?: Record<string, unknown>): string {
    return context ? `${message} ${JSON.stringify(context)}` : message;
  }

  async info(message: string, context?: Record<string, unknown>): Promise<void> {
    console.info(`[INFO] ${this.formatMessage(message, context)}`);
    await this.writeToFile('INFO', message, context);
  }

  async warn(message: string, context?: Record<string, unknown>): Promise<void> {
    console.warn(`[WARN] ${this.formatMessage(message, context)}`);
    await this.writeToFile('WARN', message, context);
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
    await this.writeToFile('ERROR', message, errorContext);
  }

  async debug(message: string, context?: Record<string, unknown>): Promise<void> {
    if (process.env.DEBUG === 'true') {
      console.debug(`[DEBUG] ${this.formatMessage(message, context)}`);
      await this.writeToFile('DEBUG', message, context);
    }
  }
}

/**
 * Creates a singleton logger instance
 */
export const createLogger = (logFile: string): Logger => {
  return new FileLogger(logFile);
};
