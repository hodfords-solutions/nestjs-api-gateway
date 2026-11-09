import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { ttlToHumanReadable } from '../../restful/helpers/string.helper.js';
import { RateLimit, RouterDetail } from '../../restful/types/router-path.type.js';
import { LUA_INCREASE_AND_GET_SCRIPT } from '../constants/lua-script.constant.js';
import { RATE_LIMIT_KEY, THROTTLER_OPTION } from '../constants/rate-limit.constant.js';
import { TooManyRequestException } from '../exceptions/too-many-request.exception.js';
import {
    ThrottlerGlobalIpRateLimitScope,
    ThrottlerKeyResolverResult,
    ThrottlerOption
} from '../types/throttler-option.type.js';
import { REDIS_OPTION } from '../../redis/constants/redis.constant.js';
import { assertValidIpv6Subnet, DEFAULT_IPV6_SUBNET, normalizeIp } from '../helpers/ip.helper.js';

const resolvedIdentityKey = Symbol('throttler.resolvedIdentity');
const globalIpCheckedKey = Symbol('throttler.globalIpChecked');
const skipThrottle = Symbol('throttler.skip');

type ResolvedIdentity = string | typeof skipThrottle;

type ResolvedRequest = {
    identity: ResolvedIdentity;
    authenticated: boolean;
};

const globalIpRateLimitScopes: ThrottlerGlobalIpRateLimitScope[] = ['all', 'anonymous'];

function isEmptyKey(value: unknown): boolean {
    if (value === null || value === undefined) {
        return true;
    }
    return typeof value === 'string' && value.trim() === '';
}

@Injectable()
export class ThrottlerService implements OnModuleInit {
    private luaSha: string;

    private readonly globalIpRateLimitScope: ThrottlerGlobalIpRateLimitScope;
    private readonly ipv6Subnet: number;

    constructor(
        @Inject(THROTTLER_OPTION) private option: ThrottlerOption,
        @Inject(REDIS_OPTION) private readonly redis: Redis
    ) {
        this.globalIpRateLimitScope = option.globalIpRateLimitScope ?? 'all';
        if (!globalIpRateLimitScopes.includes(this.globalIpRateLimitScope)) {
            throw new Error(
                `ThrottlerOption.globalIpRateLimitScope must be one of ${globalIpRateLimitScopes.join(', ')}. ` +
                    `Received: ${option.globalIpRateLimitScope}`
            );
        }
        this.ipv6Subnet = option.ipv6Subnet ?? DEFAULT_IPV6_SUBNET;
        assertValidIpv6Subnet(this.ipv6Subnet);
    }

    async onModuleInit(): Promise<any> {
        await this.loadLuaScript();
        this.redis.on('ready', async () => {
            await this.loadLuaScript();
        });
    }

    async loadLuaScript(): Promise<void> {
        this.luaSha = (await this.redis.script('LOAD', LUA_INCREASE_AND_GET_SCRIPT)) as string;
    }

    async getExpireAndIncreaseLimit(key: string, times: number, ttl: number): Promise<number> {
        return this.redis.evalsha(this.luaSha, 1, key, String(times), String(Math.floor(ttl * 1000))) as any;
    }

    async checkLimitOfRequest(routerDetail: RouterDetail, request: Request): Promise<void> {
        if (!this.option.isEnable) {
            return;
        }

        // Scope 'all': the global IP ceiling is a safety net keyed by the network address. It applies
        // before the key resolver and regardless of what the resolver returns (including the
        // skip-on-empty case), so exempt requests still count against the per-IP DoS limit.
        // Callers that already ran it earlier in the pipeline (e.g. the proxy, before auth) mark the
        // request so we don't double-count here; standalone callers (e.g. the MCP path) still get it.
        if (this.globalIpRateLimitScope === 'all' && !(request as any)[globalIpCheckedKey]) {
            await this.checkGlobalIpRequest(request);
        }

        const { identity, authenticated } = await this.resolveIdentity(routerDetail, request);
        (request as any)[resolvedIdentityKey] = identity;

        // Scope 'anonymous': identity is known now, so only unauthenticated requests hit the IP
        // bucket. Authenticated users behind one shared (NAT) address are bounded per identity below.
        if (this.globalIpRateLimitScope === 'anonymous' && !authenticated && !(request as any)[globalIpCheckedKey]) {
            await this.checkGlobalIpRequest(request);
        }

        if (identity === skipThrottle) {
            return;
        }

        await this.checkGlobalCustomRequest(identity);

        if (routerDetail?.rateLimits?.length) {
            for (const rateLimit of routerDetail.rateLimits) {
                await this.checkRouterRequest(routerDetail, request, rateLimit, identity);
            }
        }
    }

    /**
     * Run the global IP check at the point before proxy middlewares (authentication) execute.
     * With scope `'anonymous'` this is a no-op: the check is deferred to `checkLimitOfRequest`,
     * once the request's identity is known.
     */
    async checkGlobalIpRequestBeforeAuth(request: Request): Promise<void> {
        if (this.globalIpRateLimitScope === 'all') {
            await this.checkGlobalIpRequest(request);
        }
    }

    /**
     * Count a request that the proxy middlewares rejected (returned `false` or threw) against the
     * global IP bucket, unless it was already counted. Under scope `'anonymous'` such requests never
     * reach `checkLimitOfRequest`, and an identity that failed authentication is anonymous by
     * definition, so this keeps failed-auth floods under the IP ceiling.
     */
    async checkGlobalIpRequestOnAuthFailure(request: Request): Promise<void> {
        if (!(request as any)[globalIpCheckedKey]) {
            await this.checkGlobalIpRequest(request);
        }
    }

    async checkGlobalIpRequest(request: Request): Promise<void> {
        if (!this.option.isEnable) {
            return;
        }
        // Mark the request so a later checkLimitOfRequest call doesn't re-run the IP check.
        (request as any)[globalIpCheckedKey] = true;
        const key = this.getGlobalIpKey(this.getRequestIp(request));
        const expire = await this.getExpireAndIncreaseLimit(
            key,
            this.option.globalIpRateLimit,
            this.option.globalIpRateLimitTTL
        );
        if (expire > 0) {
            throw new TooManyRequestException();
        }
    }

    async checkGlobalCustomRequest(identity: string): Promise<void> {
        const key = this.getGlobalCustomKey(identity);
        const expire = await this.getExpireAndIncreaseLimit(
            key,
            this.option.globalCustomRateLimit,
            this.option.globalCustomRateLimitTTL
        );
        if (expire > 0) {
            throw new TooManyRequestException();
        }
    }

    async checkRouterRequest(
        routerDetail: RouterDetail,
        request: Request,
        rateLimit: RateLimit,
        identity: string
    ): Promise<void> {
        const key = this.getRouterKey(routerDetail, request, identity);

        let isAllowRequest: boolean;
        if (!rateLimit.status) {
            const expire = await this.getExpireAndIncreaseLimit(key, rateLimit.limit, rateLimit.ttl);
            isAllowRequest = expire === 0;
        } else {
            const countRequest = Number(await this.redis.get(key)) || 0;
            isAllowRequest = countRequest < rateLimit.limit;
        }

        if (!isAllowRequest) {
            throw new TooManyRequestException('error.too_many_requests_with_custom_ttl', {
                ttl: ttlToHumanReadable(rateLimit.ttl)
            });
        }
    }

    async increaseRouterLimit(routerDetail: RouterDetail, request: Request, response: Response): Promise<void> {
        if (!this.option.isEnable) {
            return;
        }

        const identity = (request as any)[resolvedIdentityKey] as ResolvedIdentity | undefined;
        if (identity === skipThrottle) {
            return;
        }
        const effectiveIdentity = identity ?? this.getRequestIp(request);

        for (const rateLimit of routerDetail.rateLimits) {
            if (rateLimit.status === response.statusCode) {
                const key = this.getRouterKey(routerDetail, request, effectiveIdentity);
                await this.getExpireAndIncreaseLimit(key, rateLimit.limit, rateLimit.ttl);
            }
        }
    }

    checkRouterHasCustomLimit(routerDetail: RouterDetail): boolean {
        if (!routerDetail?.rateLimits?.length) {
            return false;
        }
        return routerDetail.rateLimits.some((rateLimit) => rateLimit.status);
    }

    getRouterKey(routerDetail: RouterDetail, request: Request, identity: string): string {
        return `${RATE_LIMIT_KEY}-${identity}-${request.method}-${routerDetail.routerPath}`;
    }

    getGlobalIpKey(ip: string): string {
        return `${RATE_LIMIT_KEY}-ip-${ip}`;
    }

    /**
     * The client address used for every IP-based key, normalised so equivalent addresses share a
     * bucket (IPv4-mapped prefix stripped, IPv6 masked to `ipv6Subnet`). `request.ip` is undefined
     * when Express cannot resolve a remote address; those all share one `unknown` bucket.
     */
    getRequestIp(request: Request): string {
        const ip = request.ip ?? request.socket?.remoteAddress;
        return ip ? normalizeIp(ip, this.ipv6Subnet) : 'unknown';
    }

    getGlobalCustomKey(identity: string): string {
        return `${RATE_LIMIT_KEY}-custom-${identity}`;
    }

    private async resolveIdentity(routerDetail: RouterDetail, request: Request): Promise<ResolvedRequest> {
        const ip = this.getRequestIp(request);
        if (!this.option.keyResolver) {
            return { identity: ip, authenticated: false };
        }

        const raw: ThrottlerKeyResolverResult = await this.option.keyResolver({ request, routerDetail, ip });

        let key: unknown = raw;
        let authenticated = false;
        if (raw !== null && typeof raw === 'object') {
            key = raw.key;
            if (raw.authenticated !== undefined && typeof raw.authenticated !== 'boolean') {
                throw new Error(
                    `ThrottlerOption.keyResolver: 'authenticated' must be a boolean when set. Received: ${typeof raw.authenticated}`
                );
            }
            authenticated = raw.authenticated === true;
        }

        if (isEmptyKey(key)) {
            return { identity: skipThrottle, authenticated };
        }

        if (typeof key !== 'string') {
            throw new Error(
                'ThrottlerOption.keyResolver must return a string, null, undefined, or { key, authenticated }. ' +
                    `Received key of type: ${typeof key}`
            );
        }

        return { identity: key, authenticated };
    }
}
