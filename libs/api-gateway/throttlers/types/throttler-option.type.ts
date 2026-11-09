import type { Request } from 'express';
import type { RouterDetail } from '../../restful/types/router-path.type.js';

export type ThrottlerKeyResolverContext = {
    request: Request;
    routerDetail: RouterDetail;
    /**
     * The client address after normalisation (IPv4-mapped prefix stripped, IPv6 masked to
     * `ipv6Subnet`). Use it instead of `request.ip` when building IP-based keys.
     */
    ip: string;
};

/**
 * Object form of a `keyResolver` result. Lets the resolver say whether the request is
 * authenticated, which `globalIpRateLimitScope: 'anonymous'` uses to decide whether the
 * global IP bucket applies.
 */
export type ThrottlerIdentity = {
    /** Bucket identity. An empty value (`null`, `undefined`, blank string) skips the custom and per-route limits. */
    key: string | null | undefined;
    /** `true` when the request carries a verified user identity. Defaults to `false`. */
    authenticated?: boolean;
};

export type ThrottlerKeyResolverResult = string | null | undefined | ThrottlerIdentity;

export type ThrottlerKeyResolver = (
    context: ThrottlerKeyResolverContext
) => ThrottlerKeyResolverResult | Promise<ThrottlerKeyResolverResult>;

/**
 * - `'all'` (default): every request counts against the global IP bucket, checked before the
 *   proxy middlewares run.
 * - `'anonymous'`: only requests that are not authenticated (per `keyResolver`'s
 *   `{ authenticated: true }`) count against it. Authenticated traffic is bounded by the custom
 *   (per-identity) limit instead, so many users behind one NAT address don't share a bucket.
 */
export type ThrottlerGlobalIpRateLimitScope = 'all' | 'anonymous';

export type ThrottlerOption = {
    globalIpRateLimit: number;
    globalIpRateLimitTTL: number;
    globalCustomRateLimit: number;
    globalCustomRateLimitTTL: number;
    isEnable: boolean;
    keyResolver?: ThrottlerKeyResolver;
    /** Which requests the global IP bucket applies to. Default `'all'`. */
    globalIpRateLimitScope?: ThrottlerGlobalIpRateLimitScope;
    /**
     * Prefix length IPv6 client addresses are masked to before being used in an IP-based key.
     * Default `64`. Use `128` to bucket each IPv6 address separately.
     */
    ipv6Subnet?: number;
};
