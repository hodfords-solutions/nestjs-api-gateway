import { isReqUrlInWhitelist } from './whitelist.helper';
import { WHITELIST_PATHS } from '../constants/whitelist.constant';

describe('isReqUrlInWhitelist', () => {
    it('matches when the URL starts with a whitelist entry', () => {
        expect(isReqUrlInWhitelist('/oauth/authorize', ['/oauth'])).toBe(true);
        expect(isReqUrlInWhitelist('/oauth', ['/oauth'])).toBe(true);
    });

    it('does not match an unrelated URL', () => {
        expect(isReqUrlInWhitelist('/users/1', ['/oauth'])).toBe(false);
    });

    it('matches any of several entries', () => {
        expect(isReqUrlInWhitelist('/oidc/token', ['/oauth', '/oidc'])).toBe(true);
    });

    it('falls back to the default whitelist when the provided list is empty', () => {
        expect(isReqUrlInWhitelist(`${WHITELIST_PATHS[0]}/anything`, [])).toBe(true);
        expect(isReqUrlInWhitelist('/definitely-not-whitelisted', [])).toBe(false);
    });

    it('uses prefix (startsWith) semantics', () => {
        // Documents current behavior: a partial segment name still matches.
        expect(isReqUrlInWhitelist('/oauth-other/x', ['/oauth'])).toBe(true);
    });
});
