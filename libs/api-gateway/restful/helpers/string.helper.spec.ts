import { isValidUrl, getPathFromUrl, ttlToHumanReadable } from './string.helper';

describe('isValidUrl', () => {
    it('accepts absolute URLs', () => {
        expect(isValidUrl('http://localhost:3000')).toBe(true);
        expect(isValidUrl('https://example.com/path?a=1#frag')).toBe(true);
        expect(isValidUrl('redis://127.0.0.1:6379')).toBe(true);
    });

    it('rejects relative paths and garbage', () => {
        expect(isValidUrl('/users/1')).toBe(false);
        expect(isValidUrl('not a url')).toBe(false);
        expect(isValidUrl('')).toBe(false);
    });

    it('rejects non-string values', () => {
        expect(isValidUrl(undefined)).toBe(false);
        expect(isValidUrl(null)).toBe(false);
        expect(isValidUrl({})).toBe(false);
    });
});

describe('getPathFromUrl', () => {
    it('extracts the path from an absolute URL', () => {
        expect(getPathFromUrl('http://example.com/users/1?active=true')).toBe('/users/1');
    });

    it('extracts the path from a relative URL', () => {
        expect(getPathFromUrl('/users/1?active=true#x')).toBe('/users/1');
        expect(getPathFromUrl('/users/1')).toBe('/users/1');
    });

    it('returns "/" for a root URL', () => {
        expect(getPathFromUrl('http://example.com')).toBe('/');
        expect(getPathFromUrl('/')).toBe('/');
    });
});

describe('ttlToHumanReadable', () => {
    it('describes sub-minute TTLs', () => {
        expect(ttlToHumanReadable(0)).toBe('less than a minute');
        expect(ttlToHumanReadable(59)).toBe('less than a minute');
    });

    it('describes a single minute (including partial second remainders)', () => {
        expect(ttlToHumanReadable(60)).toBe('the next one minute');
        expect(ttlToHumanReadable(119)).toBe('the next one minute');
    });

    it('describes multiple minutes below an hour', () => {
        expect(ttlToHumanReadable(120)).toBe('the next 2 minutes');
        expect(ttlToHumanReadable(3599)).toBe('the next 59 minutes');
    });

    it('describes a single hour for 60-119 minutes', () => {
        expect(ttlToHumanReadable(3600)).toBe('the next one hour');
        expect(ttlToHumanReadable(7199)).toBe('the next one hour');
    });

    it('describes multiple hours', () => {
        expect(ttlToHumanReadable(7200)).toBe('the next 2 hours');
        expect(ttlToHumanReadable(86400)).toBe('the next 24 hours');
    });
});
