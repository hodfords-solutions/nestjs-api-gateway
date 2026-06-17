import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpenApiService } from '../../restful/services/open-api.service';
import { McpToolDefinition } from '../types/mcp-tool.type';
import { MAX_TOOL_NAME_LENGTH, MCP_OPTION } from '../constants/mcp.constant';
import { McpOption, McpParameterFilterContext } from '../types/mcp-option.type';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';

const jsonSchemaTypes = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];

@Injectable()
export class McpToolRegistryService implements OnApplicationBootstrap {
    private logger = new Logger(McpToolRegistryService.name);
    private tools: McpToolDefinition[] = [];

    constructor(
        private openApiService: OpenApiService,
        @Inject(MCP_OPTION) private mcpOption: McpOption,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        // Runs after every module's onModuleInit has completed, so ProxyService has
        // already kicked off the initial API document load. Wait for that load to
        // settle before building the first tool registry.
        await this.openApiService.ready;
        this.refreshTools();
    }

    getTools(): McpToolDefinition[] {
        return this.tools;
    }

    getToolByName(name: string): McpToolDefinition | undefined {
        return this.tools.find((tool) => tool.name === name);
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    refreshTools(): void {
        const newTools: McpToolDefinition[] = [];

        for (const serviceName in this.openApiService.apiDocs) {
            if (this.mcpOption.allowedServices && !this.mcpOption.allowedServices.includes(serviceName)) {
                continue;
            }

            const endpoint = this.openApiService.apiDocs[serviceName];
            const originDoc = this.openApiService.originDocs[serviceName];

            for (const method in endpoint.router) {
                for (const routerDetail of endpoint.router[method]) {
                    if (
                        this.mcpOption.allowedOperations &&
                        routerDetail.operationId &&
                        !this.mcpOption.allowedOperations.includes(routerDetail.operationId)
                    ) {
                        continue;
                    }

                    if (this.mcpOption.filter && !this.mcpOption.filter(serviceName, routerDetail)) {
                        continue;
                    }

                    const toolName = this.buildToolName(
                        serviceName,
                        method,
                        routerDetail.operationId,
                        routerDetail.path
                    );
                    const inputSchema = this.buildInputSchema(originDoc, routerDetail.path, method, serviceName);

                    newTools.push({
                        name: toolName,
                        description: routerDetail.description || `${method.toUpperCase()} ${routerDetail.path}`,
                        inputSchema,
                        serviceName,
                        httpMethod: method.toUpperCase(),
                        path: routerDetail.path,
                        routerDetail
                    });
                }
            }
        }

        this.tools = newTools;
        this.logger.log(`Refreshed MCP tool registry: ${this.tools.length} tools available`);
    }

    private buildToolName(serviceName: string, method: string, operationId: string, path: string): string {
        const defaultName = this.buildDefaultToolName(serviceName, method, operationId, path);
        const toolName = this.mcpOption.toolName
            ? this.mcpOption.toolName({ serviceName, method, operationId, path, defaultName })
            : defaultName;

        if (toolName.length > MAX_TOOL_NAME_LENGTH) {
            this.logger.warn(
                `MCP tool name "${toolName}" is ${toolName.length} characters, ` +
                    `which exceeds the recommended maximum of ${MAX_TOOL_NAME_LENGTH}.`
            );
        }

        return toolName;
    }

    private buildDefaultToolName(serviceName: string, method: string, operationId: string, path: string): string {
        if (operationId) {
            return `${serviceName}_${operationId}`;
        }
        const sanitizedPath = path
            .replace(/[{}\/]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        return `${serviceName}_${method.toUpperCase()}_${sanitizedPath}`;
    }

    private buildInputSchema(originDoc: any, path: string, method: string, serviceName: string): Record<string, any> {
        const schema: Record<string, any> = {
            type: 'object',
            properties: {},
            required: []
        };

        if (!originDoc?.paths?.[path]?.[method]) {
            return schema;
        }

        const operation = originDoc.paths[path][method];

        if (operation.parameters) {
            this.applyParameters(schema, operation.parameters, { serviceName, path, method });
        }

        if (operation.requestBody?.content) {
            const jsonContent = operation.requestBody.content['application/json'];
            if (jsonContent?.schema) {
                const bodySchema = this.resolveSchema(originDoc, jsonContent.schema);
                schema.properties['body'] = {
                    type: 'object',
                    description: operation.requestBody.description || 'Request body',
                    ...bodySchema
                };
                if (operation.requestBody.required) {
                    schema.required.push('body');
                }
            }
        }

        if (schema.required.length === 0) {
            delete schema.required;
        }

        return schema;
    }

    private applyParameters(schema: Record<string, any>, parameters: any[], context: McpParameterFilterContext): void {
        for (const param of parameters) {
            if (this.mcpOption.parameterFilter && !this.mcpOption.parameterFilter(param, context)) {
                continue;
            }

            const propName = `${param.in}_${param.name}`;
            const paramType = param.schema?.type;
            const normalizedType = this.normalizeSchemaType(paramType);
            if (normalizedType === undefined && paramType !== undefined && paramType !== null) {
                this.logger.warn(
                    `Unmappable type ${JSON.stringify(this.describeType(paramType))} for parameter ` +
                        `"${param.in}.${param.name}" (${context.serviceName} ${context.method} ${context.path}); ` +
                        `defaulting to "string".`
                );
            }
            schema.properties[propName] = {
                type: normalizedType || 'string',
                description: param.description || `${param.in} parameter: ${param.name}`
            };
            if (param.schema?.enum) {
                schema.properties[propName].enum = param.schema.enum;
            }
            if (param.required) {
                schema.required.push(propName);
            }
        }
    }

    private resolveSchema(originDoc: any, schema: any, resolvedRefs = new Set<string>()): any {
        if (schema.$ref) {
            if (resolvedRefs.has(schema.$ref)) {
                return {};
            }
            resolvedRefs.add(schema.$ref);

            const refPath = schema.$ref.replace('#/', '').split('/');
            let resolved = originDoc;
            for (const segment of refPath) {
                resolved = resolved?.[segment];
            }
            return resolved ? this.resolveSchema(originDoc, resolved, resolvedRefs) : {};
        }

        if (schema.properties) {
            const resolved: any = { ...schema };
            this.normalizeSchemaTypeInPlace(resolved);
            resolved.properties = {};
            for (const key in schema.properties) {
                resolved.properties[key] = this.resolveSchema(originDoc, schema.properties[key], resolvedRefs);
            }
            return resolved;
        }

        if (schema.items) {
            const resolved = { ...schema, items: this.resolveSchema(originDoc, schema.items, resolvedRefs) };
            this.normalizeSchemaTypeInPlace(resolved);
            return resolved;
        }

        const resolved = { ...schema };
        this.normalizeSchemaTypeInPlace(resolved);
        return resolved;
    }

    /**
     * Rewrites a schema's own `type` field to a valid JSON Schema type in place.
     *
     * Upstream Swagger generators sometimes leak a constructor (`type: String`) or its
     * stringified form (`"function String() { [native code] }"`) into the served document.
     * MCP clients reject such schemas, so we coerce them to lowercase JSON Schema types and
     * drop anything we can't map.
     */
    private normalizeSchemaTypeInPlace(schema: any): void {
        if (!schema || typeof schema !== 'object' || !('type' in schema)) {
            return;
        }

        const originalType = schema.type;
        const normalized = this.normalizeSchemaType(originalType);
        if (normalized === undefined) {
            if (originalType !== undefined && originalType !== null) {
                this.logger.warn(
                    `Dropping unmappable schema type ${JSON.stringify(this.describeType(originalType))} ` +
                        `while building MCP input schema.`
                );
            }
            delete schema.type;
        } else {
            schema.type = normalized;
        }
    }

    /**
     * Produces a log-friendly description of a schema `type` value. Functions don't survive
     * `JSON.stringify`, so render them by name to keep the warning useful.
     */
    private describeType(type: unknown): string {
        if (typeof type === 'function') {
            return `[Function: ${(type as { name?: string }).name || 'anonymous'}]`;
        }
        return String(type);
    }

    private normalizeSchemaType(type: unknown): string | string[] | undefined {
        if (type === undefined || type === null) {
            return undefined;
        }

        // OpenAPI 3.1 allows an array of types — normalize every entry.
        if (Array.isArray(type)) {
            const normalized = type
                .map((entry) => this.normalizeSchemaType(entry))
                .filter((entry): entry is string => typeof entry === 'string');
            return normalized.length ? normalized : undefined;
        }

        // A constructor function leaked in directly, e.g. `type: String`.
        if (typeof type === 'function') {
            return this.constructorNameToJsonType((type as { name?: string }).name);
        }

        if (typeof type === 'string') {
            // A constructor that was stringified upstream, e.g. "function String() { [native code] }".
            const functionMatch = type.match(/^\s*(?:async\s+)?function\*?\s+(\w+)/);
            if (functionMatch) {
                return this.constructorNameToJsonType(functionMatch[1]);
            }

            const lower = type.toLowerCase();
            if (jsonSchemaTypes.includes(lower)) {
                return lower;
            }
        }

        return undefined;
    }

    private constructorNameToJsonType(name?: string): string | undefined {
        switch (name) {
            case 'String':
                return 'string';
            case 'Number':
            case 'BigInt':
                return 'number';
            case 'Boolean':
                return 'boolean';
            case 'Array':
                return 'array';
            case 'Object':
                return 'object';
            case 'Date':
                return 'string';
            default:
                return undefined;
        }
    }
}
