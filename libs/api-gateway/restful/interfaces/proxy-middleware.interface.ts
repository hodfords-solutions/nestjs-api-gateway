import { RouterDetail } from '../../index';
import { IncomingMessage } from 'http';
import { ProxyRequest } from '../models/proxy-request.model';

export interface ProxyMiddlewareHandler {
    handle(
        routerDetail: RouterDetail,
        request: IncomingMessage,
        proxyRequest: ProxyRequest
    ): Promise<boolean> | boolean;
}
