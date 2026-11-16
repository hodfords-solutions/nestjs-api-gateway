import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { ModulesContainer } from '@nestjs/core';
import { getProviderByMetadata } from '../helpers/provider.helper.js';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant.js';
import { ApiGatewayOption } from '../../types/api-gateway-option.type.js';
import { WsProxyMiddlewareHandler } from '../interfaces/ws-proxy-middleware.interface.js';
import { WS_PROXY_MIDDLEWARE } from '../decorators/ws-proxy-middleware.decorator.js';
import { ProxyRequest } from '../models/proxy-request.model.js';
import { stripExcludedHeaders } from '../helpers/request-sanitizer.helper.js';

@Injectable()
export class WsRequestService implements OnModuleInit {
    private headerHandlers: WsProxyMiddlewareHandler[] = [];

    constructor(
        private modulesContainer: ModulesContainer,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    onModuleInit(): any {
        this.headerHandlers = getProviderByMetadata(WS_PROXY_MIDDLEWARE, this.modulesContainer);
    }

    async handle(request: IncomingMessage, proxyRequest: ProxyRequest) {
        this.removeHeaders(request, proxyRequest);
        for (const handler of this.headerHandlers) {
            if (!(await handler.handle(request, proxyRequest))) {
                return false;
            }
        }

        return true;
    }

    /**
     * Remove gateway-owned headers from the incoming upgrade request (which is forwarded as-is)
     * and from anything already staged on the proxy request.
     * @param {IncomingMessage} request The incoming request
     * @param {ProxyRequest} proxyRequest The outgoing header overrides
     */
    private removeHeaders(request: IncomingMessage, proxyRequest: ProxyRequest) {
        stripExcludedHeaders(request, this.apiGatewayOption.excludeHeaders);
        for (const excludeHeader of this.apiGatewayOption.excludeHeaders) {
            delete proxyRequest.headers[excludeHeader];
        }
    }
}
