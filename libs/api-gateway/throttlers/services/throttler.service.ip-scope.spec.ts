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

describe('ThrottlerService global IP rate-limit scope', () => {
    describe("globalIpRateLimitScope: 'anonymous'", () => {
        // Mirrors the consumer: authenticated requests resolve to a user identity, the rest to the IP.
        const userOrIpResolver: ThrottlerOption['keyResolver'] = ({ request, ip }) => {
            const userId = request.headers['auth-user-id'];
            return typeof userId === 'string' ? { key: `user:${userId}`, authenticated: true } : `ip:${ip}`;
        };

        it('does not count authenticated requests from a shared IP against the IP bucket', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 3,
                    globalIpRateLimitTTL: 60,
                    globalCustomRateLimit: 5,
                    globalCustomRateLimitTTL: 60,
                    globalIpRateLimitScope: 'anonymous',
                    keyResolver: userOrIpResolver
                },
                redis
            );

            // 20 colleagues behind one NAT address, 5 requests each: far above the IP limit of 3.
            for (let user = 0; user < 20; user++) {
                for (let i = 0; i < 5; i++) {
                    await expect(
                        service.checkLimitOfRequest(
                            routerDetail,
                            makeRequest({ ip: '198.51.100.1', headers: { 'auth-user-id': `u${user}` } })
                        )
                    ).resolves.toBeUndefined();
                }
            }

            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-198.51.100.1`)).toBeUndefined();
            // Each user is still bounded by their own custom bucket.
            await expect(
                service.checkLimitOfRequest(
                    routerDetail,
                    makeRequest({ ip: '198.51.100.1', headers: { 'auth-user-id': 'u0' } })
                )
            ).rejects.toBeInstanceOf(TooManyRequestException);
        });

        it('still applies the IP bucket to anonymous requests, independently of authenticated ones', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 2,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    globalIpRateLimitScope: 'anonymous',
                    keyResolver: userOrIpResolver
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '198.51.100.1' }));
            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '198.51.100.1' }));
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '198.51.100.1' }))
            ).rejects.toBeInstanceOf(TooManyRequestException);

            // An authenticated colleague on the same IP is unaffected by the exhausted IP bucket.
            await expect(
                service.checkLimitOfRequest(
                    routerDetail,
                    makeRequest({ ip: '198.51.100.1', headers: { 'auth-user-id': 'u1' } })
                )
            ).resolves.toBeUndefined();
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-198.51.100.1`)).toBe(2);
        });

        it('treats a plain string resolver result as anonymous (backward compatible)', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 1,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    globalIpRateLimitScope: 'anonymous',
                    keyResolver: ({ request }) => `user:${request.headers['auth-user-id']}`
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ headers: { 'auth-user-id': 'a' } }));
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ headers: { 'auth-user-id': 'b' } }))
            ).rejects.toBeInstanceOf(TooManyRequestException);
        });

        it('treats every request as anonymous when no keyResolver is configured', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 1,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    globalIpRateLimitScope: 'anonymous'
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest());
            await expect(service.checkLimitOfRequest(routerDetail, makeRequest())).rejects.toBeInstanceOf(
                TooManyRequestException
            );
        });

        it('applies the IP bucket to skipped anonymous requests but not to skipped authenticated ones', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 1,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    globalIpRateLimitScope: 'anonymous',
                    keyResolver: ({ request }) => ({
                        key: null,
                        authenticated: typeof request.headers['auth-user-id'] === 'string'
                    })
                },
                redis
            );

            for (let i = 0; i < 5; i++) {
                await service.checkLimitOfRequest(routerDetail, makeRequest({ headers: { 'auth-user-id': 'a' } }));
            }
            await service.checkLimitOfRequest(routerDetail, makeRequest());
            await expect(service.checkLimitOfRequest(routerDetail, makeRequest())).rejects.toBeInstanceOf(
                TooManyRequestException
            );
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-10.0.0.1`)).toBe(1);
        });

        it('checkGlobalIpRequestBeforeAuth defers to checkLimitOfRequest instead of counting', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 1,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    globalIpRateLimitScope: 'anonymous',
                    keyResolver: userOrIpResolver
                },
                redis
            );

            const authenticated = makeRequest({ headers: { 'auth-user-id': 'u1' } });
            await service.checkGlobalIpRequestBeforeAuth(authenticated);
            await service.checkLimitOfRequest(routerDetail, authenticated);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-10.0.0.1`)).toBeUndefined();

            // An anonymous request is counted exactly once across both calls.
            const anonymous = makeRequest();
            await service.checkGlobalIpRequestBeforeAuth(anonymous);
            await service.checkLimitOfRequest(routerDetail, anonymous);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-10.0.0.1`)).toBe(1);
        });

        it('checkGlobalIpRequestOnAuthFailure counts requests rejected by the proxy middlewares', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 2,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    globalIpRateLimitScope: 'anonymous',
                    keyResolver: userOrIpResolver
                },
                redis
            );

            for (let i = 0; i < 2; i++) {
                const request = makeRequest();
                await service.checkGlobalIpRequestBeforeAuth(request);
                await service.checkGlobalIpRequestOnAuthFailure(request);
            }
            const request = makeRequest();
            await service.checkGlobalIpRequestBeforeAuth(request);
            await expect(service.checkGlobalIpRequestOnAuthFailure(request)).rejects.toBeInstanceOf(
                TooManyRequestException
            );
        });
    });

    describe("globalIpRateLimitScope: 'all' (default)", () => {
        it('counts authenticated requests against the IP bucket, as before', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 1,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    keyResolver: ({ request }) => ({
                        key: `user:${request.headers['auth-user-id']}`,
                        authenticated: true
                    })
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ headers: { 'auth-user-id': 'a' } }));
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ headers: { 'auth-user-id': 'b' } }))
            ).rejects.toBeInstanceOf(TooManyRequestException);
        });

        it('checkGlobalIpRequestOnAuthFailure does not double-count a request already checked before auth', async () => {
            const redis = createRedisMock();
            const service = await bootService({ isEnable: true, ...HIGH_IP_LIMIT, ...HIGH_CUSTOM_LIMIT }, redis);

            const request = makeRequest();
            await service.checkGlobalIpRequestBeforeAuth(request);
            await service.checkGlobalIpRequestOnAuthFailure(request);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-10.0.0.1`)).toBe(1);
        });
    });

    describe('keyResolver object result', () => {
        it('uses the object key for the custom and per-route buckets', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    ...HIGH_IP_LIMIT,
                    ...HIGH_CUSTOM_LIMIT,
                    keyResolver: () => ({ key: 'user:42', authenticated: true })
                },
                redis
            );
            const statusRouter: RouterDetail = { ...routerDetail, rateLimits: [{ limit: 1, ttl: 60, status: 401 }] };

            const request = makeRequest();
            await service.checkLimitOfRequest(statusRouter, request);
            await service.increaseRouterLimit(statusRouter, request, { statusCode: 401 } as Response);

            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-user:42`)).toBe(1);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-user:42-GET-/things`)).toBe(1);
        });

        it.each([
            ['a non-string key', { key: 42 }],
            ['a non-boolean authenticated flag', { key: 'user:1', authenticated: 'yes' }]
        ])('rejects %s', async (_label, result) => {
            const service = await bootService(
                { isEnable: true, ...HIGH_IP_LIMIT, ...HIGH_CUSTOM_LIMIT, keyResolver: () => result as any },
                createRedisMock()
            );
            await expect(service.checkLimitOfRequest(routerDetail, makeRequest())).rejects.toThrow(/keyResolver/);
        });

        it('passes the normalised client IP to the resolver', async () => {
            const resolver = vi.fn().mockReturnValue('k');
            const service = await bootService(
                { isEnable: true, ...HIGH_IP_LIMIT, ...HIGH_CUSTOM_LIMIT, keyResolver: resolver },
                createRedisMock()
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '::ffff:203.0.113.7' }));
            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '2001:db8:1:2::99' }));

            expect(resolver.mock.calls[0][0].ip).toBe('203.0.113.7');
            expect(resolver.mock.calls[1][0].ip).toBe('2001:db8:1:2:0:0:0:0/64');
        });
    });
});
