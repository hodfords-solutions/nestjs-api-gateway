import { Request, Response } from 'express';
import { McpAuthenticationMiddleware, McpAuthenticationMiddlewareHandler } from '@hodfords/api-gateway';

@McpAuthenticationMiddleware()
export class McpAuthenticationMiddlewareImpl implements McpAuthenticationMiddlewareHandler {
    async authenticate(request: Request, response: Response): Promise<boolean> {
        console.log('MCP authentication middleware', request.url);
        return true;
    }
}
