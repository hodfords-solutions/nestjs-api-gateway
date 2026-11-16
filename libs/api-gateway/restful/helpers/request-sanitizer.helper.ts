import { IncomingMessage } from 'http';

const dummyBase = 'http://dummy-base.local';

/**
 * Canonicalize the request URL in place so every routing decision (server lookup, bypass
 * prefixes, router lookup) and the path forwarded upstream agree on the same path.
 *
 * Without this, dot segments (`..`, `.`, `%2e%2e`) or backslashes let a request that *looks*
 * like it targets a public prefix be forwarded to a different, protected route once the
 * upstream path is normalized, e.g. `/svc/public/../v1/admin` → `/svc/v1/admin`.
 * @param {IncomingMessage} request The incoming request; its `url` is rewritten
 * @returns {string} The canonical URL (`pathname + search`)
 */
export function normalizeRequestUrl(request: IncomingMessage): string {
    const url = new URL(request.url || '/', dummyBase);
    const normalized = url.pathname + url.search;
    request.url = normalized;
    return normalized;
}

/**
 * Drop caller-supplied copies of the headers the gateway owns (identity headers such as
 * `auth-user-id`) from the incoming request, so the only value that can reach an upstream
 * service is one a gateway middleware adds explicitly.
 *
 * Node lowercases incoming header names, so the configured names are matched case-insensitively.
 * @param {IncomingMessage} request The incoming request; its `headers` are mutated
 * @param {string[]} excludeHeaders Header names to remove
 */
export function stripExcludedHeaders(request: IncomingMessage, excludeHeaders: string[] = []): void {
    if (!request.headers) {
        return;
    }
    for (const excludeHeader of excludeHeaders) {
        delete request.headers[excludeHeader.toLowerCase()];
    }
}

/**
 * Remove excluded header names from a plain header map (used for caller-provided header
 * parameters, e.g. MCP tool arguments). Returns a new object; the input is left untouched.
 * @param {Record<string, string>} headers A header map
 * @param {string[]} excludeHeaders Header names to remove (case-insensitive)
 * @returns {Record<string, string>} The filtered map
 */
export function omitExcludedHeaders(
    headers: Record<string, string>,
    excludeHeaders: string[] = []
): Record<string, string> {
    const excluded = new Set(excludeHeaders.map((header) => header.toLowerCase()));
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (!excluded.has(key.toLowerCase())) {
            result[key] = value;
        }
    }
    return result;
}
