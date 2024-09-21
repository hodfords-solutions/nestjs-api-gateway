import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { kebabConvertKeys } from '../helpers/object.helper';
import { ModulesContainer } from '@nestjs/core';
import { getProviderByMetadata } from '../helpers/provider.helper';
import { WS_HEADER_HANDLER } from '../decorators/ws-header-handler.decorator';
import { WsHeaderHandlerInterface } from '../interfaces/ws-header-handler.interface';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';

@Injectable()
export class WsRequestService implements OnModuleInit {
    private headerHandlers: WsHeaderHandlerInterface[] = [];

    constructor(
        private modulesContainer: ModulesContainer,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    onModuleInit(): any {
        this.headerHandlers = getProviderByMetadata(WS_HEADER_HANDLER, this.modulesContainer);
    }

    /**
     * Get headers of a request and convert to kebab-case
     * @param {IncomingMessage} request The request
     * @returns {Promise<NodeJS.Dict<string>>} Object contains header detail
     */
    async getHeader(request: IncomingMessage): Promise<NodeJS.Dict<string>> {
        const headers = {};
        for (const excludeHeader of this.apiGatewayOption.excludeHeaders) {
            if (request.headers[excludeHeader]) {
                request.headers[excludeHeader] = '';
            }
        }
        for (const handler of this.headerHandlers) {
            const newHeaders = await handler.handle(request);
            Object.assign(headers, newHeaders);
        }
        return kebabConvertKeys<NodeJS.Dict<string>>(headers);
    }
}
