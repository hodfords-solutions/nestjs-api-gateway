import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { OpenApiService } from '../services/open-api.service';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';

@Controller()
export class DocumentController {
    constructor(
        private openApiService: OpenApiService,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    @Get('documents')
    @ApiOperation({ description: 'Get the Swagger document.' })
    async getDocument(@Res() response): Promise<any> {
        return response.render(
            this.apiGatewayOption.libraryPath + '/views/document.hbs',
            this.openApiService.getDocumentDetailsForUI()
        );
    }

    @Get('document-json')
    @ApiOperation({ description: 'Get the Swagger document in json format.' })
    async getDocumentJson(@Query('type') type: string): Promise<any> {
        return this.openApiService.getDocument(type);
    }
}
