import { IncomingMessage } from 'http';
import { RouterDetail, ProxyMiddlewareHandler, ProxyMiddleware, ProxyRequest } from '@hodfords/api-gateway';

@ProxyMiddleware()
export class AuthenticationMiddleware implements ProxyMiddlewareHandler {
    async handle(routerDetail: RouterDetail, request: IncomingMessage, proxyRequest: ProxyRequest): Promise<boolean> {
        proxyRequest.addHeaders({ 'auth-user-id': '123' });
        return true;
    }
}
