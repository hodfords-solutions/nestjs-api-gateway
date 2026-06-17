// camelcase-keys (pulled in via open-api.service) is ESM-only and not transformed by @swc/jest.
jest.mock('camelcase-keys', () => ({ __esModule: true, default: (value: unknown) => value }));

import { McpToolRegistryService } from './mcp-tool-registry.service';
import { McpOption } from '../types/mcp-option.type';
import { OpenApiService } from '../../restful/services/open-api.service';

function makeRouterDetail(overrides: Record<string, unknown> = {}): any {
    return {
        operationId: 'UserController_show',
        description: 'Get a user',
        path: '/users/{id}',
        isBearerAuth: false,
        isApiKeyAuth: false,
        routerPath: '/users/:id',
        pathMatch: () => true,
        rateLimits: [],
        ...overrides
    };
}

function createService(
    mcpOption: McpOption = {},
    docs: { apiDocs?: Record<string, unknown>; originDocs?: Record<string, unknown> } = {}
): McpToolRegistryService {
    const openApiService = {
        apiDocs: docs.apiDocs || {
            users: { router: { get: [makeRouterDetail()] } }
        },
        originDocs: docs.originDocs || { users: {} },
        ready: Promise.resolve()
    } as unknown as OpenApiService;

    return new McpToolRegistryService(openApiService, mcpOption, { apiServices: [] } as never);
}

const asInternal = (
    service: McpToolRegistryService
): {
    buildDefaultToolName(serviceName: string, method: string, operationId: string, path: string): string;
    resolveSchema(originDoc: any, schema: any): any;
} => service as never;

describe('McpToolRegistryService.refreshTools', () => {
    it('builds one tool per documented operation', () => {
        const service = createService();
        service.refreshTools();

        const tools = service.getTools();
        expect(tools).toHaveLength(1);
        expect(tools[0]).toMatchObject({
            name: 'users_UserController_show',
            description: 'Get a user',
            serviceName: 'users',
            httpMethod: 'GET',
            path: '/users/{id}'
        });
    });

    it('falls back to a method/path description when none is documented', () => {
        const service = createService(
            {},
            { apiDocs: { users: { router: { get: [makeRouterDetail({ description: '' })] } } } }
        );
        service.refreshTools();
        expect(service.getTools()[0].description).toBe('GET /users/{id}');
    });

    it('filters by allowedServices', () => {
        const service = createService({ allowedServices: ['orders'] });
        service.refreshTools();
        expect(service.getTools()).toHaveLength(0);
    });

    it('filters by allowedOperations', () => {
        const service = createService({ allowedOperations: ['SomethingElse'] });
        service.refreshTools();
        expect(service.getTools()).toHaveLength(0);
    });

    it('applies the custom filter callback', () => {
        const filter = jest.fn().mockReturnValue(false);
        const service = createService({ filter });
        service.refreshTools();
        expect(service.getTools()).toHaveLength(0);
        expect(filter).toHaveBeenCalledWith('users', expect.objectContaining({ operationId: 'UserController_show' }));
    });

    it('uses the custom toolName callback when provided', () => {
        const service = createService({ toolName: ({ serviceName, operationId }) => `${serviceName}.${operationId}` });
        service.refreshTools();
        expect(service.getTools()[0].name).toBe('users.UserController_show');
    });

    it('getToolByName finds tools and returns undefined for unknown names', () => {
        const service = createService();
        service.refreshTools();
        expect(service.getToolByName('users_UserController_show')).toBeDefined();
        expect(service.getToolByName('nope')).toBeUndefined();
    });
});

describe('McpToolRegistryService.buildDefaultToolName', () => {
    it('uses serviceName + operationId when available', () => {
        const service = createService();
        expect(asInternal(service).buildDefaultToolName('users', 'get', 'UserController_show', '/users/{id}')).toBe(
            'users_UserController_show'
        );
    });

    it('sanitizes the path when there is no operationId', () => {
        const service = createService();
        expect(asInternal(service).buildDefaultToolName('users', 'get', undefined, '/users/{id}/posts')).toBe(
            'users_GET_users_id_posts'
        );
    });
});

describe('McpToolRegistryService.buildInputSchema (via refreshTools)', () => {
    const originDoc = {
        paths: {
            '/users/{id}': {
                get: {
                    parameters: [
                        { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
                        { in: 'query', name: 'status', schema: { type: 'string', enum: ['active', 'inactive'] } }
                    ],
                    requestBody: {
                        required: true,
                        description: 'Payload',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/UserDto' }
                            }
                        }
                    }
                }
            }
        },
        components: {
            schemas: {
                UserDto: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        friend: { $ref: '#/components/schemas/UserDto' }
                    }
                }
            }
        }
    };

    it('exposes parameters with in_-prefixed names, enums and required flags', () => {
        const service = createService({}, { originDocs: { users: originDoc } });
        service.refreshTools();
        const schema = service.getTools()[0].inputSchema;

        expect(schema.properties['path_id']).toEqual({ type: 'string', description: 'path parameter: id' });
        expect(schema.properties['query_status'].enum).toEqual(['active', 'inactive']);
        expect(schema.required).toEqual(expect.arrayContaining(['path_id', 'body']));
        expect(schema.required).not.toContain('query_status');
    });

    it('resolves $ref body schemas and breaks circular references', () => {
        const service = createService({}, { originDocs: { users: originDoc } });
        service.refreshTools();
        const body = service.getTools()[0].inputSchema.properties['body'];

        expect(body.properties.name).toEqual({ type: 'string' });
        // The circular UserDto.friend reference resolves to an empty schema instead of recursing forever.
        expect(body.properties.friend).toEqual({});
    });

    it('omits parameters rejected by the parameterFilter', () => {
        const parameterFilter = jest.fn((param) => param.name !== 'status');
        const service = createService({ parameterFilter }, { originDocs: { users: originDoc } });
        service.refreshTools();
        const schema = service.getTools()[0].inputSchema;

        expect(schema.properties['query_status']).toBeUndefined();
        expect(schema.properties['path_id']).toBeDefined();
        expect(parameterFilter).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'id' }),
            expect.objectContaining({ serviceName: 'users', path: '/users/{id}', method: 'get' })
        );
    });

    it('returns an empty object schema when the operation is missing from the origin doc', () => {
        const service = createService({}, { originDocs: { users: {} } });
        service.refreshTools();
        expect(service.getTools()[0].inputSchema).toEqual({ type: 'object', properties: {}, required: [] });
    });
});

describe('McpToolRegistryService.resolveSchema', () => {
    it('resolves nested array item refs', () => {
        const service = createService();
        const doc = {
            components: { schemas: { item: { type: 'string' } } }
        };
        const resolved = asInternal(service).resolveSchema(doc, {
            type: 'array',
            items: { $ref: '#/components/schemas/item' }
        });
        expect(resolved).toEqual({ type: 'array', items: { type: 'string' } });
    });

    it('returns an empty schema for an unresolvable ref', () => {
        const service = createService();
        const resolved = asInternal(service).resolveSchema({}, { $ref: '#/components/schemas/missing' });
        expect(resolved).toEqual({});
    });

    it('coerces a stringified constructor type to a valid JSON Schema type', () => {
        const service = createService();
        const resolved = asInternal(service).resolveSchema(
            {},
            {
                type: 'object',
                properties: {
                    name: { type: 'function String() { [native code] }' },
                    age: { type: 'function Number() { [native code] }' },
                    active: { type: 'function Boolean() { [native code] }' }
                }
            }
        );
        expect(resolved.properties.name).toEqual({ type: 'string' });
        expect(resolved.properties.age).toEqual({ type: 'number' });
        expect(resolved.properties.active).toEqual({ type: 'boolean' });
    });

    it('coerces a constructor function type and drops unmappable types', () => {
        const service = createService();
        const resolved = asInternal(service).resolveSchema(
            {},
            {
                type: 'object',
                properties: {
                    name: { type: String, description: 'a name' },
                    weird: { type: 'function Whatever() { [native code] }', description: 'unknown' }
                }
            }
        );
        expect(resolved.properties.name).toEqual({ type: 'string', description: 'a name' });
        expect(resolved.properties.weird).toEqual({ description: 'unknown' });
    });

    it('logs a warning when a schema type cannot be mapped', () => {
        const service = createService();
        const warn = jest.spyOn((service as never as { logger: { warn: jest.Mock } }).logger, 'warn');
        asInternal(service).resolveSchema(
            {},
            { type: 'object', properties: { weird: { type: 'function Whatever() { [native code] }' } } }
        );
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dropping unmappable schema type'));
    });
});

describe('McpToolRegistryService.buildInputSchema type normalization', () => {
    it('coerces stringified constructor parameter types to valid JSON Schema types', () => {
        const originDoc = {
            paths: {
                '/users/{id}': {
                    get: {
                        parameters: [
                            {
                                in: 'path',
                                name: 'id',
                                required: true,
                                schema: { type: 'function String() { [native code] }' }
                            }
                        ]
                    }
                }
            }
        };
        const service = createService({}, { originDocs: { users: originDoc } });
        service.refreshTools();
        const schema = service.getTools()[0].inputSchema;

        expect(schema.properties['path_id']).toEqual({ type: 'string', description: 'path parameter: id' });
    });
});
