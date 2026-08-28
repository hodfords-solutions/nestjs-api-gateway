import { IncomingMessage } from 'http';
import { ProxyRequest, WsProxyMiddleware, WsProxyMiddlewareHandler } from '../../libs/api-gateway/index.js';

@WsProxyMiddleware()
export class WsAuthenticationMiddleware implements WsProxyMiddlewareHandler {
    async handle(request: IncomingMessage, proxyRequest: ProxyRequest): Promise<boolean> {
        proxyRequest.addHeaders({ authUserId: '123' });
        return true;
    }
}
