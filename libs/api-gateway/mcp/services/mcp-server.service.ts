import { HttpStatus, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpToolRegistryService } from './mcp-tool-registry.service';
import { McpToolExecutorService } from './mcp-tool-executor.service';
import { MCP_OPTION } from '../constants/mcp.constant';
import { McpOption } from '../types/mcp-option.type';
import { MCP_AUTHENTICATION_MIDDLEWARE } from '../decorators/mcp-authentication-middleware.decorator';
import { McpAuthenticationMiddlewareHandler } from '../interfaces/mcp-authentication-middleware.interface';
import { getProviderByMetadata } from '../../restful/helpers/provider.helper';
import { Request, Response } from 'express';

@Injectable()
export class McpServerService implements OnModuleInit, OnModuleDestroy {
    private logger = new Logger(McpServerService.name);
    private activeSessions: Set<Server> = new Set();
    private authenticationHandlers: McpAuthenticationMiddlewareHandler[] = [];

    constructor(
        private toolRegistryService: McpToolRegistryService,
        private toolExecutorService: McpToolExecutorService,
        private modulesContainer: ModulesContainer,
        @Inject(MCP_OPTION) private mcpOption: McpOption
    ) {}

    onModuleInit(): void {
        this.authenticationHandlers = getProviderByMetadata(MCP_AUTHENTICATION_MIDDLEWARE, this.modulesContainer);
        this.toolRegistryService.refreshTools();
        this.logger.log('MCP Server initialized');
    }

    async handleRequest(request: Request, response: Response): Promise<void> {
        if (!(await this.authenticate(request, response))) {
            return;
        }

        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await this.createSession(transport, request);
        await transport.handleRequest(request, response);
    }

    private async authenticate(request: Request, response: Response): Promise<boolean> {
        for (const handler of this.authenticationHandlers) {
            if (!(await handler.authenticate(request, response))) {
                if (!response.headersSent) {
                    response.status(HttpStatus.UNAUTHORIZED).json({ error: 'Unauthorized' });
                }
                return false;
            }
        }
        return true;
    }

    private async createSession(transport: StreamableHTTPServerTransport, request: Request): Promise<Server> {
        const server = new Server(
            {
                name: this.mcpOption.serverInfo?.name || 'nestjs-api-gateway',
                version: this.mcpOption.serverInfo?.version || '1.0.0'
            },
            { capabilities: { tools: { listChanged: true } } }
        );

        this.registerToolHandlers(server, request);
        await server.connect(transport);
        this.activeSessions.add(server);

        transport.onclose = () => {
            this.activeSessions.delete(server);
        };

        return server;
    }

    async onModuleDestroy(): Promise<void> {
        const sessions = [...this.activeSessions];
        this.activeSessions.clear();
        await Promise.all(sessions.map((server) => server.close().catch(() => {})));
        this.logger.log('MCP Server stopped');
    }

    private registerToolHandlers(server: Server, request: Request): void {
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = this.toolRegistryService.getTools();
            return {
                tools: tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }))
            };
        });

        server.setRequestHandler(CallToolRequestSchema, async (req) => {
            return this.toolExecutorService.executeTool(
                req.params.name,
                (req.params.arguments as Record<string, any>) || {},
                request
            );
        });
    }
}
