import { IncomingMessage } from 'http';
import { ProxyRequest, WsProxyMiddleware, WsProxyMiddlewareHandler } from '@hodfords/api-gateway';

@WsProxyMiddleware()
export class WsAuthenticationMiddleware implements WsProxyMiddlewareHandler {
    async handle(request: IncomingMessage, proxyRequest: ProxyRequest): Promise<boolean> {
        proxyRequest.addHeaders({ 'auth-user-id': '123' });
        return true;
    }
}
