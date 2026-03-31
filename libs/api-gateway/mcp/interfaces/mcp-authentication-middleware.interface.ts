import { Request, Response } from 'express';

export interface McpAuthenticationMiddlewareHandler {
    authenticate(request: Request, response: Response): Promise<boolean> | boolean;
}
