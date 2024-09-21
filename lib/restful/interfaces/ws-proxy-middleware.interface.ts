import { IncomingMessage } from 'http';
import { ProxyRequest } from '../models/proxy-request.model';

export interface WsProxyMiddlewareHandler {
    handle(request: IncomingMessage, proxyRequest: ProxyRequest): Promise<boolean> | boolean;
}
