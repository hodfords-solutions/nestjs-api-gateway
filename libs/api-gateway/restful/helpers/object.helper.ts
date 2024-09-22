import { kebabCase } from 'lodash';

/**
 * Convert the keys of an object from their original format (e.g., camelCase or snake_case) to kebab-case
 * @param {Object} object An object
 * @returns {Object} The converted object with every key is kebab-case.
 */
export function kebabConvertKeys<T>(object: object): T {
    const newObject: any = {};
    for (const key in object) {
        newObject[kebabCase(key)] = object[key];
    }
    return newObject;
}
