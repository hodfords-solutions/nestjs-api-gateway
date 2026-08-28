import { RouterDetail } from '../../index.js';
import { IncomingMessage } from 'http';
import { ProxyRequest } from '../models/proxy-request.model.js';

export interface ProxyMiddlewareHandler {
    handle(
        routerDetail: RouterDetail,
        request: IncomingMessage,
        proxyRequest: ProxyRequest
    ): Promise<boolean> | boolean;
}
