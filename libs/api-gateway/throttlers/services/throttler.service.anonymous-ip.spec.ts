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

describe('ThrottlerService anonymous IP rate limit', () => {
    // Mirrors the consumer: authenticated requests resolve to a user identity, the rest to the IP.
    const userOrIpResolver: ThrottlerOption['keyResolver'] = ({ request, ip }) => {
        const userId = request.headers['auth-user-id'];
        return typeof userId === 'string' ? { key: `user:${userId}`, authenticated: true } : `ip:${ip}`;
    };
    const SHARED_IP = '198.51.100.1';
    const anonymous = (overrides: Partial<Request> = {}): Request => makeRequest({ ip: SHARED_IP, ...overrides });
    const user = (id: string): Request => makeRequest({ ip: SHARED_IP, headers: { 'auth-user-id': id } });

    describe('both buckets configured (all-traffic + anonymous)', () => {
        const option: ThrottlerOption = {
            isEnable: true,
            globalIpRateLimit: 10,
            globalIpRateLimitTTL: 60,
            ...HIGH_CUSTOM_LIMIT,
            anonymousIpRateLimit: 3,
            anonymousIpRateLimitTTL: 60,
            keyResolver: userOrIpResolver
        };

        it('caps anonymous requests at the anonymous limit while authenticated users on the same IP continue', async () => {
            const redis = createRedisMock();
            const service = await bootService(option, redis);

            for (let i = 0; i < 3; i++) {
                await service.checkLimitOfRequest(routerDetail, anonymous());
            }
            await expect(service.checkLimitOfRequest(routerDetail, anonymous())).rejects.toBeInstanceOf(
                TooManyRequestException
            );
            await expect(service.checkLimitOfRequest(routerDetail, user('u1'))).resolves.toBeUndefined();

            expect(redis.counts.get(`${RATE_LIMIT_KEY}-anonymous-ip-${SHARED_IP}`)).toBe(3);
            // The rejected 4th anonymous request and the authenticated one both counted in the all-traffic bucket.
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-${SHARED_IP}`)).toBe(5);
        });

        it('still caps all traffic from one IP, authenticated included, at the all-traffic limit', async () => {
            const redis = createRedisMock();
            const service = await bootService(option, redis);

            for (let i = 0; i < 10; i++) {
                await service.checkLimitOfRequest(routerDetail, user(`u${i}`));
            }
            await expect(service.checkLimitOfRequest(routerDetail, user('u99'))).rejects.toBeInstanceOf(
                TooManyRequestException
            );
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-anonymous-ip-${SHARED_IP}`)).toBeUndefined();
        });

        it('counts each request once per bucket when the proxy already ran the all-traffic check', async () => {
            const redis = createRedisMock();
            const service = await bootService(option, redis);

            const request = anonymous();
            await service.checkGlobalIpRequest(request);
            await service.checkLimitOfRequest(routerDetail, request);
            await service.checkAnonymousIpRequest(request);

            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-${SHARED_IP}`)).toBe(1);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-anonymous-ip-${SHARED_IP}`)).toBe(1);
        });

        it('checkAnonymousIpRequest caps requests rejected by the proxy middlewares', async () => {
            const service = await bootService(option, createRedisMock());

            for (let i = 0; i < 3; i++) {
                await service.checkAnonymousIpRequest(user('forged'));
            }
            await expect(service.checkAnonymousIpRequest(user('forged'))).rejects.toBeInstanceOf(
                TooManyRequestException
            );
        });
    });

    describe('which requests count as anonymous', () => {
        const option: ThrottlerOption = {
            isEnable: true,
            ...HIGH_IP_LIMIT,
            ...HIGH_CUSTOM_LIMIT,
            anonymousIpRateLimit: 1,
            anonymousIpRateLimitTTL: 60
        };

        it('treats a plain string resolver result as anonymous (backward compatible)', async () => {
            const service = await bootService(
                { ...option, keyResolver: ({ request }) => `user:${request.headers['auth-user-id']}` },
                createRedisMock()
            );

            await service.checkLimitOfRequest(routerDetail, user('a'));
            await expect(service.checkLimitOfRequest(routerDetail, user('b'))).rejects.toBeInstanceOf(
                TooManyRequestException
            );
        });

        it('treats every request as anonymous when no keyResolver is configured', async () => {
            const service = await bootService(option, createRedisMock());

            await service.checkLimitOfRequest(routerDetail, anonymous());
            await expect(service.checkLimitOfRequest(routerDetail, anonymous())).rejects.toBeInstanceOf(
                TooManyRequestException
            );
        });

        it('applies to skipped anonymous requests but not to skipped authenticated ones', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    ...option,
                    keyResolver: ({ request }) => ({
                        key: null,
                        authenticated: typeof request.headers['auth-user-id'] === 'string'
                    })
                },
                redis
            );

            for (let i = 0; i < 5; i++) {
                await service.checkLimitOfRequest(routerDetail, user('a'));
            }
            await service.checkLimitOfRequest(routerDetail, anonymous());
            await expect(service.checkLimitOfRequest(routerDetail, anonymous())).rejects.toBeInstanceOf(
                TooManyRequestException
            );
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-anonymous-ip-${SHARED_IP}`)).toBe(1);
        });
    });

    describe('anonymous bucket not configured (default)', () => {
        it('behaves exactly as before: only the all-traffic bucket is used', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 1,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    keyResolver: userOrIpResolver
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, user('a'));
            await expect(service.checkLimitOfRequest(routerDetail, user('b'))).rejects.toBeInstanceOf(
                TooManyRequestException
            );
            await service.checkAnonymousIpRequest(anonymous());
            expect([...redis.counts.keys()].some((key) => key.includes('anonymous-ip'))).toBe(false);
        });

        it('checkAnonymousIpRequest is a no-op when throttling is disabled', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: false,
                    ...HIGH_IP_LIMIT,
                    ...HIGH_CUSTOM_LIMIT,
                    anonymousIpRateLimit: 1,
                    anonymousIpRateLimitTTL: 60
                },
                redis
            );

            await service.checkAnonymousIpRequest(anonymous());
            await service.checkAnonymousIpRequest(anonymous());
            expect(redis.evalsha).not.toHaveBeenCalled();
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
