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

describe('ProxySocket upgrade head', () => {
    /**
     * Node hands over any upgraded-protocol bytes its HTTP parser consumed alongside the
     * handshake. Those bytes are already out of the stream, so they must be pushed back
     * before the sockets are piped or the first frame is lost — for a server that speaks
     * first, that is the whole handshake.
     */
    function socketDouble() {
        return {
            setTimeout: jest.fn(),
            setNoDelay: jest.fn(),
            setKeepAlive: jest.fn(),
            write: jest.fn(),
            unshift: jest.fn(),
            end: jest.fn(),
            on: jest.fn(),
            pipe: jest.fn().mockReturnValue({ pipe: jest.fn() }),
            destroyed: false
        };
    }

    function upgrade(proxyHead: Buffer, clientHead?: Buffer) {
        const clientSocket = socketDouble();
        const proxySocket = socketDouble();
        const proxySocketInstance = createProxySocket(
            { method: 'GET', url: '/socket.io/', headers: { upgrade: 'websocket' } },
            clientSocket as never
        );

        proxySocketInstance['clientHead'] = clientHead;
        proxySocketInstance['onUpgrade'](
            { headers: { upgrade: 'websocket' } } as never,
            proxySocket as never,
            proxyHead
        );

        return { clientSocket, proxySocket };
    }

    it('replays the upstream head so a server-spoken first frame survives', () => {
        const openPacket = Buffer.from('\x81\x6d0{"sid":"abc","pingInterval":25000}');
        expect(upgrade(openPacket).proxySocket.unshift).toHaveBeenCalledWith(openPacket);
    });

    it('replays the upstream head before wiring the pipes', () => {
        const { proxySocket } = upgrade(Buffer.from('frame'));
        expect(proxySocket.unshift.mock.invocationCallOrder[0]).toBeLessThan(
            proxySocket.pipe.mock.invocationCallOrder[0]
        );
    });

    it('replays the client head onto the client socket', () => {
        const clientHead = Buffer.from('early-client-frame');
        expect(upgrade(Buffer.alloc(0), clientHead).clientSocket.unshift).toHaveBeenCalledWith(clientHead);
    });

    it('does not replay an absent or empty head', () => {
        const { clientSocket, proxySocket } = upgrade(Buffer.alloc(0));
        expect(proxySocket.unshift).not.toHaveBeenCalled();
        expect(clientSocket.unshift).not.toHaveBeenCalled();
    });

    it('retains the client head handed to handleWebsocket', () => {
        const clientHead = Buffer.from('pipelined');
        const proxySocketInstance = createProxySocket(
            { method: 'GET', url: '/socket.io/', headers: { upgrade: 'websocket' } },
            socketDouble() as never
        );

        proxySocketInstance.handleWebsocket({}, clientHead);

        expect(proxySocketInstance['clientHead']).toBe(clientHead);
    });
});

describe('ProxySocket upstream idle timer', () => {
    /**
     * A socket taken from the keep-alive pool carries the agent's idle timeout, already
     * partly elapsed. That timer outlives the protocol handover, so a quiet tunnel gets
     * reclaimed mid-session. The upgrade must never use a pooled socket, and the
     * upstream socket's timeout must be cleared exactly as the client's is.
     */
    it('opts out of the keep-alive agent for the upgrade request', () => {
        const options = createProxySocket({
            method: 'GET',
            url: '/socket.io/?EIO=4&transport=websocket',
            headers: { upgrade: 'websocket' }
        }).buildRequestOptions();

        expect(options.agent).toBe(false);
    });

    it('still forwards path, method and merged headers', () => {
        const options = createProxySocket({
            method: 'GET',
            url: '/socket.io/?EIO=4',
            headers: { upgrade: 'websocket', cookie: 'a=1' }
        }).buildRequestOptions({ 'auth-user-id': 'u-1' });

        expect(options.path).toBe('/socket.io/?EIO=4');
        expect(options.method).toBe('GET');
        expect(options.headers).toMatchObject({ upgrade: 'websocket', cookie: 'a=1', 'auth-user-id': 'u-1' });
        expect(options.port).toBe('18080');
    });

    it('clears the inherited idle timeout on the upstream socket before piping', () => {
        const proxySocket = { on: jest.fn(), setTimeout: jest.fn(), unshift: jest.fn(), pipe: jest.fn() };
        proxySocket.pipe.mockReturnValue({ pipe: jest.fn() });
        const clientSocket = {
            write: jest.fn(),
            unshift: jest.fn(),
            pipe: jest.fn().mockReturnValue({ pipe: jest.fn() })
        };

        const instance = createProxySocket({ method: 'GET', url: '/', headers: {} }, clientSocket as never);
        instance['onUpgrade']({ headers: {} } as never, proxySocket as never, Buffer.alloc(0));

        expect(proxySocket.setTimeout).toHaveBeenCalledWith(0);
        expect(proxySocket.setTimeout.mock.invocationCallOrder[0]).toBeLessThan(
            proxySocket.pipe.mock.invocationCallOrder[0]
        );
    });
});
