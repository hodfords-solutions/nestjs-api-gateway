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
        evalsha: jest.fn(async (_sha: string, _keyCount: number, key: string, limitStr: string) => {
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
    return { ip: '10.0.0.1', method: 'GET', url: '/things', headers: {}, ...overrides } as unknown as Request;
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

// High global limits so these tests only exercise the per-router limit.
const baseOption: ThrottlerOption = {
    isEnable: true,
    globalIpRateLimit: 1_000_000,
    globalIpRateLimitTTL: 60,
    globalCustomRateLimit: 1_000_000,
    globalCustomRateLimitTTL: 60
};

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

describe('ThrottlerService per-router rate limits', () => {
    it('rejects once a non-status router limit is exhausted', async () => {
        const redis = createRedisMock();
        const service = await bootService(baseOption, redis);
        const limitedRouter: RouterDetail = { ...routerDetail, rateLimits: [{ limit: 2, ttl: 60 }] };

        await service.checkLimitOfRequest(limitedRouter, makeRequest());
        await service.checkLimitOfRequest(limitedRouter, makeRequest());
        await expect(service.checkLimitOfRequest(limitedRouter, makeRequest())).rejects.toBeInstanceOf(
            TooManyRequestException
        );
        expect(redis.counts.get(`${RATE_LIMIT_KEY}-10.0.0.1-GET-/things`)).toBe(2);
    });

    it('only checks (never increments) a status-scoped limit during checkLimitOfRequest', async () => {
        const redis = createRedisMock();
        const service = await bootService(baseOption, redis);
        const statusRouter: RouterDetail = { ...routerDetail, rateLimits: [{ limit: 2, ttl: 60, status: 401 }] };

        for (let i = 0; i < 10; i++) {
            await expect(service.checkLimitOfRequest(statusRouter, makeRequest())).resolves.toBeUndefined();
        }
        expect(redis.counts.get(`${RATE_LIMIT_KEY}-10.0.0.1-GET-/things`)).toBeUndefined();
    });

    it('increaseRouterLimit increments only when the response status matches', async () => {
        const redis = createRedisMock();
        const service = await bootService(baseOption, redis);
        const statusRouter: RouterDetail = { ...routerDetail, rateLimits: [{ limit: 2, ttl: 60, status: 401 }] };
        const key = `${RATE_LIMIT_KEY}-10.0.0.1-GET-/things`;

        const request = makeRequest();
        await service.checkLimitOfRequest(statusRouter, request);

        await service.increaseRouterLimit(statusRouter, request, { statusCode: 200 } as Response);
        expect(redis.counts.get(key)).toBeUndefined();

        await service.increaseRouterLimit(statusRouter, request, { statusCode: 401 } as Response);
        expect(redis.counts.get(key)).toBe(1);
    });

    it('a status-scoped limit blocks further requests after enough matching responses', async () => {
        const redis = createRedisMock();
        const service = await bootService(baseOption, redis);
        const statusRouter: RouterDetail = { ...routerDetail, rateLimits: [{ limit: 2, ttl: 60, status: 401 }] };

        for (let i = 0; i < 2; i++) {
            const request = makeRequest();
            await service.checkLimitOfRequest(statusRouter, request);
            await service.increaseRouterLimit(statusRouter, request, { statusCode: 401 } as Response);
        }
        await expect(service.checkLimitOfRequest(statusRouter, makeRequest())).rejects.toBeInstanceOf(
            TooManyRequestException
        );
    });

    it('checkRouterHasCustomLimit detects status-scoped limits only', async () => {
        const service = await bootService(baseOption, createRedisMock());

        expect(service.checkRouterHasCustomLimit(routerDetail)).toBe(false);
        expect(service.checkRouterHasCustomLimit({ ...routerDetail, rateLimits: [{ limit: 1, ttl: 1 }] })).toBe(false);
        expect(
            service.checkRouterHasCustomLimit({ ...routerDetail, rateLimits: [{ limit: 1, ttl: 1, status: 401 }] })
        ).toBe(true);
    });

    it('builds distinct keys per identity, method, router path and scope', async () => {
        const service = await bootService(baseOption, createRedisMock());

        expect(service.getRouterKey(routerDetail, makeRequest(), 'user:1')).toBe(
            `${RATE_LIMIT_KEY}-user:1-GET-/things`
        );
        expect(service.getGlobalIpKey('1.2.3.4')).toBe(`${RATE_LIMIT_KEY}-ip-1.2.3.4`);
        expect(service.getGlobalCustomKey('user:1')).toBe(`${RATE_LIMIT_KEY}-custom-user:1`);
    });
});
