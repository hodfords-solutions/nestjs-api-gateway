import { Controller, Get, Req } from '@nestjs/common';
import { OpenApiService } from '../libs/api-gateway/index.js';
import { ApiRateLimit } from '../libs/client/index.js';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('app')
@Controller()
export class AppController {
    constructor(private openApiService: OpenApiService) {}

    @Get()
    @ApiRateLimit(5, 60, 200)
    @ApiOperation({ summary: 'Health/root endpoint', description: 'Returns the API Gateway banner string.' })
    @ApiOkResponse({ description: 'Plain-text banner', schema: { type: 'string', example: 'API Gateway' } })
    index(): string {
        return 'API Gateway: ' + Math.floor(Math.random() * 1000).toString();
    }

    @Get('test')
    @ApiOperation({
        summary: 'Aggregated OpenAPI document',
        description: 'Returns the merged OpenAPI document built from all downstream API services.'
    })
    @ApiOkResponse({ description: 'Merged OpenAPI document', schema: { type: 'object', additionalProperties: true } })
    document(): any {
        return this.openApiService.apiDocs;
    }

    @Get('oauth/metadata')
    @ApiRateLimit(5, 60, 200)
    oauth(@Req() request): string {
        return 'Oauth: ' + request.url;
    }
}
