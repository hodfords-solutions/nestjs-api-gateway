import { Controller, Get } from '@nestjs/common';
import { OpenApiService } from '@hodfords/api-gateway';

@Controller()
export class AppController {
    constructor(private openApiService: OpenApiService) {}

    @Get()
    index(): string {
        return 'API Gateway';
    }

    @Get('test')
    document(): any {
        return this.openApiService.apiDocs;
    }
}
