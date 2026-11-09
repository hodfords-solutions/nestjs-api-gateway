import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { ThrottlerService } from './throttler.service.js';
import { THROTTLER_OPTION, RATE_LIMIT_KEY } from '../constants/rate-limit.constant.js';
import { REDIS_OPTION } from '../../redis/constants/redis.constant.js';
import { TooManyRequestException } from '../exceptions/too-many-request.exception.js';
import { ThrottlerOption } from '../types/throttler-option.type.js';
import { RouterDetail } from '../../restful/types/router-path.type.js';

type RedisMock = {
    counts: Map<string, number>;
    script: Mock;
    evalsha: Mock;
    get: Mock;
    on: Mock;
};

function createRedisMock(): RedisMock {
    const counts = new Map<string, number>();
    return {
        counts,
        script: vi.fn().mockResolvedValue('fake-lua-sha'),
        evalsha: vi.fn(async (_sha: string, _keyCount: number, key: string, limitStr: string, _ttlMs: string) => {
            const limit = Number(limitStr);
            const current = counts.get(key) ?? 0;
            if (current >= limit) {
                return 1;
            }
            counts.set(key, current + 1);
            return 0;
        }),
        get: vi.fn(async (key: string) => {
            const v = counts.get(key);
            return v === undefined ? null : String(v);
        }),
        on: vi.fn()
    };
}

function makeRequest(overrides: Partial<Request> = {}): Request {
    return {
        ip: '10.0.0.1',
        method: 'GET',
        url: '/things',
        headers: {},
        ...overrides
    } as unknown as Request;
}

const routerDetail: RouterDetail = {
    operationId: 'ThingsController_index',
    description: '',
    path: '/things',
    isBearerAuth: false,
    isApiKeyAuth: false,
    routerPath: '/things',
    pathMatch: null,
    rateLimits: []
};

// Sensible defaults so individual tests can focus on one limit at a time.
const HIGH_IP_LIMIT = { globalIpRateLimit: 1_000_000, globalIpRateLimitTTL: 60 } as const;
const HIGH_CUSTOM_LIMIT = { globalCustomRateLimit: 1_000_000, globalCustomRateLimitTTL: 60 } as const;

async function bootService(option: ThrottlerOption, redis: RedisMock): Promise<ThrottlerService> {
    const moduleRef = await Test.createTestingModule({
        providers: [
            ThrottlerService,
            { provide: THROTTLER_OPTION, useValue: option },
            { provide: REDIS_OPTION, useValue: redis as any }
        ]
    }).compile();

    const service = moduleRef.get(ThrottlerService);
    await service.loadLuaScript();
    return service;
}

describe('ThrottlerService IP normalisation', () => {
    describe('IP normalisation in IP-based keys', () => {
        it('shares one global IP bucket across a /64 and strips the IPv4-mapped prefix', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                { isEnable: true, globalIpRateLimit: 2, globalIpRateLimitTTL: 60, ...HIGH_CUSTOM_LIMIT },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '2001:db8:1:2::1' }));
            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '2001:db8:1:2::2' }));
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '2001:db8:1:2:dead:beef:0:1' }))
            ).rejects.toBeInstanceOf(TooManyRequestException);
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '2001:db8:1:3::1' }))
            ).resolves.toBeUndefined();

            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '::ffff:203.0.113.7' }));
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-2001:db8:1:2:0:0:0:0/64`)).toBe(2);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-203.0.113.7`)).toBe(1);
        });

        it('normalises the IP fallback identity used by the custom and per-route buckets', async () => {
            const redis = createRedisMock();
            const service = await bootService({ isEnable: true, ...HIGH_IP_LIMIT, ...HIGH_CUSTOM_LIMIT }, redis);
            const statusRouter: RouterDetail = { ...routerDetail, rateLimits: [{ limit: 5, ttl: 60, status: 401 }] };

            const request = makeRequest({ ip: '2001:db8:1:2::abcd' });
            await service.checkLimitOfRequest(statusRouter, request);
            await service.increaseRouterLimit(statusRouter, request, { statusCode: 401 } as Response);

            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-2001:db8:1:2:0:0:0:0/64`)).toBe(1);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-2001:db8:1:2:0:0:0:0/64-GET-/things`)).toBe(1);
        });

        it('normalises the IP fallback in increaseRouterLimit when checkLimitOfRequest never ran', async () => {
            const redis = createRedisMock();
            const service = await bootService({ isEnable: true, ...HIGH_IP_LIMIT, ...HIGH_CUSTOM_LIMIT }, redis);
            const statusRouter: RouterDetail = { ...routerDetail, rateLimits: [{ limit: 5, ttl: 60, status: 401 }] };

            await service.increaseRouterLimit(statusRouter, makeRequest({ ip: '::ffff:10.0.0.9' }), {
                statusCode: 401
            } as Response);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-10.0.0.9-GET-/things`)).toBe(1);
        });

        it('honours a custom ipv6Subnet', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                { isEnable: true, ...HIGH_IP_LIMIT, ...HIGH_CUSTOM_LIMIT, ipv6Subnet: 128 },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '2001:db8:1:2::1' }));
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-2001:db8:1:2:0:0:0:1/128`)).toBe(1);
        });
    });

    describe('option validation', () => {
        it.each([
            [
                'an unknown globalIpRateLimitScope',
                { globalIpRateLimitScope: 'authenticated' },
                /globalIpRateLimitScope/
            ],
            ['an out-of-range ipv6Subnet', { ipv6Subnet: 0 }, /ipv6Subnet/]
        ])('throws on %s', async (_label, extra, message) => {
            await expect(
                bootService(
                    { isEnable: true, ...HIGH_IP_LIMIT, ...HIGH_CUSTOM_LIMIT, ...(extra as any) },
                    createRedisMock()
                )
            ).rejects.toThrow(message);
        });
    });
});
