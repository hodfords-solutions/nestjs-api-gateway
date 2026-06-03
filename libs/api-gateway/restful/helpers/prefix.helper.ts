/**
 * Determine whether a request URL belongs to a prefix on a whole-path-segment basis.
 *
 * Matches when the URL equals the prefix or continues with a segment boundary
 * (`/`, `?`, `#`) immediately after it. A single leading slash on the URL is optional,
 * so both `/oauth/authorize` and `oauth/authorize` match the prefix `oauth`, while
 * `oauthtoken/...` does NOT (avoids partial-name collisions).
 * @param {string} url The incoming request URL/path
 * @param {string} prefix The prefix to test (without surrounding slashes), i.e, `oauth`
 * @returns {boolean} Whether the URL is within the prefix's path namespace
 */
export function matchesPrefixSegment(url: string, prefix: string): boolean {
    for (const base of [prefix, `/${prefix}`]) {
        if (url === base) {
            return true;
        }
        if (url.startsWith(base)) {
            const next = url.charAt(base.length);
            if (next === '/' || next === '?' || next === '#') {
                return true;
            }
        }
    }
    return false;
}
