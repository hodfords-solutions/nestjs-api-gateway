import { IncomingMessage } from 'http';
import { RouterDetail, ProxyMiddlewareHandler, ProxyMiddleware, ProxyRequest } from '../../libs/api-gateway/index.js';

@ProxyMiddleware()
export class AuthenticationMiddleware implements ProxyMiddlewareHandler {
    async handle(routerDetail: RouterDetail, request: IncomingMessage, proxyRequest: ProxyRequest): Promise<boolean> {
        proxyRequest.addHeaders({ authUserId: '123' });
        (request as any).authUserId = '123';
        return true;
    }
}
