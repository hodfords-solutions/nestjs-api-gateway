import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { ThrottlerService } from './throttler.service';
import { THROTTLER_OPTION, RATE_LIMIT_KEY } from '../constants/rate-limit.constant';
import { REDIS_OPTION } from '../../redis/constants/redis.constant';
import { TooManyRequestException } from '../exceptions/too-many-request.exception';
import { ThrottlerOption } from '../types/throttler-option.type';
import { RouterDetail } from '../../restful/types/router-path.type';

type RedisMock = {
    counts: Map<string, number>;
    script: jest.Mock;
    evalsha: jest.Mock;
    get: jest.Mock;
    on: jest.Mock;
};

function createRedisMock(): RedisMock {
    const counts = new Map<string, number>();
    return {
        counts,
        script: jest.fn().mockResolvedValue('fake-lua-sha'),
        evalsha: jest.fn(async (_sha: string, _keyCount: number, key: string, limitStr: string, _ttlMs: string) => {
            const limit = Number(limitStr);
            const current = counts.get(key) ?? 0;
            if (current >= limit) {
                return 1;
            }
            counts.set(key, current + 1);
            return 0;
        }),
        get: jest.fn(async (key: string) => {
            const v = counts.get(key);
            return v === undefined ? null : String(v);
        }),
        on: jest.fn()
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

describe('ThrottlerService keyResolver', () => {
    describe('custom keyResolver — non-empty return', () => {
        it('buckets by the resolved identity (same identity shares a bucket; different identities are independent)', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    ...HIGH_IP_LIMIT,
                    globalCustomRateLimit: 3,
                    globalCustomRateLimitTTL: 60,
                    keyResolver: ({ request }) => {
                        const userId = request.headers['auth-user-id'];
                        return typeof userId === 'string' ? `user:${userId}` : `ip:${request.ip}`;
                    }
                },
                redis
            );

            const userA = makeRequest({ headers: { 'auth-user-id': '42' } });
            const userB = makeRequest({ headers: { 'auth-user-id': '99' } });

            for (let i = 0; i < 3; i++) {
                await service.checkLimitOfRequest(routerDetail, makeRequest({ headers: { 'auth-user-id': '42' } }));
            }
            await expect(service.checkLimitOfRequest(routerDetail, userA)).rejects.toBeInstanceOf(
                TooManyRequestException
            );

            await expect(service.checkLimitOfRequest(routerDetail, userB)).resolves.toBeUndefined();

            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-user:42`)).toBe(3);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-user:99`)).toBe(1);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-ip:10.0.0.1`)).toBeUndefined();
        });

        it('awaits async resolvers', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    ...HIGH_IP_LIMIT,
                    globalCustomRateLimit: 1,
                    globalCustomRateLimitTTL: 60,
                    keyResolver: async ({ request }) => {
                        await new Promise((r) => setImmediate(r));
                        return `tenant:${request.headers['x-tenant']}`;
                    }
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ headers: { 'x-tenant': 'acme' } }));
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ headers: { 'x-tenant': 'acme' } }))
            ).rejects.toBeInstanceOf(TooManyRequestException);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-tenant:acme`)).toBe(1);
        });

        it('propagates resolver errors instead of silently allowing or denying the custom limit', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    ...HIGH_IP_LIMIT,
                    globalCustomRateLimit: 10,
                    globalCustomRateLimitTTL: 60,
                    keyResolver: () => {
                        throw new Error('resolver-boom');
                    }
                },
                redis
            );

            await expect(service.checkLimitOfRequest(routerDetail, makeRequest())).rejects.toThrow('resolver-boom');
            // IP limit ran (one evalsha) before resolver threw; custom limit must not have been touched.
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-10.0.0.1`)).toBeUndefined();
        });
    });

    describe('skip-on-empty', () => {
        it.each([
            ['null', () => null],
            ['undefined', () => undefined],
            ['empty string', () => ''],
            ['whitespace-only', () => '   ']
        ])('skips custom + per-router throttling when resolver returns %s', async (_label, resolver) => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    ...HIGH_IP_LIMIT,
                    globalCustomRateLimit: 1,
                    globalCustomRateLimitTTL: 60,
                    keyResolver: resolver as any
                },
                redis
            );

            for (let i = 0; i < 50; i++) {
                await expect(service.checkLimitOfRequest(routerDetail, makeRequest())).resolves.toBeUndefined();
            }
            // No custom bucket ever opened.
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-10.0.0.1`)).toBeUndefined();
        });

        it('exempt requests do not consume the custom bucket used by non-exempt requests', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    ...HIGH_IP_LIMIT,
                    globalCustomRateLimit: 3,
                    globalCustomRateLimitTTL: 60,
                    keyResolver: ({ request }) => {
                        if (request.url === '/health') return null;
                        return `ip:${request.ip}`;
                    }
                },
                redis
            );

            for (let i = 0; i < 20; i++) {
                await service.checkLimitOfRequest(routerDetail, makeRequest({ url: '/health' }));
            }
            for (let i = 0; i < 3; i++) {
                await service.checkLimitOfRequest(routerDetail, makeRequest({ url: '/things' }));
            }
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ url: '/things' }))
            ).rejects.toBeInstanceOf(TooManyRequestException);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-ip:10.0.0.1`)).toBe(3);
        });

        it('skips per-router status-based counter increments in increaseRouterLimit', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    ...HIGH_IP_LIMIT,
                    ...HIGH_CUSTOM_LIMIT,
                    keyResolver: () => null
                },
                redis
            );

            const routerWithStatus: RouterDetail = {
                ...routerDetail,
                rateLimits: [{ limit: 1, ttl: 60, status: 401 }]
            };

            const request = makeRequest();
            await service.checkLimitOfRequest(routerWithStatus, request);

            redis.evalsha.mockClear();
            await service.increaseRouterLimit(routerWithStatus, request, { statusCode: 401 } as Response);
            expect(redis.evalsha).not.toHaveBeenCalled();
        });
    });

    describe('global IP rate limit', () => {
        it('always applies based on request.ip, even when keyResolver returns null (skip)', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 2,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    keyResolver: () => null
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '5.5.5.5' }));
            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '5.5.5.5' }));
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '5.5.5.5' }))
            ).rejects.toBeInstanceOf(TooManyRequestException);

            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-5.5.5.5`)).toBe(2);
            // skip-on-empty still applies to the custom bucket.
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-5.5.5.5`)).toBeUndefined();
        });

        it('uses request.ip regardless of what keyResolver returns', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    globalIpRateLimit: 5,
                    globalIpRateLimitTTL: 60,
                    ...HIGH_CUSTOM_LIMIT,
                    keyResolver: ({ request }) => `user:${request.headers['auth-user-id']}`
                },
                redis
            );

            await service.checkLimitOfRequest(
                routerDetail,
                makeRequest({ ip: '7.7.7.7', headers: { 'auth-user-id': 'a' } })
            );
            await service.checkLimitOfRequest(
                routerDetail,
                makeRequest({ ip: '7.7.7.7', headers: { 'auth-user-id': 'b' } })
            );

            // Both bumped the IP bucket, despite different resolved identities.
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-7.7.7.7`)).toBe(2);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-user:a`)).toBe(1);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-user:b`)).toBe(1);
        });
    });

    describe('no keyResolver configured — backwards compatibility', () => {
        it('falls back to request.ip for the custom bucket (in addition to the IP bucket)', async () => {
            const redis = createRedisMock();
            const service = await bootService(
                {
                    isEnable: true,
                    ...HIGH_IP_LIMIT,
                    globalCustomRateLimit: 2,
                    globalCustomRateLimitTTL: 60
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '1.2.3.4' }));
            await service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '1.2.3.4' }));
            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '1.2.3.4' }))
            ).rejects.toBeInstanceOf(TooManyRequestException);

            await expect(
                service.checkLimitOfRequest(routerDetail, makeRequest({ ip: '9.9.9.9' }))
            ).resolves.toBeUndefined();

            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-1.2.3.4`)).toBe(2);
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-custom-9.9.9.9`)).toBe(1);
            // IP check runs before the custom check, so the rejected 3rd request still bumped the IP bucket.
            expect(redis.counts.get(`${RATE_LIMIT_KEY}-ip-1.2.3.4`)).toBe(3);
        });

        it('short-circuits when isEnable is false (neither limit is touched)', async () => {
            const redis = createRedisMock();
            const resolver = jest.fn();
            const service = await bootService(
                {
                    isEnable: false,
                    globalIpRateLimit: 1,
                    globalIpRateLimitTTL: 60,
                    globalCustomRateLimit: 1,
                    globalCustomRateLimitTTL: 60,
                    keyResolver: resolver
                },
                redis
            );

            await service.checkLimitOfRequest(routerDetail, makeRequest());
            await service.checkLimitOfRequest(routerDetail, makeRequest());
            expect(resolver).not.toHaveBeenCalled();
            expect(redis.evalsha).not.toHaveBeenCalled();
        });
    });
});
