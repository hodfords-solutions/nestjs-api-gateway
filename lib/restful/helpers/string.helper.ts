import { ApiServiceDetail } from '../types/api-service.type';

/**
 * Validate whether a value is valid URL.
 * @param {any} string Any value.
 * @returns {boolean} Return whether URL is valid of not.
 */
export function isValidUrl(string: any): boolean {
    try {
        new URL(string);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Get path from a URL
 * @param {string} value A URL
 * @returns {string} The path
 */
export function getPathFromUrl(value: string): string {
    if (isValidUrl(value)) {
        return new URL(value).pathname;
    }

    return new URL(`http://localhost${value}`).pathname;
}

/**
 * Convert ttl to a human readable sentence.
 * @param {number} ttl Time to live
 * @returns {string} A string.
 */
export function ttlToHumanReadable(ttl: number): string {
    const minutes = Math.floor(ttl / 60);
    if (minutes < 1) {
        return 'less than a minute';
    } else if (minutes === 1) {
        return 'the next one minute';
    } else if (minutes < 60) {
        return `the next ${minutes} minutes`;
    } else if (minutes < 120) {
        return 'the next one hour';
    } else {
        return `the next ${Math.floor(minutes / 60)} hours`;
    }
}

/**
 * Parse the string of API services separated by ',' into objects contain their prefix, document url, and host.
 * @param {string} apiService Microservices which the gateway invokes and aggregates their results. Each service is separated by ','.
 * @returns {ApiServiceDetail[]} Detail of API Services
 */
export function parseApiService(apiService: string): ApiServiceDetail[] {
    if (!apiService) {
        return [];
    }
    return apiService
        .split(',')
        .map((doc) => {
            const api = doc.split('|');
            if (api.length != 2 || !isValidUrl(api[1])) {
                throw new Error('API must have format: prefix:url');
            }
            const url = new URL(api[1]);
            return {
                prefix: api[0],
                docUrl: api[1],
                host: url.origin
            };
        })
        .filter((doc) => doc);
}
