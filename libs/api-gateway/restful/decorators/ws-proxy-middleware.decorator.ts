import { SetMetadata } from '@nestjs/common';

export const WS_PROXY_MIDDLEWARE = 'WS_PROXY_MIDDLEWARE';

export function WsProxyMiddleware(priority: number = 1): ClassDecorator {
    return SetMetadata(WS_PROXY_MIDDLEWARE, priority);
}
