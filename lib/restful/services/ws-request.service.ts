import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { kebabConvertKeys } from '../helpers/object.helper';
import { ModulesContainer } from '@nestjs/core';
import { getProviderByMetadata } from '../helpers/provider.helper';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';
import { WsProxyMiddlewareHandler } from '../interfaces/ws-proxy-middleware.interface';
import { WS_PROXY_MIDDLEWARE } from '../decorators/ws-proxy-middleware.decorator';
import { ProxyRequest } from '../models/proxy-request.model';

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

    async handle(request: IncomingMessage,  proxyRequest: ProxyRequest) {
        this.removeHeaders(proxyRequest);
        for (const handler of this.headerHandlers) {
            if (!await handler.handle(request, proxyRequest)){
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
