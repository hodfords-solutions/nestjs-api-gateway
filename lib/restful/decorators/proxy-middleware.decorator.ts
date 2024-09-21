import { SetMetadata } from '@nestjs/common';

export const PROXY_MIDDLEWARE = 'PROXY_MIDDLEWARE';

export function ProxyMiddleware(priority: number = 1): ClassDecorator {
    return SetMetadata(PROXY_MIDDLEWARE, priority);
}
