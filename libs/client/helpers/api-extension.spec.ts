import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { addApiExtension, getApiExtensions } from './api-extension.js';
import { ApiRateLimit } from '../decorators/api-rate-limit.decorator.js';
import { ApiMcp } from '../decorators/api-mcp.decorator.js';

function makeDescriptor(): PropertyDescriptor {
    return { value: function handler(): void {} };
}

describe('addApiExtension / getApiExtensions', () => {
    it('returns an empty array when no extension is set', () => {
        expect(getApiExtensions(makeDescriptor(), 'x-anything')).toEqual([]);
    });

    it('accumulates values under the same key', () => {
        const descriptor = makeDescriptor();
        addApiExtension(descriptor, 'x-rate-limits', { limit: 1, ttl: 60 });
        addApiExtension(descriptor, 'x-rate-limits', { limit: 2, ttl: 30 });

        expect(getApiExtensions(descriptor, 'x-rate-limits')).toEqual([
            { limit: 1, ttl: 60 },
            { limit: 2, ttl: 30 }
        ]);
    });

    it('keeps keys independent', () => {
        const descriptor = makeDescriptor();
        addApiExtension(descriptor, 'x-a', 1);
        addApiExtension(descriptor, 'x-b', 2);
        expect(getApiExtensions(descriptor, 'x-a')).toEqual([1]);
        expect(getApiExtensions(descriptor, 'x-b')).toEqual([2]);
    });
});

describe('ApiRateLimit', () => {
    it('records the limit under x-rate-limits', () => {
        const descriptor = makeDescriptor();
        ApiRateLimit(10, 60)({}, 'handler', descriptor);
        expect(getApiExtensions(descriptor, 'x-rate-limits')).toEqual([{ limit: 10, ttl: 60, status: undefined }]);
    });

    it('records a status-scoped limit', () => {
        const descriptor = makeDescriptor();
        ApiRateLimit(5, 300, 401)({}, 'handler', descriptor);
        expect(getApiExtensions(descriptor, 'x-rate-limits')).toEqual([{ limit: 5, ttl: 300, status: 401 }]);
    });

    it('stacks multiple decorators on the same handler', () => {
        const descriptor = makeDescriptor();
        ApiRateLimit(10, 60)({}, 'handler', descriptor);
        ApiRateLimit(5, 300, 401)({}, 'handler', descriptor);
        expect(getApiExtensions(descriptor, 'x-rate-limits')).toHaveLength(2);
    });
});

describe('ApiMcp', () => {
    it('records the MCP description under x-api-mcp', () => {
        const descriptor = makeDescriptor();
        ApiMcp('List users')({}, 'handler', descriptor);
        expect(getApiExtensions(descriptor, 'x-api-mcp')).toEqual([{ description: 'List users' }]);
    });
});
