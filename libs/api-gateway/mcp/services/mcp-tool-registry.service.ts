import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpenApiService } from '../../restful/services/open-api.service';
import { McpToolDefinition } from '../types/mcp-tool.type';
import { MCP_OPTION } from '../constants/mcp.constant';
import { McpOption } from '../types/mcp-option.type';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';

@Injectable()
export class McpToolRegistryService {
    private logger = new Logger(McpToolRegistryService.name);
    private tools: McpToolDefinition[] = [];

    constructor(
        private openApiService: OpenApiService,
        @Inject(MCP_OPTION) private mcpOption: McpOption,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

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
                    const inputSchema = this.buildInputSchema(originDoc, routerDetail.path, method);

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
        if (operationId) {
            return `${serviceName}_${operationId}`;
        }
        const sanitizedPath = path
            .replace(/[{}\/]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        return `${serviceName}_${method.toUpperCase()}_${sanitizedPath}`;
    }

    private buildInputSchema(originDoc: any, path: string, method: string): Record<string, any> {
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
            for (const param of operation.parameters) {
                const propName = `${param.in}_${param.name}`;
                schema.properties[propName] = {
                    type: param.schema?.type || 'string',
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
            resolved.properties = {};
            for (const key in schema.properties) {
                resolved.properties[key] = this.resolveSchema(originDoc, schema.properties[key], resolvedRefs);
            }
            return resolved;
        }

        if (schema.items) {
            return { ...schema, items: this.resolveSchema(originDoc, schema.items, resolvedRefs) };
        }

        return schema;
    }
}
