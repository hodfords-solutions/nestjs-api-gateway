// camelcase-keys (pulled in transitively via open-api.service) is ESM-only and is not
// transformed by @swc/jest; it is unused on the code paths under test, so stub it out.
jest.mock('camelcase-keys', () => ({ __esModule: true, default: (value: unknown) => value }));

import * as http from 'node:http';
import * as net from 'node:net';
import { once } from 'node:events';
import { ProxyService } from './proxy.service';

/**
 * A peer resetting its TCP connection is routine for WebSocket clients (network switch, app
 * killed). Node strips the HTTP layer's error listeners from an upgraded socket, so an
 * unhandled reset becomes an uncaught exception that takes the whole gateway down.
 * These run over real sockets because a reset is only observable on a live connection.
 */
describe('ProxyService websocket connection resets', () => {
    let upstreamServer: http.Server;
    let gatewayServer: http.Server;
    let upstreamSocket: net.Socket;
    let gatewaySideClientSocket: net.Socket;
    let authorize: jest.Mock<Promise<boolean>>;
    const openSockets: net.Socket[] = [];

    function listen(server: http.Server): Promise<number> {
        return new Promise((resolve) =>
            server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port))
        );
    }

    function track(socket: net.Socket): net.Socket {
        openSockets.push(socket);
        return socket;
    }

    async function connectClient(): Promise<net.Socket> {
        const client = track(net.connect((gatewayServer.address() as net.AddressInfo).port, '127.0.0.1'));
        client.on('error', () => {});
        await once(client, 'connect');
        client.write(
            'GET /socket/socket.io/?EIO=4&transport=websocket HTTP/1.1\r\n' +
                'Host: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
        );
        return client;
    }

    async function openTunnel(): Promise<net.Socket> {
        const client = await connectClient();
        await once(client, 'data');
        return client;
    }

    beforeEach(async () => {
        upstreamServer = http.createServer();
        upstreamServer.on('upgrade', (_request, socket: net.Socket) => {
            upstreamSocket = track(socket);
            upstreamSocket.on('error', () => {});
            // Like a real WebSocket server, close once the gateway ends its half.
            upstreamSocket.on('end', () => socket.end());
            socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
        });
        const upstreamPort = await listen(upstreamServer);

        gatewayServer = http.createServer();
        authorize = jest.fn().mockResolvedValue(true);
        const service = new ProxyService(
            {
                apiDocs: { socket: {} },
                getServiceDetail: jest.fn().mockResolvedValue(undefined),
                markInitialLoadComplete: jest.fn()
            } as never,
            {} as never,
            { handle: authorize } as never,
            {} as never,
            { httpAdapter: { getHttpServer: () => gatewayServer } } as never,
            { apiServices: [{ prefix: 'socket', host: `http://127.0.0.1:${upstreamPort}` }], pool: {} } as never
        );
        service.onModuleInit();
        gatewayServer.on('upgrade', (_request, socket: net.Socket) => {
            gatewaySideClientSocket = track(socket);
        });
        await listen(gatewayServer);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        openSockets.splice(0).forEach((socket) => socket.destroy());
        await Promise.all([
            new Promise((resolve) => gatewayServer.close(resolve)),
            new Promise((resolve) => upstreamServer.close(resolve))
        ]);
    });

    it('survives a client reset mid-tunnel and closes the upstream side', async () => {
        const client = await openTunnel();
        const upstreamClosed = once(upstreamSocket, 'close');

        client.resetAndDestroy();

        await upstreamClosed;
    });

    it('survives an upstream reset mid-tunnel and closes the client', async () => {
        const client = await openTunnel();
        const clientClosed = once(client, 'close');

        upstreamSocket.resetAndDestroy();

        await clientClosed;
    });

    it('survives a client reset while the upgrade is still being authorized', async () => {
        let finishAuthorization: (authorized: boolean) => void;
        authorize.mockReturnValue(new Promise((resolve) => (finishAuthorization = resolve)));
        const client = await connectClient();
        while (!authorize.mock.calls.length) {
            await new Promise((resolve) => setImmediate(resolve));
        }
        const gatewaySideClosed = new Promise((resolve) => gatewaySideClientSocket.on('close', resolve));
        jest.spyOn(console, 'error').mockImplementation(() => {});

        client.resetAndDestroy();

        await gatewaySideClosed;
        finishAuthorization(false);
    });
});
