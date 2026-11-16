import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { RouterDetail } from '../types/router-path.type.js';
import { ModulesContainer } from '@nestjs/core';
import { getProviderByMetadata } from '../helpers/provider.helper.js';
import { ProxyMiddlewareHandler } from '../interfaces/proxy-middleware.interface.js';
import { ProxyValidationHandler } from '../interfaces/proxy-validation.interface.js';
import { PROXY_VALIDATION } from '../decorators/proxy-validation.decorator.js';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant.js';
import { ApiGatewayOption } from '../../types/api-gateway-option.type.js';
import { ProxyRequest } from '../models/proxy-request.model.js';
import { PROXY_MIDDLEWARE } from '../decorators/proxy-middleware.decorator.js';
import { stripExcludedHeaders } from '../helpers/request-sanitizer.helper.js';

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

    async handle(routerDetail: RouterDetail, request: IncomingMessage, proxyRequest: ProxyRequest) {
        this.removeHeaders(request, proxyRequest);
        for (const handler of this.headerHandlers) {
            if (!(await handler.handle(routerDetail, request, proxyRequest))) {
                return false;
            }
        }

        return true;
    }

    /**
     * Remove gateway-owned headers from the incoming request (what is actually forwarded upstream)
     * and from anything already staged on the proxy request, so only the middleware chain below
     * can set them.
     * @param {IncomingMessage} request The incoming request
     * @param {ProxyRequest} proxyRequest The outgoing header overrides
     */
    private removeHeaders(request: IncomingMessage, proxyRequest: ProxyRequest) {
        stripExcludedHeaders(request, this.apiGatewayOption.excludeHeaders);
        for (const excludeHeader of this.apiGatewayOption.excludeHeaders) {
            delete proxyRequest.headers[excludeHeader];
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
