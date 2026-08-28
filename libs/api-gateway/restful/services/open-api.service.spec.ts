import { describe, it, expect, vi } from 'vitest';
// camelcase-keys is replaced with a minimal camelizer so x-extension keys behave like in production.
vi.mock('camelcase-keys', () => ({
    __esModule: true,
    default: (object: Record<string, unknown>) => {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(object)) {
            result[key.replace(/[-_](\w)/g, (_, char: string) => char.toUpperCase())] = object[key];
        }
        return result;
    }
}));

import { of } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { OpenApiService } from './open-api.service.js';
import { ApiGatewayOption } from '../../types/api-gateway-option.type.js';

const sampleDoc = {
    info: { title: 'User Service', version: '1.0.0' },
    paths: {
        '/users/{id}': {
            get: {
                operationId: 'UserController_show',
                description: 'Get a user',
                parameters: [],
                responses: {},
                security: [{ bearer: [] }]
            },
            delete: {
                operationId: 'UserController_delete',
                'x-rate-limits': [{ limit: 5, ttl: 60 }],
                security: [{ 'auth-jwt': [] }]
            }
        },
        '/health': {
            get: {
                operationId: 'HealthController_check',
                'x-router-path': '/healthz'
            }
        }
    }
};

function createService(optionOverrides: Partial<ApiGatewayOption> = {}): {
    service: OpenApiService;
    httpGet: Mock;
} {
    const httpGet = vi.fn();
    const option = {
        openApiSecurityKeys: ['auth-jwt'],
        openApiSecurityApiKeys: ['api-key'],
        excludeHeaders: [],
        apiServices: [],
        ...optionOverrides
    };
    const service = new OpenApiService({ get: httpGet } as unknown as HttpService, option as ApiGatewayOption);
    return { service, httpGet };
}

describe('OpenApiService.convertToExpressPath', () => {
    it('converts swagger params to express params', () => {
        const { service } = createService();
        expect(service.convertToExpressPath('/users/{id}/posts/{postId}')).toBe('/users/:id/posts/:postId');
    });

    it('leaves paths without params unchanged', () => {
        const { service } = createService();
        expect(service.convertToExpressPath('/users')).toBe('/users');
    });
});

describe('OpenApiService.getEndpointDetail', () => {
    it('builds router entries per method with matchers and metadata', () => {
        const { service } = createService();
        const endpoint = service.getEndpointDetail('http://users/doc', sampleDoc as never);

        expect(endpoint.title).toBe('User Service');
        expect(endpoint.version).toBe('1.0.0');
        expect(endpoint.docUrl).toBe('http://users/doc');
        expect(endpoint.router.get).toHaveLength(2);
        expect(endpoint.router.delete).toHaveLength(1);
        expect(endpoint.router.post).toHaveLength(0);

        const show = endpoint.router.get.find((r) => r.operationId === 'UserController_show');
        expect(show.routerPath).toBe('/users/:id');
        expect(show.isBearerAuth).toBe(true);
        expect(show.pathMatch('/users/42')).toBeTruthy();
        expect(show.pathMatch('/users')).toBe(false);
    });

    it('honors the x-router-path override', () => {
        const { service } = createService();
        const endpoint = service.getEndpointDetail('http://users/doc', sampleDoc as never);
        const health = endpoint.router.get.find((r) => r.operationId === 'HealthController_check');
        expect(health.routerPath).toBe('/healthz');
        expect(health.pathMatch('/healthz')).toBeTruthy();
    });

    it('extracts x-rate-limits into rateLimits', () => {
        const { service } = createService();
        const endpoint = service.getEndpointDetail('http://users/doc', sampleDoc as never);
        expect(endpoint.router.delete[0].rateLimits).toEqual([{ limit: 5, ttl: 60 }]);
    });
});

describe('OpenApiService.getRouterDetail', () => {
    it('finds the router matching the request path, ignoring the query string', () => {
        const { service } = createService();
        service.apiDocs['users'] = service.getEndpointDetail('http://users/doc', sampleDoc as never);

        const detail = service.getRouterDetail('users', 'GET', '/users/42?full=true');
        expect(detail.operationId).toBe('UserController_show');
    });

    it('returns undefined when no router matches', () => {
        const { service } = createService();
        service.apiDocs['users'] = service.getEndpointDetail('http://users/doc', sampleDoc as never);
        expect(service.getRouterDetail('users', 'POST', '/users/42')).toBeUndefined();
    });
});

describe('OpenApiService security detection', () => {
    it('detects the built-in bearer security scheme', () => {
        const { service } = createService();
        expect(service.checkRouterNeedBearerToken({ security: [{ bearer: [] }] })).toBe(true);
    });

    it('detects configured openApiSecurityKeys', () => {
        const { service } = createService();
        expect(service.checkRouterNeedBearerToken({ security: [{ 'auth-jwt': [] }] })).toBe(true);
    });

    it('returns false without a security section or with unknown schemes', () => {
        const { service } = createService();
        expect(service.checkRouterNeedBearerToken({})).toBe(false);
        expect(service.checkRouterNeedBearerToken({ security: [{ other: [] }] })).toBe(false);
    });

    it('detects configured api-key security schemes', () => {
        const { service } = createService();
        expect(service.checkRouterNeedApiKey({ security: [{ 'api-key': [] }] })).toBe(true);
        expect(service.checkRouterNeedApiKey({ security: [{ bearer: [] }] })).toBe(false);
        expect(service.checkRouterNeedApiKey({})).toBe(false);
    });

    it('returns false for api-key check when none are configured', () => {
        const { service } = createService({ openApiSecurityApiKeys: [] });
        expect(service.checkRouterNeedApiKey({ security: [{ 'api-key': [] }] })).toBe(false);
    });
});

describe('OpenApiService.getExtraDetails', () => {
    it('keeps unknown keys and drops parameters/responses/x-extensions handled elsewhere', () => {
        const { service } = createService();
        const extra = service.getExtraDetails({
            operationId: 'op',
            parameters: [],
            responses: {},
            xRateLimits: [],
            xRouterPath: '/x',
            xApiMcp: [{ description: 'tool' }]
        });
        expect(extra).toEqual({ operationId: 'op', xApiMcp: [{ description: 'tool' }] });
    });
});

describe('OpenApiService document mutation helpers', () => {
    it('removeSecuritySchemes deletes only auth-* schemes', () => {
        const { service } = createService();
        const schemes = { 'auth-jwt': {}, bearer: {}, 'api-key': {} };
        service.removeSecuritySchemes(schemes);
        expect(schemes).toEqual({ bearer: {}, 'api-key': {} });
    });

    it('changeSecurityOfPath swaps a scheme name in place', () => {
        const { service } = createService();
        const securities = [{ 'auth-jwt': ['scope'] }, { other: [] }];
        service.changeSecurityOfPath(securities, 'auth-jwt', 'bearer');
        expect(securities).toEqual([{ bearer: [] }, { other: [] }]);
    });

    it('removeHeader filters out excluded header parameters', () => {
        const { service } = createService({ excludeHeaders: ['auth-user-id'] });
        const document = {
            paths: {
                '/users': {
                    get: {
                        parameters: [
                            { in: 'header', name: 'Auth-User-Id' },
                            { in: 'header', name: 'x-keep' },
                            { in: 'query', name: 'auth-user-id' }
                        ]
                    }
                }
            }
        };
        service.removeHeader(document);
        expect(document.paths['/users'].get.parameters).toEqual([
            { in: 'header', name: 'x-keep' },
            { in: 'query', name: 'auth-user-id' }
        ]);
    });
});

describe('OpenApiService.getDocumentDetailsForUI', () => {
    it('lists every loaded document and the last one as default', () => {
        const { service } = createService();
        service.apiDocs['users'] = {} as never;
        service.apiDocs['orders'] = {} as never;

        const details = service.getDocumentDetailsForUI();
        expect(JSON.parse(details.details)).toEqual([
            { title: 'users', slug: 'users', url: 'document-json?type=users' },
            { title: 'orders', slug: 'orders', url: 'document-json?type=orders' }
        ]);
        expect(details.defaultDoc).toBe('orders');
        expect(details.scalarOptions).toBe('{}');
    });
});

describe('OpenApiService.getServiceDetail', () => {
    const apiService = { prefix: 'users', docUrl: 'http://users/doc', host: 'http://users' };

    it('loads and parses the document on success', async () => {
        const { service, httpGet } = createService();
        httpGet.mockReturnValue(of({ status: 200, data: sampleDoc }));

        await service.getServiceDetail(apiService as never);

        expect(service.originDocs['users']).toBe(sampleDoc);
        expect(service.apiDocs['users'].title).toBe('User Service');
    });

    it('skips re-parsing when the document is unchanged', async () => {
        const { service, httpGet } = createService();
        httpGet.mockReturnValue(of({ status: 200, data: sampleDoc }));
        const parseSpy = vi.spyOn(service, 'getEndpointDetail');

        await service.getServiceDetail(apiService as never);
        await service.getServiceDetail(apiService as never);

        expect(parseSpy).toHaveBeenCalledTimes(1);
    });

    it('re-parses when the document changes', async () => {
        const { service, httpGet } = createService();
        const parseSpy = vi.spyOn(service, 'getEndpointDetail');

        httpGet.mockReturnValue(of({ status: 200, data: sampleDoc }));
        await service.getServiceDetail(apiService as never);

        const changedDoc = { ...sampleDoc, info: { title: 'User Service', version: '2.0.0' } };
        httpGet.mockReturnValue(of({ status: 200, data: changedDoc }));
        await service.getServiceDetail(apiService as never);

        expect(parseSpy).toHaveBeenCalledTimes(2);
        expect(service.apiDocs['users'].version).toBe('2.0.0');
    });

    it('keeps existing docs when the fetch returns a non-200 status', async () => {
        const { service, httpGet } = createService();
        httpGet.mockReturnValue(of({ status: 503, data: null }));

        await service.getServiceDetail(apiService as never);
        expect(service.apiDocs['users']).toBeUndefined();
    });
});
