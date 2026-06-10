import { kebabCase } from 'lodash';

/**
 * Memoized kebab-case conversions. Keys come from gateway middleware, so the set is small
 * and stable; the cap only guards against unbounded growth from dynamic keys.
 */
const kebabKeyCache = new Map<string, string>();
const kebabKeyCacheLimit = 1000;

function toKebabKey(key: string): string {
    let kebabKey = kebabKeyCache.get(key);
    if (kebabKey === undefined) {
        kebabKey = kebabCase(key);
        if (kebabKeyCache.size < kebabKeyCacheLimit) {
            kebabKeyCache.set(key, kebabKey);
        }
    }
    return kebabKey;
}

/**
 * Convert the keys of an object from their original format (e.g., camelCase or snake_case) to kebab-case
 * @param {Object} object An object
 * @returns {Object} The converted object with every key is kebab-case.
 */
export function kebabConvertKeys<T>(object: object): T {
    const newObject: any = {};
    for (const key in object) {
        newObject[toKebabKey(key)] = object[key];
    }
    return newObject;
}
