import { describe, it, expect, vi, type Mock } from 'vitest';
// camelcase-keys (pulled in transitively via open-api.service) is unused on the code paths
// under test, so stub it out.
vi.mock('camelcase-keys', () => ({ __esModule: true, default: (value: unknown) => value }));

import { ForbiddenException, MethodNotAllowedException, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProxyService } from './proxy.service.js';
import { ApiServiceDetail } from '../types/api-service.type.js';
import { ProxyRequest } from '../models/proxy-request.model.js';

/**
 * These tests exercise the routing/forwarding logic directly (getServerName, removePath,
 * rewritePath, handleProxyResponse, registerDirectPrefixes) without running onModuleInit,
 * so no real ProxyServer/undici pools are created.
 */
function createService(optionOverrides: Record<string, unknown> = {}): {
    service: ProxyService;
    swaggerService: { apiDocs: Record<string, unknown>; getRouterDetail: Mock; getServiceDetail: Mock };
} {
    const swaggerService = {
        apiDocs: {} as Record<string, unknown>,
        getRouterDetail: vi.fn(),
        getServiceDetail: vi.fn()
    };
    const requestService = { isStaticRequest: vi.fn().mockReturnValue(false) };
    const wsRequestService = {};
    const throttlerService = {};
    const adapterHost = {};
    // A non-matching bypass list keeps isReqUrlInWhitelist() from falling back to the default
    // whitelist constants, so the redirect tests observe only the direct-prefix guard.
    const apiGatewayOption = { bypassRoutePrefixes: ['/___no_whitelist_match___'], ...optionOverrides };

    const service = new ProxyService(
        swaggerService as never,
        requestService as never,
        wsRequestService as never,
        throttlerService as never,
        adapterHost as never,
        apiGatewayOption as never
    );
    return { service, swaggerService };
}

function configure(
    service: ProxyService,
    config: { prefixServers?: string[]; directPrefixOwner?: Record<string, string> }
): void {
    if (config.prefixServers) {
        (service as never as { prefixServers: string[] }).prefixServers = config.prefixServers;
    }
    if (config.directPrefixOwner) {
        const owner = config.directPrefixOwner;
        (service as never as { directPrefixOwner: Record<string, string> }).directPrefixOwner = owner;
        (service as never as { directPrefixServers: string[] }).directPrefixServers = Object.keys(owner);
    }
}

const asInternal = (
    service: ProxyService
): {
    removePath(prefix: string, url: string): string;
    rewritePath(request: Request, prefix: string): string;
    registerDirectPrefixes(apiService: ApiServiceDetail): void;
    isDirectPrefixRequest(url: string): boolean;
    directPrefixServers: string[];
    directPrefixOwner: Record<string, string>;
} => service as never;

describe('ProxyService routing', () => {
    describe('getServerName (US1)', () => {
        it('routes a direct-prefix request to its owning service (R1/R2)', () => {
            const { service, swaggerService } = createService();
            configure(service, {
                prefixServers: ['user-services'],
                directPrefixOwner: { oauth: 'user-services', oidc: 'user-services' }
            });
            swaggerService.apiDocs = { 'user-services': { router: {} } };

            expect(service.getServerName('/oauth/authorize?x=1')).toBe('user-services');
            expect(service.getServerName('/oidc/.well-known/openid-configuration')).toBe('user-services');
        });

        it('matches a bare direct prefix (R3)', () => {
            const { service, swaggerService } = createService();
            configure(service, {
                prefixServers: ['user-services'],
                directPrefixOwner: { oauth: 'user-services' }
            });
            swaggerService.apiDocs = { 'user-services': { router: {} } };

            expect(service.getServerName('/oauth')).toBe('user-services');
        });

        it('still routes a normal-prefix request (R4)', () => {
            const { service, swaggerService } = createService();
            configure(service, {
                prefixServers: ['user-services'],
                directPrefixOwner: { oauth: 'user-services' }
            });
            swaggerService.apiDocs = { 'user-services': { router: {} } };

            expect(service.getServerName('/user-services/login')).toBe('user-services');
        });

        it('does NOT match a partial-name collision and falls through (R10)', () => {
            const { service, swaggerService } = createService();
            configure(service, {
                prefixServers: ['user-services'],
                directPrefixOwner: { oauth: 'user-services' }
            });
            swaggerService.apiDocs = { 'user-services': { router: {} } };

            // /oauthtoken matches neither the direct prefix nor the normal prefix → unavailable.
            expect(() => service.getServerName('/oauthtoken/x')).toThrow(ServiceUnavailableException);
        });
    });

    describe('removePath — leading-only strip (US1)', () => {
        it('strips the normal prefix when it is the leading segment (R4)', () => {
            const { service } = createService();
            expect(asInternal(service).removePath('user-services', '/user-services/login')).toBe('/login');
        });

        it('preserves a direct-prefix path (prefix not stripped) (R1)', () => {
            const { service } = createService();
            expect(asInternal(service).removePath('user-services', '/oauth/authorize')).toBe('/oauth/authorize');
        });

        it('returns "/" for the bare prefix', () => {
            const { service } = createService();
            expect(asInternal(service).removePath('user-services', '/user-services')).toBe('/');
        });

        it('does not strip a mid-path occurrence of the prefix', () => {
            const { service } = createService();
            expect(asInternal(service).removePath('user-services', '/oauth/user-services/x')).toBe(
                '/oauth/user-services/x'
            );
        });
    });

    describe('rewritePath — prefix retained vs stripped with normalization (US1)', () => {
        const makeRequest = (path: string): Request => ({ path }) as unknown as Request;

        it('retains the direct prefix and applies trailing-slash normalization (R1)', () => {
            const { service } = createService();
            expect(asInternal(service).rewritePath(makeRequest('/oauth/authorize'), 'user-services')).toBe(
                '/oauth/authorize/'
            );
        });

        it('strips the normal prefix and applies trailing-slash normalization (R4)', () => {
            const { service } = createService();
            expect(asInternal(service).rewritePath(makeRequest('/user-services/login'), 'user-services')).toBe(
                '/login/'
            );
        });
    });

    describe('handleProxyResponse — redirect Location (US1)', () => {
        it('prepends the normal prefix for a normal-prefix request (R13)', () => {
            const { service } = createService();
            configure(service, { directPrefixOwner: { oauth: 'user-services' } });
            const proxyRes = { statusCode: 302, headers: { location: '/callback' } };

            service.handleProxyResponse(
                { prefix: 'user-services' } as ApiServiceDetail,
                proxyRes as never,
                { url: '/user-services/login' } as Request
            );

            expect(proxyRes.headers.location).toBe('/user-services/callback');
        });

        it('leaves Location unchanged for a direct-prefix request (R14)', () => {
            const { service } = createService();
            configure(service, { directPrefixOwner: { oauth: 'user-services' } });
            const proxyRes = { statusCode: 302, headers: { location: '/callback' } };

            service.handleProxyResponse(
                { prefix: 'user-services' } as ApiServiceDetail,
                proxyRes as never,
                { url: '/oauth/authorize' } as Request
            );

            expect(proxyRes.headers.location).toBe('/callback');
        });
    });
});

describe('ProxyService direct-prefix registration', () => {
    it('registers multiple direct prefixes for one service (US2, SC-004)', () => {
        const { service, swaggerService } = createService();
        asInternal(service).registerDirectPrefixes({
            prefix: 'user-services',
            docUrl: 'http://x/doc',
            host: 'http://x',
            directPrefixes: ['oauth', 'oidc']
        });

        expect(asInternal(service).directPrefixServers).toEqual(['oauth', 'oidc']);
        expect(asInternal(service).directPrefixOwner).toEqual({ oauth: 'user-services', oidc: 'user-services' });

        (service as never as { prefixServers: string[] }).prefixServers = ['user-services'];
        swaggerService.apiDocs = { 'user-services': { router: {} } };
        expect(service.getServerName('/oauth/token')).toBe('user-services');
        expect(service.getServerName('/oidc/userinfo')).toBe('user-services');
    });

    it('resolves a cross-service collision first-wins (US2, FR-007/C5)', () => {
        const { service } = createService();
        asInternal(service).registerDirectPrefixes({
            prefix: 'service-a',
            docUrl: 'http://a/doc',
            host: 'http://a',
            directPrefixes: ['oauth']
        });
        asInternal(service).registerDirectPrefixes({
            prefix: 'service-b',
            docUrl: 'http://b/doc',
            host: 'http://b',
            directPrefixes: ['oauth']
        });

        expect(asInternal(service).directPrefixOwner['oauth']).toBe('service-a');
        expect(asInternal(service).directPrefixServers).toEqual(['oauth']);
    });

    it('registers 3+ direct prefixes and routes each (US2, FR-005)', () => {
        const { service, swaggerService } = createService();
        asInternal(service).registerDirectPrefixes({
            prefix: 'user-services',
            docUrl: 'http://x/doc',
            host: 'http://x',
            directPrefixes: ['oauth', 'oidc', 'saml']
        });

        expect(asInternal(service).directPrefixServers).toEqual(['oauth', 'oidc', 'saml']);

        (service as never as { prefixServers: string[] }).prefixServers = ['user-services'];
        swaggerService.apiDocs = { 'user-services': { router: {} } };
        for (const dp of ['oauth', 'oidc', 'saml']) {
            expect(service.getServerName(`/${dp}/x`)).toBe('user-services');
        }
    });
});

describe('ProxyService backward compatibility (Polish, R15/SC-005)', () => {
    it('a service with no directPrefixes behaves exactly as before', () => {
        const { service, swaggerService } = createService();
        asInternal(service).registerDirectPrefixes({
            prefix: 'user-services',
            docUrl: 'http://x/doc',
            host: 'http://x'
        });

        expect(asInternal(service).directPrefixServers).toEqual([]);

        (service as never as { prefixServers: string[] }).prefixServers = ['user-services'];
        swaggerService.apiDocs = { 'user-services': { router: {} } };

        expect(service.getServerName('/user-services/login')).toBe('user-services');
        expect(asInternal(service).removePath('user-services', '/user-services/login')).toBe('/login');
        expect(asInternal(service).isDirectPrefixRequest('/oauth/x')).toBe(false);
        expect(() => service.getServerName('/oauth/x')).toThrow(ServiceUnavailableException);
    });
});

describe('ProxyService request sanitization (auth bypass hardening)', () => {
    type Internals = {
        proxyServers: Record<string, { forwardRequest: Mock }>;
        prefixServers: string[];
        requestService: { isStaticRequest: Mock; handle: Mock };
        throttlerService: Record<string, Mock>;
    };

    function createGateway(bypassRoutePrefixes: string[]): {
        service: ProxyService;
        forwardRequest: Mock;
        getRouterDetail: Mock;
        handle: Mock;
    } {
        const { service, swaggerService } = createService({ bypassRoutePrefixes, excludeHeaders: ['auth-user-id'] });
        const internals = service as never as Internals;
        internals.prefixServers = ['user-services'];
        swaggerService.apiDocs = { 'user-services': { router: {} } };
        const forwardRequest = vi.fn().mockResolvedValue(undefined);
        internals.proxyServers = { 'user-services': { forwardRequest } };
        internals.requestService.handle = vi.fn().mockResolvedValue(true);
        internals.throttlerService = {
            checkGlobalIpRequest: vi.fn().mockResolvedValue(undefined),
            checkAnonymousIpRequest: vi.fn().mockResolvedValue(undefined),
            checkLimitOfRequest: vi.fn().mockResolvedValue(undefined),
            checkRouterHasCustomLimit: vi.fn().mockReturnValue(false)
        };
        return {
            service,
            forwardRequest,
            getRouterDetail: swaggerService.getRouterDetail,
            handle: internals.requestService.handle
        };
    }

    const makeRequest = (url: string, headers: Record<string, string> = {}): Request =>
        ({ url, method: 'GET', headers }) as unknown as Request;
    const response = { on: vi.fn() } as unknown as Response;

    it('still forwards a genuine bypass-prefix request without consulting the router', async () => {
        const { service, forwardRequest, getRouterDetail } = createGateway(['/user-services/oidc']);
        const request = makeRequest('/user-services/oidc/.well-known/openid-configuration');

        await service.handleRequest(request, response);

        expect(forwardRequest).toHaveBeenCalledTimes(1);
        expect(getRouterDetail).not.toHaveBeenCalled();
    });

    it.each([
        '/user-services/oidc/../v1/admin',
        '/user-services/oidc/%2e%2e/v1/admin',
        '/user-services/oidc\\..\\v1/admin',
        '/user-services/oidc/./x/../../v1/admin'
    ])('does not let %s ride the public prefix to a protected route', async (url) => {
        const { service, forwardRequest, getRouterDetail } = createGateway(['/user-services/oidc']);
        getRouterDetail.mockReturnValue(undefined);
        const request = makeRequest(url);

        await expect(service.handleRequest(request, response)).rejects.toThrow(MethodNotAllowedException);

        // The router was consulted with the canonical path the upstream would actually receive.
        expect(request.url).toBe('/user-services/v1/admin');
        expect(getRouterDetail).toHaveBeenCalledWith('user-services', 'GET', '/v1/admin');
        expect(forwardRequest).not.toHaveBeenCalled();
    });

    it('runs the auth middleware for the normalized protected route', async () => {
        const { service, forwardRequest, getRouterDetail, handle } = createGateway(['/user-services/oidc']);
        getRouterDetail.mockReturnValue({ isBearerAuth: true, rateLimits: [] });
        handle.mockResolvedValue(false);

        await expect(service.handleRequest(makeRequest('/user-services/oidc/../v1/admin'), response)).rejects.toThrow(
            ForbiddenException
        );
        expect(forwardRequest).not.toHaveBeenCalled();
    });

    it('matches bypass prefixes on whole path segments only', async () => {
        const { service, getRouterDetail } = createGateway(['/user-services/oidc']);
        getRouterDetail.mockReturnValue(undefined);

        await expect(service.handleRequest(makeRequest('/user-services/oidc-admin/users'), response)).rejects.toThrow(
            MethodNotAllowedException
        );
        expect(getRouterDetail).toHaveBeenCalledWith('user-services', 'GET', '/oidc-admin/users');
    });

    it('strips caller-supplied identity headers even on bypass routes', async () => {
        const { service, forwardRequest } = createGateway(['/user-services/oidc']);
        const request = makeRequest('/user-services/oidc/token', { 'auth-user-id': 'spoofed', host: 'gw' });

        await service.handleRequest(request, response);

        expect(request.headers).toEqual({ host: 'gw' });
        expect(forwardRequest).toHaveBeenCalledWith(request, response);
    });

    it('strips caller-supplied identity headers before the auth middleware runs on normal routes', async () => {
        const { service, forwardRequest, getRouterDetail, handle } = createGateway([]);
        getRouterDetail.mockReturnValue({ isBearerAuth: true, rateLimits: [] });
        const seen: unknown[] = [];
        handle.mockImplementation(async (_detail: unknown, req: Request, proxyRequest: ProxyRequest) => {
            seen.push({ ...req.headers });
            proxyRequest.addHeader('auth-user-id', 'trusted');
            return true;
        });
        const request = makeRequest('/user-services/v1/me', { 'auth-user-id': 'spoofed' });

        await service.handleRequest(request, response);

        expect(seen).toEqual([{}]);
        expect(forwardRequest).toHaveBeenCalledWith(request, response, { headers: { 'auth-user-id': 'trusted' } });
    });
});
