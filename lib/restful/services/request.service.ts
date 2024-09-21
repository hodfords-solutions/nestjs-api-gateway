import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { RouterDetail } from '../types/router-path.type';
import { kebabConvertKeys } from '../helpers/object.helper';
import { ModulesContainer } from '@nestjs/core';
import { HEADER_HANDLER } from '../decorators/header-handler.decorator';
import { getProviderByMetadata } from '../helpers/provider.helper';
import { HeaderHandlerInterface } from '../interfaces/header-handler.interface';
import { ProxyValidationInterface } from '../interfaces/proxy-validation.interface';
import { PROXY_VALIDATION } from '../decorators/proxy-validation.decorator';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';

@Injectable()
export class RequestService implements OnModuleInit {
    private headerHandlers: HeaderHandlerInterface[] = [];
    private proxyValidationHandler: ProxyValidationInterface[] = [];

    constructor(
        private modulesContainer: ModulesContainer,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    onModuleInit(): any {
        this.headerHandlers = getProviderByMetadata(HEADER_HANDLER, this.modulesContainer);
        this.proxyValidationHandler = getProviderByMetadata(PROXY_VALIDATION, this.modulesContainer);
    }

    /**
     * Get headers of a request and convert to kebab-case
     * @param {RouterDetail} routerDetail Detail of router
     * @param {IncomingMessage} request The request
     * @returns {Promise<NodeJS.Dict<string>>} Object contains header detail
     */
    async getHeader(routerDetail: RouterDetail, request: IncomingMessage): Promise<NodeJS.Dict<string>> {
        const headers = {};
        for (const excludeHeader of this.apiGatewayOption.excludeHeaders) {
            if (request.headers[excludeHeader]) {
                request.headers[excludeHeader] = '';
            }
        }
        for (const handler of this.headerHandlers) {
            const newHeaders = await handler.handle(routerDetail, request);
            Object.assign(headers, newHeaders);
        }
        return kebabConvertKeys<NodeJS.Dict<string>>(headers);
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
