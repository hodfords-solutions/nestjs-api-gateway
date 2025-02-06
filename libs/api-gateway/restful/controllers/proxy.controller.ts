import { All, Controller, Req, Res } from '@nestjs/common';
import { ProxyService } from '../services/proxy.service';

@Controller()
export class ProxyController {
    constructor(private proxyService: ProxyService) {}

    @All('/{*splat}')
    async proxy(@Req() req, @Res() res): Promise<void> {
        await this.proxyService.handleRequest(req, res);
    }
}
