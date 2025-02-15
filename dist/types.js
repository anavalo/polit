"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrapingError = void 0;
/**
 * Custom error for scraping operations
 */
class ScrapingError extends Error {
    constructor(message, url, cause) {
        super(message);
        this.url = url;
        this.cause = cause;
        this.name = 'ScrapingError';
    }
}
exports.ScrapingError = ScrapingError;
