import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRedis } from '@songkeys/nestjs-redis';
import { Request, Response } from 'express';
import Redis from 'ioredis';
import { ttlToHumanReadable } from '../../restful/helpers/string.helper';
import { RateLimit, RouterDetail } from '../../restful/types/router-path.type';
import { LUA_INCREASE_AND_GET_SCRIPT } from '../constants/lua-script.constant';
import { RATE_LIMIT_KEY, THROTTLER_OPTION } from '../constants/rate-limit.constant';
import { TooManyRequestException } from '../exceptions/too-many-request.exception';
import { ThrottlerOption } from '../types/throttler-option.type';

@Injectable()
export class ThrottlerService implements OnModuleInit {
    private luaSha: string;

    constructor(
        @InjectRedis() private readonly redis: Redis,
        @Inject(THROTTLER_OPTION) private option: ThrottlerOption
    ) {}

    /**
     * Handle the loading of a Lua script into Redis and ensures it gets loaded when Redis is ready
     */
    async onModuleInit(): Promise<any> {
        await this.loadLuaScript();
        this.redis.on('ready', async () => {
            await this.loadLuaScript();
        });
    }

    /**
     * Load the script LUA_INCREASE_AND_GET_SCRIPT into Redis and store its SHA-1 hash for future use
     */
    async loadLuaScript(): Promise<void> {
        this.luaSha = (await this.redis.script('LOAD', LUA_INCREASE_AND_GET_SCRIPT)) as string;
    }

    /**
     * Execute the script LUA_INCREASE_AND_GET_SCRIPT in Redis using the SHA-1 hash of the script,
     * incrementing a counter of a key and managing its expiration time
     * @param {string} key The key saved in Redis contain a user's IP
     * @param {number} times The rate limit
     * @param {number} ttl The TTL of rate limit
     * @returns {number} Expired Time of the key
     */
    async getExpireAndIncreaseLimit(key: string, times: number, ttl: number): Promise<number> {
        return this.redis.evalsha(this.luaSha, 1, key, String(times), String(Math.floor(ttl * 1000))) as any;
    }

    /**
     * Enforce rate limits on incoming requests by first applying global limits
     * and then applying specific limits based on the router's configuration
     * @param {RouterDetail} routerDetail Detail of a router
     * @param {Request} request Incoming request
     */
    async checkLimitOfRequest(routerDetail: RouterDetail, request: Request): Promise<void> {
        if (!this.option.isEnable) {
            return;
        }
        await this.checkGlobalRequest(request);

        if (routerDetail?.rateLimits?.length) {
            for (const rateLimit of routerDetail.rateLimits) {
                await this.checkRouterRequest(routerDetail, request, rateLimit);
            }
        }
    }

    /**
     * Enforce global rate limiting on incoming requests,
     * checks if the request exceeds a global rate limit.
     * @param {Request} request Incoming request
     */
    async checkGlobalRequest(request: Request): Promise<void> {
        const key = this.getGlobalKey(request);
        const expire = await this.getExpireAndIncreaseLimit(
            key,
            this.option.globalRateLimit,
            this.option.globalRateLimitTTL
        );
        if (expire > 0) {
            throw new TooManyRequestException();
        }
    }

    /**
     * Handle rate limiting for specific routers or endpoints,
     * checks if a request exceeds the configured rate limit for a particular router
     * and throws an exception if the rate limit is exceeded.
     * @param {RouterDetail} routerDetail Detail of a router
     * @param {Request} request Incoming request
     * @param {RateLimit} rateLimit Configured Rate Limit of a request
     */
    async checkRouterRequest(routerDetail: RouterDetail, request: Request, rateLimit: RateLimit): Promise<void> {
        const key = this.getRouterKey(routerDetail, request);

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

    /**
     * Increase/update the rate limit counter for a specific router based on the response status code of the request,
     * ensures that only the rate limits associated with the actual response status code are updated
     * @param {RouterDetail} routerDetail Detail of a router
     * @param {Request} request Incoming request
     * @param {Response} response A response
     */
    async increaseRouterLimit(routerDetail: RouterDetail, request: Request, response: Response): Promise<void> {
        for (const rateLimit of routerDetail.rateLimits) {
            if (rateLimit.status === response.statusCode) {
                const key = this.getRouterKey(routerDetail, request);
                await this.getExpireAndIncreaseLimit(key, rateLimit.limit, rateLimit.ttl);
            }
        }
    }

    /**
     * Determine whether a specific router has any custom rate limits configured.
     * @param {RouterDetail} routerDetail Detail of a router
     * @returns {boolean} Return whether there is any rate limit configured.
     */
    checkRouterHasCustomLimit(routerDetail: RouterDetail): boolean {
        if (!routerDetail?.rateLimits?.length) {
            return false;
        }
        return routerDetail.rateLimits.some((rateLimit) => rateLimit.status);
    }

    /**
     * Generate a unique key for rate limiting based on various attributes of the request and router details.
     * The generated key is used to track rate limits in a Redis database,
     * ensures that rate limits are enforced per client IP, HTTP method, and route.
     * @param {RouterDetail} routerDetail Detail of a router
     * @param {Request} request Incoming request
     * @returns {string} Router key which will be saved in Redis
     */
    getRouterKey(routerDetail: RouterDetail, request: Request): string {
        return `${RATE_LIMIT_KEY}-${request.ip}-${request.method}-${routerDetail.routerPath}`;
    }

    /**
     * Generate a unique key for rate limiting that is based solely on the client's IP address.
     * @param {Request} request Incoming request
     * @returns {string} Global key which will be saved in Redis
     */
    getGlobalKey(request: Request): string {
        return `${RATE_LIMIT_KEY}-${request.ip}`;
    }
}
