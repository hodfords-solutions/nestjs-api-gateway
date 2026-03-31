import { Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpServerService } from '../services/mcp-server.service';

@Controller()
export class McpController {
    constructor(private mcpServerService: McpServerService) {}

    @Post('mcp')
    async handleRequest(@Req() request: Request, @Res() response: Response): Promise<void> {
        await this.mcpServerService.handleRequest(request, response);
    }
}
