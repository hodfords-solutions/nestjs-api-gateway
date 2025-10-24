import { Request } from 'express';
import { Socket } from 'node:net';
import * as http from 'node:http';
import { ProxyServerOptions } from './proxy-server-option.type';
import { IncomingMessage } from 'http';

export class ProxySocket {
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

    handleWebsocket() {
        if (!this.checkMethodAndHeader()) {
            return this.socket.destroy();
        }
        const url = new URL(this.options.host);
        const requestOptions: http.RequestOptions = {
            method: this.req.method,
            host: url.host,
            hostname: url.hostname,
            port: url.port,
            headers: this.req.headers,
            path: this.req.url
        };
        const proxyReq = http.request(requestOptions);
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
