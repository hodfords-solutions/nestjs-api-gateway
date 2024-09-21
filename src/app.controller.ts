import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
    @Get()
    INDEX(): string {
        return 'API Gateway';
    }
}
