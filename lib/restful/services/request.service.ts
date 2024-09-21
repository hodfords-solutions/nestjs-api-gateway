import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { RouterDetail } from '../types/router-path.type';
import { ModulesContainer } from '@nestjs/core';
import { getProviderByMetadata } from '../helpers/provider.helper';
import { ProxyMiddlewareHandler } from '../interfaces/proxy-middleware.interface';
import { ProxyValidationHandler } from '../interfaces/proxy-validation.interface';
import { PROXY_VALIDATION } from '../decorators/proxy-validation.decorator';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';
import { ProxyRequest } from '../models/proxy-request.model';
import { PROXY_MIDDLEWARE } from '../decorators/proxy-middleware.decorator';

@Injectable()
export class RequestService implements OnModuleInit {
    private headerHandlers: ProxyMiddlewareHandler[] = [];
    private proxyValidationHandler: ProxyValidationHandler[] = [];

    constructor(
        private modulesContainer: ModulesContainer,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    onModuleInit(): any {
        this.headerHandlers = getProviderByMetadata(PROXY_MIDDLEWARE, this.modulesContainer);
        this.proxyValidationHandler = getProviderByMetadata(PROXY_VALIDATION, this.modulesContainer);
    }

    async handle(routerDetail: RouterDetail,request: IncomingMessage,  proxyRequest: ProxyRequest) {
        this.removeHeaders(proxyRequest);
        for (const handler of this.headerHandlers) {
            if (!await handler.handle(routerDetail, request, proxyRequest)){
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

    /**
     * Check if the request is a static request
     * @param {IncomingMessage} request The request
     * @returns {boolean} True if the request is a static request
     */
    isStaticRequest(request: IncomingMessage): boolean {
        for (const handler of this.proxyValidationHandler) {
            if (handler.isStaticRequest(request)) {
                return true;
            }
        }
        return false;
    }
}
