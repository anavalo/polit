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
  MIN_DELAY: z.string().regex(/^\d+$/).transform(Number).default('800'),
  MAX_DELAY: z.string().regex(/^\d+$/).transform(Number).default('1200'),
  TIMEOUT: z.string().regex(/^\d+$/).transform(Number).default('30000'),
  MAX_CONCURRENT: z.string().regex(/^\d+$/).transform(Number).default('3'),
  RATE_LIMIT: z.string().regex(/^\d+$/).transform(Number).default('30'),
  DEBUG: z.enum(['true', 'false']).default('false'),
});

/**
 * Parse and validate environment variables
 */
const env = envSchema.parse({
  BASE_URL: process.env.BASE_URL || 'https://www.politeianet.gr',
  BOOK_LIST_PATH: process.env.BOOK_LIST_PATH || '/index.php?orderby=bestsellers&Itemid=585&option=com_virtuemart&page=shop.browse&category_id=470&manufacturer_id=0&keyword=&keyword1=&keyword2=&kidage=0&limitstart=0',
  HEADLESS: process.env.HEADLESS,
  MIN_DELAY: process.env.MIN_DELAY,
  MAX_DELAY: process.env.MAX_DELAY,
  TIMEOUT: process.env.TIMEOUT,
  MAX_CONCURRENT: process.env.MAX_CONCURRENT,
  RATE_LIMIT: process.env.RATE_LIMIT,
  DEBUG: process.env.DEBUG,
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
    minDelay: env.MIN_DELAY,
    maxDelay: env.MAX_DELAY,
    timeout: env.TIMEOUT,
    maxConcurrent: env.MAX_CONCURRENT,
    rateLimitPerMinute: env.RATE_LIMIT,
  },
  selectors: {
    bookLinks: '.home-featured-blockImageContainer > a',
    nextPage: '.pagination li:nth-child(8) > a',
    bookTitle: '.details-right-column > h1',
    bookAuthor: '.details-right-column > b > a',
    recommendations: '.product-reviews-inner',
  },
  files: {
    links: 'data/links.txt',
    output: 'data/religion.csv',
    errorLog: 'logs/error.log',
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
    minDelay: z.number().min(0),
    maxDelay: z.number().min(0),
    timeout: z.number().min(0),
    maxConcurrent: z.number().min(1),
    rateLimitPerMinute: z.number().min(1),
  }).refine(data => data.minDelay <= data.maxDelay, {
    message: 'minDelay must be less than or equal to maxDelay',
  }),
  selectors: z.object({
    bookLinks: z.string(),
    nextPage: z.string(),
    bookTitle: z.string(),
    bookAuthor: z.string(),
    recommendations: z.string(),
  }),
  files: z.object({
    links: z.string(),
    output: z.string(),
    errorLog: z.string(),
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
