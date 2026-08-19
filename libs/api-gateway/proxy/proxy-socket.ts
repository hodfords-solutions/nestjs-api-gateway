import { Request } from 'express';
import { Socket } from 'node:net';
import * as http from 'node:http';
import { ProxyServerOptions } from './proxy-server-option.type';
import { IncomingMessage } from 'http';

export class ProxySocket {
    /** Bytes of the upgraded protocol that the HTTP parser consumed alongside the client handshake. */
    private clientHead?: Buffer;

    constructor(
        private req: Request,
        private socket: Socket,
        private options: ProxyServerOptions
    ) {}

    checkMethodAndHeader() {
        return !(
            this.req.method !== 'GET' ||
            !this.req.headers.upgrade ||
            this.req.headers.upgrade.toLowerCase() !== 'websocket'
        );
    }

    createHttpHeader(line: string, headers: http.IncomingHttpHeaders) {
        return (
            Object.keys(headers)
                .reduce(
                    (head, key) => {
                        const value = headers[key];

                        if (!Array.isArray(value)) {
                            head.push(key + ': ' + value);
                            return head;
                        }

                        for (let i = 0; i < value.length; i++) {
                            head.push(key + ': ' + value[i]);
                        }
                        return head;
                    },
                    [line]
                )
                .join('\r\n') + '\r\n\r\n'
        );
    }

    buildRequestOptions(extraHeaders: NodeJS.Dict<string> = {}): http.RequestOptions {
        const url = new URL(this.options.host);

        return {
            method: this.req.method,
            host: url.host,
            hostname: url.hostname,
            port: url.port,
            headers: {
                ...this.req.headers,
                ...extraHeaders
            },
            path: this.req.url,
            // Never borrow a socket from the keep-alive pool for an upgrade. A pooled
            // socket arrives with the agent's idle timeout already armed and partly
            // elapsed, and that timer survives the handover to the upgraded protocol —
            // the tunnel then dies mid-session once the peers go quiet, which for
            // Engine.IO is the 25s gap between pings. An upgrade needs a socket the
            // agent will never reclaim.
            agent: false
        };
    }

    handleWebsocket(extraHeaders: NodeJS.Dict<string> = {}, head?: Buffer) {
        if (!this.checkMethodAndHeader()) {
            return this.socket.destroy();
        }
        this.clientHead = head;
        const proxyReq = http.request(this.buildRequestOptions(extraHeaders));
        this.socket.setTimeout(0);
        this.socket.setNoDelay(true);
        this.socket.setKeepAlive(true, 0);

        proxyReq.on('error', (err: Error) => {
            if (!this.socket.destroyed) {
                this.socket.end();
            }
        });

        proxyReq.on('upgrade', (proxyRes: Request, proxySocket: Socket, proxyHead: Buffer) => {
            this.onUpgrade(proxyRes, proxySocket, proxyHead);
        });

        proxyReq.on('response', (proxyRes) => this.onResponse(proxyRes));
        proxyReq.end();
    }

    private onUpgrade(proxyRes: Request, proxySocket: Socket, proxyHead: Buffer) {
        proxySocket.on('close', () => {
            this.socket.end();
        });

        // Node's HTTP parser reads in whole chunks, so bytes belonging to the upgraded
        // protocol can be consumed along with the handshake and handed over as a head
        // buffer. They are already out of the stream, so piping alone would drop them —
        // push each head back to the front of its socket before the pipes are wired.
        // Servers that speak first (Engine.IO sends its OPEN packet immediately) lose
        // that first frame otherwise, leaving a connection that looks live but never
        // completes its handshake.
        // The client socket is cleared the same way in handleWebsocket; do the same
        // upstream so no inherited idle timer can reclaim the tunnel.
        proxySocket.setTimeout(0);

        if (proxyHead?.length) {
            proxySocket.unshift(proxyHead);
        }

        if (this.clientHead?.length) {
            this.socket.unshift(this.clientHead);
        }

        this.socket.write(this.createHttpHeader('HTTP/1.1 101 Switching Protocols', proxyRes.headers));

        proxySocket.pipe(this.socket).pipe(proxySocket);
    }

    private onResponse(proxyRes: IncomingMessage) {
        const headers: NodeJS.Dict<string> = {};
        let writeChunk = (chunk: Buffer | string) => {
            this.socket.write(chunk);
        };
        if (this.req.httpVersion === '1.1' && proxyRes.headers['content-length'] === undefined) {
            headers['transfer-encoding'] = 'chunked';
            writeChunk = (chunk: Buffer | string) => {
                this.socket.write(chunk.length.toString(16));
                this.socket.write('\r\n');
                this.socket.write(chunk);
                this.socket.write('\r\n');
            };
        }

        const proxyHead = this.createHttpHeader(
            `HTTP/${this.req.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}`,
            headers
        );
        if (!this.socket.destroyed) {
            this.socket.write(proxyHead);
            proxyRes.on('data', (chunk) => {
                writeChunk(chunk);
            });
            proxyRes.on('end', () => {
                writeChunk('');
                this.socket.destroySoon();
            });
        } else {
            // make sure response is consumed
            proxyRes.resume();
        }
    }
}
