import { IncomingMessage } from 'http';
import { ModulesContainer } from '@nestjs/core';
import { RequestService } from './request.service';
import { ProxyRequest } from '../models/proxy-request.model';
import { RouterDetail } from '../types/router-path.type';

function createService(excludeHeaders: string[] = []): RequestService {
    return new RequestService(new Map() as unknown as ModulesContainer, { excludeHeaders } as never);
}

const asInternal = (service: RequestService): { headerHandlers: unknown[]; proxyValidationHandler: unknown[] } =>
    service as never;

const routerDetail = {} as RouterDetail;
const request = {} as IncomingMessage;

describe('RequestService.handle', () => {
    it('returns true when there are no handlers', async () => {
        const service = createService();
        await expect(service.handle(routerDetail, request, new ProxyRequest())).resolves.toBe(true);
    });

    it('runs handlers in order and returns true when all pass', async () => {
        const service = createService();
        const calls: string[] = [];
        asInternal(service).headerHandlers = [
            { handle: jest.fn(async () => calls.push('first') && true) },
            { handle: jest.fn(async () => calls.push('second') && true) }
        ];

        await expect(service.handle(routerDetail, request, new ProxyRequest())).resolves.toBe(true);
        expect(calls).toEqual(['first', 'second']);
    });

    it('short-circuits and returns false when a handler rejects the request', async () => {
        const service = createService();
        const second = jest.fn(async () => true);
        asInternal(service).headerHandlers = [{ handle: jest.fn(async () => false) }, { handle: second }];

        await expect(service.handle(routerDetail, request, new ProxyRequest())).resolves.toBe(false);
        expect(second).not.toHaveBeenCalled();
    });

    it('blanks excluded headers that are already present on the proxy request', async () => {
        const service = createService(['auth-user-id']);
        const proxyRequest = new ProxyRequest();
        proxyRequest.addHeader('auth-user-id', 'spoofed');
        proxyRequest.addHeader('x-keep', 'yes');

        await service.handle(routerDetail, request, proxyRequest);

        expect(proxyRequest.headers['auth-user-id']).toBe('');
        expect(proxyRequest.headers['x-keep']).toBe('yes');
    });
});

describe('RequestService.isStaticRequest', () => {
    it('returns false when no validation handlers are registered', () => {
        expect(createService().isStaticRequest(request)).toBe(false);
    });

    it('returns true as soon as one handler claims the request is static', () => {
        const service = createService();
        asInternal(service).proxyValidationHandler = [
            { isStaticRequest: () => false },
            { isStaticRequest: () => true }
        ];
        expect(service.isStaticRequest(request)).toBe(true);
    });

    it('returns false when every handler declines', () => {
        const service = createService();
        asInternal(service).proxyValidationHandler = [{ isStaticRequest: () => false }];
        expect(service.isStaticRequest(request)).toBe(false);
    });
});
