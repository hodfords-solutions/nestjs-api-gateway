import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { McpToolRegistryService } from './mcp-tool-registry.service';
import { McpToolExecutorService } from './mcp-tool-executor.service';
import { MCP_OPTION } from '../constants/mcp.constant';
import { McpOption } from '../types/mcp-option.type';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { IncomingMessage } from 'http';

@Injectable()
export class McpServerService implements OnModuleInit {
    private logger = new Logger(McpServerService.name);

    constructor(
        private toolRegistryService: McpToolRegistryService,
        private toolExecutorService: McpToolExecutorService,
        @Inject(MCP_OPTION) private mcpOption: McpOption
    ) {}

    onModuleInit(): void {
        this.toolRegistryService.refreshTools();
        this.logger.log('MCP Server initialized');
    }

    async createSession(transport: Transport, request?: IncomingMessage): Promise<Server> {
        const server = new Server(
            {
                name: this.mcpOption.serverInfo?.name || 'nestjs-api-gateway',
                version: this.mcpOption.serverInfo?.version || '1.0.0'
            },
            {
                capabilities: {
                    tools: { listChanged: true }
                }
            }
        );

        this.registerToolHandlers(server, request);
        await server.connect(transport);
        this.logger.log('MCP session created');

        return server;
    }

    private registerToolHandlers(server: Server, request?: IncomingMessage): void {
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
