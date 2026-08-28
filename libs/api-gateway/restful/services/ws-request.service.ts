import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { ModulesContainer } from '@nestjs/core';
import { getProviderByMetadata } from '../helpers/provider.helper.js';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant.js';
import { ApiGatewayOption } from '../../types/api-gateway-option.type.js';
import { WsProxyMiddlewareHandler } from '../interfaces/ws-proxy-middleware.interface.js';
import { WS_PROXY_MIDDLEWARE } from '../decorators/ws-proxy-middleware.decorator.js';
import { ProxyRequest } from '../models/proxy-request.model.js';

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
        this.removeHeaders(proxyRequest);
        for (const handler of this.headerHandlers) {
            if (!(await handler.handle(request, proxyRequest))) {
                return false;
            }
        }

        return true;
    }

    private removeHeaders(proxyRequest: ProxyRequest) {
        for (const excludeHeader of this.apiGatewayOption.excludeHeaders) {
            if (proxyRequest.headers[excludeHeader]) {
                proxyRequest.headers[excludeHeader] = '';
            }
        }
    }
}
