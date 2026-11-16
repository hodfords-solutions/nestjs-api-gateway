import { describe, it, expect } from 'vitest';
import { IncomingMessage } from 'http';
import { normalizeRequestUrl, omitExcludedHeaders, stripExcludedHeaders } from './request-sanitizer.helper.js';

const req = (url: string, headers: Record<string, string> = {}): IncomingMessage =>
    ({ url, headers }) as unknown as IncomingMessage;

describe('normalizeRequestUrl', () => {
    it('leaves a clean path untouched and keeps the query', () => {
        const request = req('/user-services/v1/me?x=1&y=2');
        expect(normalizeRequestUrl(request)).toBe('/user-services/v1/me?x=1&y=2');
        expect(request.url).toBe('/user-services/v1/me?x=1&y=2');
    });

    it.each([
        ['/user-services/oidc/../v1/admin', '/user-services/v1/admin'],
        ['/user-services/oidc/%2e%2e/v1/admin', '/user-services/v1/admin'],
        ['/user-services/oidc/.%2e/v1/admin', '/user-services/v1/admin'],
        ['/user-services/oidc\\..\\v1/admin', '/user-services/v1/admin'],
        ['/user-services/oidc/./a/../../v1/admin?k=v', '/user-services/v1/admin?k=v'],
        ['/../user-services/v1/admin', '/user-services/v1/admin']
    ])('collapses dot segments so %s is seen as %s', (input, expected) => {
        const request = req(input);
        expect(normalizeRequestUrl(request)).toBe(expected);
        expect(request.url).toBe(expected);
    });

    it('falls back to / when the url is missing', () => {
        expect(normalizeRequestUrl(req(''))).toBe('/');
    });
});

describe('stripExcludedHeaders', () => {
    it('removes configured headers from the incoming request regardless of configured casing', () => {
        const request = req('/', { 'auth-user-id': 'spoofed', 'x-api-key': 'k', 'x-keep': 'yes' });
        stripExcludedHeaders(request, ['Auth-User-Id', 'X-API-KEY']);
        expect(request.headers).toEqual({ 'x-keep': 'yes' });
    });

    it('is a no-op without excluded headers or without a header bag', () => {
        const request = req('/', { 'auth-user-id': 'a' });
        stripExcludedHeaders(request);
        expect(request.headers).toEqual({ 'auth-user-id': 'a' });
        expect(() => stripExcludedHeaders({ url: '/' } as IncomingMessage, ['a'])).not.toThrow();
    });
});

describe('omitExcludedHeaders', () => {
    it('returns a copy without the excluded names, case-insensitively', () => {
        const input = { 'Auth-User-Id': 'spoofed', 'x-trace': 't' };
        expect(omitExcludedHeaders(input, ['auth-user-id'])).toEqual({ 'x-trace': 't' });
        expect(input).toEqual({ 'Auth-User-Id': 'spoofed', 'x-trace': 't' });
    });
});
