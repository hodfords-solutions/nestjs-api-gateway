/**
 * Validate whether a value is valid URL.
 * @param {any} string Any value.
 * @returns {boolean} Return whether URL is valid of not.
 */
export function isValidUrl(string: any): boolean {
    try {
        new URL(string);
        return true;
    } catch {
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
