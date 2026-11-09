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
 * authenticated, which decides whether the anonymous IP bucket (`anonymousIpRateLimit`) applies.
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

export type ThrottlerOption = {
    globalIpRateLimit: number;
    globalIpRateLimitTTL: number;
    globalCustomRateLimit: number;
    globalCustomRateLimitTTL: number;
    isEnable: boolean;
    keyResolver?: ThrottlerKeyResolver;
    /**
     * Optional second per-IP bucket that only counts unauthenticated requests (and requests rejected
     * by a proxy middleware). Runs alongside `globalIpRateLimit`, which counts all traffic, so the
     * all-traffic ceiling can stay high enough for a shared NAT address while anonymous traffic gets
     * a tighter limit. A request is authenticated when `keyResolver` returns `{ authenticated: true }`.
     * Set both fields or neither.
     */
    anonymousIpRateLimit?: number;
    anonymousIpRateLimitTTL?: number;
    /**
     * Prefix length IPv6 client addresses are masked to before being used in an IP-based key.
     * Default `64`. Use `128` to bucket each IPv6 address separately.
     */
    ipv6Subnet?: number;
};
