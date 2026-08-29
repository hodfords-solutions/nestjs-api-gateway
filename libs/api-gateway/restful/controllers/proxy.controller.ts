import { All, Controller, Req, Res } from '@nestjs/common';
import { ProxyService } from '../services/proxy.service.js';
import { Request, Response } from 'express';

@Controller()
export class ProxyController {
    constructor(private proxyService: ProxyService) {}

    @All('/{*splat}')
    async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
        await this.proxyService.handleRequest(req, res);
    }
}
