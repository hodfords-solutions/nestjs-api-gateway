import { SetMetadata } from '@nestjs/common';

export const MCP_AUTHENTICATION_MIDDLEWARE = 'MCP_AUTHENTICATION_MIDDLEWARE';

export function McpAuthenticationMiddleware(priority: number = 1): ClassDecorator {
    return SetMetadata(MCP_AUTHENTICATION_MIDDLEWARE, priority);
}
