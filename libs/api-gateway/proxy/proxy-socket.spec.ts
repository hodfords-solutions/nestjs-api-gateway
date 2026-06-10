import { Request } from 'express';
import { Socket } from 'node:net';
import { ProxySocket } from './proxy-socket';

function createProxySocket(request: Partial<Request>, socket: Partial<Socket> = {}): ProxySocket {
    return new ProxySocket(request as Request, socket as Socket, { host: 'http://localhost:18080' });
}

describe('ProxySocket.checkMethodAndHeader', () => {
    it('accepts a GET request with a websocket upgrade header', () => {
        const proxySocket = createProxySocket({ method: 'GET', headers: { upgrade: 'websocket' } });
        expect(proxySocket.checkMethodAndHeader()).toBe(true);
    });

    it('accepts a case-insensitive upgrade value', () => {
        const proxySocket = createProxySocket({ method: 'GET', headers: { upgrade: 'WebSocket' } });
        expect(proxySocket.checkMethodAndHeader()).toBe(true);
    });

    it('rejects non-GET methods', () => {
        const proxySocket = createProxySocket({ method: 'POST', headers: { upgrade: 'websocket' } });
        expect(proxySocket.checkMethodAndHeader()).toBe(false);
    });

    it('rejects a missing or non-websocket upgrade header', () => {
        expect(createProxySocket({ method: 'GET', headers: {} }).checkMethodAndHeader()).toBe(false);
        expect(createProxySocket({ method: 'GET', headers: { upgrade: 'h2c' } }).checkMethodAndHeader()).toBe(false);
    });

    it('destroys the socket when handling an invalid upgrade request', () => {
        const destroy = jest.fn();
        const proxySocket = createProxySocket({ method: 'POST', headers: {} }, { destroy } as never);
        proxySocket.handleWebsocket();
        expect(destroy).toHaveBeenCalled();
    });
});

describe('ProxySocket.createHttpHeader', () => {
    it('serializes scalar headers after the status line', () => {
        const proxySocket = createProxySocket({});
        const head = proxySocket.createHttpHeader('HTTP/1.1 101 Switching Protocols', {
            upgrade: 'websocket',
            connection: 'Upgrade'
        });
        expect(head).toBe('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n');
    });

    it('repeats array header values on separate lines', () => {
        const proxySocket = createProxySocket({});
        const head = proxySocket.createHttpHeader('HTTP/1.1 200 OK', { 'set-cookie': ['a=1', 'b=2'] } as never);
        expect(head).toBe('HTTP/1.1 200 OK\r\nset-cookie: a=1\r\nset-cookie: b=2\r\n\r\n');
    });

    it('terminates an empty header set correctly', () => {
        const proxySocket = createProxySocket({});
        expect(proxySocket.createHttpHeader('HTTP/1.1 200 OK', {})).toBe('HTTP/1.1 200 OK\r\n\r\n');
    });
});
