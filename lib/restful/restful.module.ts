import { Module } from '@nestjs/common';
import { ProxyController } from './controllers/proxy.controller';
import { HttpModule } from '@nestjs/axios';
import { ProxyService } from './services/proxy.service';
import { OpenApiService } from './services/open-api.service';
import { RequestService } from './services/request.service';
import { DocumentController } from './controllers/document.controller';
import { UpdateApiDocumentTask } from './tasks/update-api-document.task';
import { WsRequestService } from './services/ws-request.service';

@Module({
    imports: [HttpModule],
    controllers: [DocumentController, ProxyController],
    providers: [ProxyService, OpenApiService, RequestService, WsRequestService, UpdateApiDocumentTask]
})
export class RestfulModule {}
