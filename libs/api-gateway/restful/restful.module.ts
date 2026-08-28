import { DynamicModule, Module } from '@nestjs/common';
import { ProxyController } from './controllers/proxy.controller.js';
import { HttpModule } from '@nestjs/axios';
import { ProxyService } from './services/proxy.service.js';
import { OpenApiService } from './services/open-api.service.js';
import { RequestService } from './services/request.service.js';
import { DocumentController } from './controllers/document.controller.js';
import { UpdateApiDocumentTask } from './tasks/update-api-document.task.js';
import { WsRequestService } from './services/ws-request.service.js';
import { RestfulOption } from './types/restful-option.type.js';

@Module({})
export class RestfulModule {
    static forRoot(option: RestfulOption): DynamicModule {
        return {
            global: true,
            module: RestfulModule,
            imports: [HttpModule],
            controllers: [...(option.isEnableDocument ? [DocumentController] : []), ProxyController],
            providers: [ProxyService, OpenApiService, RequestService, WsRequestService, UpdateApiDocumentTask],
            exports: [OpenApiService, RequestService]
        };
    }
}
