import { Request, Response } from 'express';
import { McpAuthenticationMiddleware, McpAuthenticationMiddlewareHandler } from '../../libs/api-gateway/index.js';

@McpAuthenticationMiddleware()
export class McpAuthenticationMiddlewareImpl implements McpAuthenticationMiddlewareHandler {
    async authenticate(request: Request, response: Response): Promise<boolean> {
        console.log('MCP authentication middleware', request.url);
        return true;
    }
}
