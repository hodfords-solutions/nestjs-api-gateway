import { Controller, Get, Post, Req, Res, HttpStatus, Inject } from '@nestjs/common';
import { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServerService } from '../services/mcp-server.service';
import { RequestService } from '../../restful/services/request.service';
import { ProxyRequest } from '../../restful/models/proxy-request.model';
import { MCP_OPTION } from '../constants/mcp.constant';
import { McpOption } from '../types/mcp-option.type';

@Controller()
export class McpController {
    private sseTransports: Map<string, SSEServerTransport> = new Map();

    constructor(
        private mcpServerService: McpServerService,
        private requestService: RequestService,
        @Inject(MCP_OPTION) private mcpOption: McpOption
    ) {}

    private getBasePath(): string {
        return this.mcpOption.path || '/mcp';
    }

    private async authenticate(request: Request, response: Response): Promise<boolean> {
        const proxyRequest = new ProxyRequest();
        const isAuthenticated = await this.requestService.handle(null, request, proxyRequest);
        if (!isAuthenticated) {
            response.status(HttpStatus.UNAUTHORIZED).json({ error: 'Unauthorized' });
            return false;
        }
        return true;
    }

    @Get('mcp/sse')
    async handleSseConnection(@Req() request: Request, @Res() response: Response): Promise<void> {
        if (!(await this.authenticate(request, response))) {
            return;
        }

        const transport = new SSEServerTransport(`${this.getBasePath()}/messages`, response);
        this.sseTransports.set(transport.sessionId, transport);

        response.on('close', () => {
            this.sseTransports.delete(transport.sessionId);
        });

        await this.mcpServerService.createSession(transport, request);
    }

    @Post('mcp/messages')
    async handleSseMessage(@Req() request: Request, @Res() response: Response): Promise<void> {
        const sessionId = request.query.sessionId as string;
        const transport = this.sseTransports.get(sessionId);

        if (!transport) {
            response.status(HttpStatus.NOT_FOUND).json({ error: 'Session not found' });
            return;
        }

        await transport.handlePostMessage(request, response);
    }

    @Post('mcp')
    async handleStreamableHttp(@Req() request: Request, @Res() response: Response): Promise<void> {
        if (!(await this.authenticate(request, response))) {
            return;
        }

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined
        });

        await this.mcpServerService.createSession(transport, request);
        await transport.handleRequest(request, response);
    }
}
