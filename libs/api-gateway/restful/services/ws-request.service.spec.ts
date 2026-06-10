import { IncomingMessage } from 'http';
import { ModulesContainer } from '@nestjs/core';
import { WsRequestService } from './ws-request.service';
import { ProxyRequest } from '../models/proxy-request.model';

function createService(excludeHeaders: string[] = []): WsRequestService {
    return new WsRequestService(new Map() as unknown as ModulesContainer, { excludeHeaders } as never);
}

const asInternal = (service: WsRequestService): { headerHandlers: unknown[] } => service as never;

const request = {} as IncomingMessage;

describe('WsRequestService.handle', () => {
    it('returns true when there are no handlers', async () => {
        await expect(createService().handle(request, new ProxyRequest())).resolves.toBe(true);
    });

    it('returns false when a handler rejects the upgrade', async () => {
        const service = createService();
        asInternal(service).headerHandlers = [{ handle: jest.fn(async () => false) }];
        await expect(service.handle(request, new ProxyRequest())).resolves.toBe(false);
    });

    it('passes the proxy request through each handler', async () => {
        const service = createService();
        asInternal(service).headerHandlers = [
            {
                handle: jest.fn(async (_req: IncomingMessage, proxyRequest: ProxyRequest) => {
                    proxyRequest.addHeader('authUserId', '123');
                    return true;
                })
            }
        ];
        const proxyRequest = new ProxyRequest();
        await expect(service.handle(request, proxyRequest)).resolves.toBe(true);
        expect(proxyRequest.headers.authUserId).toBe('123');
    });

    it('blanks excluded headers that are already present on the proxy request', async () => {
        const service = createService(['auth-user-id']);
        const proxyRequest = new ProxyRequest();
        proxyRequest.addHeader('auth-user-id', 'spoofed');

        await service.handle(request, proxyRequest);
        expect(proxyRequest.headers['auth-user-id']).toBe('');
    });
});
