import { ScraperConfig } from './types.js';
import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment variables schema
 */
const envSchema = z.object({
  BASE_URL: z.string().url(),
  BOOK_LIST_PATH: z.string(),
  HEADLESS: z.enum(['true', 'false']).default('true'),
  TIMEOUT: z.string().regex(/^\d+$/).transform(Number).default('30000'),
  MAX_CONCURRENT: z.string().regex(/^\d+$/).transform(Number).default('5'),
  RATE_LIMIT: z.string().regex(/^\d+$/).transform(Number).default('60'),
  MAX_RETRIES: z.string().regex(/^\d+$/).transform(Number).default('3'),
  DEBUG: z.enum(['true', 'false']).default('false'),
  OUTPUT_FILE: z.string().default('data/anthology.csv'),
});

/**
 * Parse and validate environment variables
 */
const env = envSchema.parse({
  BASE_URL: process.env.BASE_URL || 'https://www.politeianet.gr',
  BOOK_LIST_PATH: process.env.BOOK_LIST_PATH || '/sygrafeas/anthologia-1466',
  HEADLESS: process.env.HEADLESS,
  TIMEOUT: process.env.TIMEOUT,
  MAX_CONCURRENT: process.env.MAX_CONCURRENT,
  RATE_LIMIT: process.env.RATE_LIMIT,
  MAX_RETRIES: process.env.MAX_RETRIES,
  DEBUG: process.env.DEBUG,
  OUTPUT_FILE: process.env.OUTPUT_FILE,
});

/**
 * Configuration object with validated values
 */
export const config: ScraperConfig = {
  base: {
    url: env.BASE_URL,
    bookListPath: env.BOOK_LIST_PATH,
  },
  scraping: {
    headless: env.HEADLESS === 'true',
    timeout: env.TIMEOUT,
    maxConcurrent: env.MAX_CONCURRENT,
    rateLimitPerMinute: env.RATE_LIMIT,
    maxRetries: env.MAX_RETRIES,
    waitUntil: 'networkidle0',
  },
  selectors: {
    bookLinks: '.home-featured-blockImageContainer > a',
    nextPage: '.pagination li:nth-child(8) > a',
    bookTitle: '.details-right-column > h1',
    bookAuthor: '.details-right-column > b > a',
    recommendations: '.product-reviews-inner',
  },
  files: {
    output: env.OUTPUT_FILE,
  },
} as const;

/**
 * Validate entire configuration
 */
const configSchema = z.object({
  base: z.object({
    url: z.string().url(),
    bookListPath: z.string(),
  }),
  scraping: z.object({
    headless: z.boolean(),
    timeout: z.number().min(0),
    maxConcurrent: z.number().min(1),
    rateLimitPerMinute: z.number().min(1),
    maxRetries: z.number().min(1),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).optional(),
  }),
  selectors: z.object({
    bookLinks: z.string(),
    nextPage: z.string(),
    bookTitle: z.string(),
    bookAuthor: z.string(),
    recommendations: z.string(),
  }),
  files: z.object({
    output: z.string(),
  }),
});

// Validate configuration
configSchema.parse(config);

/**
 * Get configuration for the current environment
 */
export const getConfig = (): ScraperConfig => {
  return config;
};
