import { matchesPrefixSegment } from './prefix.helper';

describe('matchesPrefixSegment', () => {
    // Contract config-and-routing.md B4 (R7–R10)
    it('matches a sub-path under the prefix (R7)', () => {
        expect(matchesPrefixSegment('/oauth/authorize', 'oauth')).toBe(true);
    });

    it('matches the bare prefix (R8)', () => {
        expect(matchesPrefixSegment('/oauth', 'oauth')).toBe(true);
    });

    it('matches the bare prefix with a trailing slash', () => {
        expect(matchesPrefixSegment('/oauth/', 'oauth')).toBe(true);
    });

    it('matches the prefix immediately followed by a query string (R9)', () => {
        expect(matchesPrefixSegment('/oauth?x=1', 'oauth')).toBe(true);
    });

    it('matches the prefix immediately followed by a fragment', () => {
        expect(matchesPrefixSegment('/oauth#frag', 'oauth')).toBe(true);
    });

    it('does NOT match a partial-name collision (R10)', () => {
        expect(matchesPrefixSegment('/oauthtoken/x', 'oauth')).toBe(false);
        expect(matchesPrefixSegment('/oauthtoken', 'oauth')).toBe(false);
    });

    it('treats the leading slash as optional', () => {
        expect(matchesPrefixSegment('oauth/authorize', 'oauth')).toBe(true);
        expect(matchesPrefixSegment('oauth', 'oauth')).toBe(true);
        expect(matchesPrefixSegment('oauthtoken', 'oauth')).toBe(false);
    });

    it('does not match an unrelated path', () => {
        expect(matchesPrefixSegment('/user-services/login', 'oauth')).toBe(false);
    });

    it('matches multi-segment prefixes on a whole-segment basis', () => {
        expect(matchesPrefixSegment('/user-services/login', 'user-services')).toBe(true);
        expect(matchesPrefixSegment('/user-services', 'user-services')).toBe(true);
        expect(matchesPrefixSegment('/user-services-admin/x', 'user-services')).toBe(false);
    });
});
