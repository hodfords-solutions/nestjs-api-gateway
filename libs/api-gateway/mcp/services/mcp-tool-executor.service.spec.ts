// camelcase-keys (pulled in via open-api.service) is ESM-only and not transformed by @swc/jest.
jest.mock('camelcase-keys', () => ({ __esModule: true, default: (value: unknown) => value }));

import { IncomingMessage } from 'http';
import { McpToolExecutorService } from './mcp-tool-executor.service';
import { McpToolDefinition } from '../types/mcp-tool.type';
import { ProxyRequest } from '../../restful/models/proxy-request.model';

function makeTool(overrides: Partial<McpToolDefinition> = {}): McpToolDefinition {
    return {
        name: 'users_UserController_show',
        description: 'Get a user',
        inputSchema: { type: 'object', properties: {} },
        serviceName: 'users',
        httpMethod: 'GET',
        path: '/users/{id}',
        routerDetail: {} as never,
        ...overrides
    };
}

function createService(overrides: {
    tool?: McpToolDefinition | undefined;
    throttler?: Partial<{ checkLimitOfRequest: jest.Mock }>;
    requestService?: Partial<{ handle: jest.Mock }>;
    poolResponse?: { statusCode: number; body: AsyncIterable<Buffer> };
}): { service: McpToolExecutorService; poolRequest: jest.Mock } {
    const toolRegistryService = { getToolByName: jest.fn().mockReturnValue(overrides.tool) };
    const throttlerService = {
        checkLimitOfRequest: jest.fn().mockResolvedValue(undefined),
        ...overrides.throttler
    };
    const requestService = { handle: jest.fn().mockResolvedValue(true), ...overrides.requestService };
    const service = new McpToolExecutorService(
        toolRegistryService as never,
        {} as never,
        throttlerService as never,
        requestService as never,
        { apiServices: [] } as never
    );

    const poolRequest = jest.fn().mockResolvedValue(
        overrides.poolResponse || {
            statusCode: 200,
            body: (async function* () {
                yield Buffer.from('{"ok":true}');
            })()
        }
    );
    (service as never as { pools: Map<string, unknown> }).pools.set('users', { request: poolRequest });

    return { service, poolRequest };
}

const asInternal = (
    service: McpToolExecutorService
): {
    extractRequestParts(
        tool: McpToolDefinition,
        args: Record<string, any>
    ): { path: string; query: Record<string, string>; body: any; headers: Record<string, string> };
    buildRequestOptions(tool: McpToolDefinition, args: Record<string, any>, proxyRequest: ProxyRequest): any;
} => service as never;

const request = { headers: {} } as IncomingMessage;

describe('McpToolExecutorService.extractRequestParts', () => {
    it('substitutes path_ args, collects query_/header_ args and the body', () => {
        const { service } = createService({ tool: makeTool() });
        const parts = asInternal(service).extractRequestParts(makeTool(), {
            path_id: '42',

            query_status: 'active',

            header_locale: 'en',
            body: { name: 'a' }
        });

        expect(parts.path).toBe('/users/42/');
        expect(parts.query).toEqual({ status: 'active' });
        expect(parts.headers).toEqual({ locale: 'en' });
        expect(parts.body).toEqual({ name: 'a' });
    });

    it('appends a trailing slash and ignores unknown arg shapes', () => {
        const { service } = createService({ tool: makeTool() });
        const parts = asInternal(service).extractRequestParts(makeTool({ path: '/health' }), { unrelated: 'x' });
        expect(parts.path).toBe('/health/');
        expect(parts.body).toBeUndefined();
    });
});

describe('McpToolExecutorService.buildRequestOptions', () => {
    it('builds the request with json content type, merged headers and query string', () => {
        const { service } = createService({ tool: makeTool() });
        const proxyRequest = new ProxyRequest();
        proxyRequest.addHeader('authUserId', '123');

        const options = asInternal(service).buildRequestOptions(
            makeTool(),

            { path_id: '42', query_status: 'active' },
            proxyRequest
        );

        expect(options.method).toBe('GET');
        expect(options.path).toBe('/users/42/?status=active');
        expect(options.headers.get('content-type')).toBe('application/json');
        expect(options.headers.get('auth-user-id')).toBe('123');
        expect(options.body).toBeUndefined();
    });

    it('serializes the body only for POST/PUT/PATCH', () => {
        const { service } = createService({ tool: makeTool() });
        const proxyRequest = new ProxyRequest();

        const post = asInternal(service).buildRequestOptions(
            makeTool({ httpMethod: 'POST', path: '/users' }),
            { body: { name: 'a' } },
            proxyRequest
        );
        expect(post.body).toBe('{"name":"a"}');

        const get = asInternal(service).buildRequestOptions(makeTool(), { body: { name: 'a' } }, proxyRequest);
        expect(get.body).toBeUndefined();
    });
});

describe('McpToolExecutorService.executeTool', () => {
    it('returns an error result for an unknown tool', async () => {
        const { service } = createService({ tool: undefined });
        const result = await service.executeTool('nope', {}, request);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Tool not found: nope');
    });

    it('forwards to the downstream service and returns its body', async () => {
        const { service, poolRequest } = createService({ tool: makeTool() });

        const result = await service.executeTool('users_UserController_show', { path_id: '42' }, request);

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toBe('{"ok":true}');
        expect(poolRequest).toHaveBeenCalledWith(expect.objectContaining({ path: '/users/42/' }));
    });

    it('returns a forbidden result when gateway middleware rejects the request', async () => {
        const { service } = createService({
            tool: makeTool(),
            requestService: { handle: jest.fn().mockResolvedValue(false) }
        });
        const result = await service.executeTool('users_UserController_show', {}, request);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Request forbidden by gateway middleware');
    });

    it('returns an error result when throttling rejects the request', async () => {
        const { service } = createService({
            tool: makeTool(),
            throttler: { checkLimitOfRequest: jest.fn().mockRejectedValue(new Error('Too many requests')) }
        });
        const result = await service.executeTool('users_UserController_show', {}, request);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Too many requests');
    });

    it('returns an error result for downstream 4xx/5xx responses', async () => {
        const { service } = createService({
            tool: makeTool(),
            poolResponse: {
                statusCode: 500,
                body: (async function* () {
                    yield Buffer.from('boom');
                })()
            }
        });
        const result = await service.executeTool('users_UserController_show', {}, request);
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('500');
    });
});
