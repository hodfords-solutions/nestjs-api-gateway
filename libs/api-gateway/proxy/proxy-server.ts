import { Dispatcher, Pool } from 'undici';
import { IncomingHttpHeaders, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { pipeline } from 'stream/promises';
import { Request } from 'express';
import RequestOptions = Dispatcher.RequestOptions;
import { ProxyServerOptions } from './proxy-server-option.type';
import { Socket } from 'node:net';
import { ProxySocket } from './proxy-socket';

const hopByHopHeaders = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade'
]);

export class ProxyServer {
    private pool: Pool;
    constructor(private options: ProxyServerOptions) {
        this.pool = new Pool(options.host, options.pool);
    }

    removeHopByHopHeader(headers: IncomingHttpHeaders | OutgoingHttpHeaders) {
        const newHeaders = new Map<string, string | string[]>();
        for (const key in headers) {
            if (!hopByHopHeaders.has(key.toLowerCase())) {
                newHeaders.set(key, headers[key] as string | string[]);
            }
        }

        return newHeaders;
    }

    getRequestHeaders(req: Request, customHeaders?: NodeJS.Dict<string>) {
        const requestHeaders = this.removeHopByHopHeader(req.headers);
        // Add x-forwarded-* headers
        if (req.headers['x-forwarded-for']) {
            const xff = req.headers['x-forwarded-for'];
            if (typeof xff === 'string') {
                requestHeaders.set('x-forwarded-for', xff + ', ' + (req.socket.remoteAddress || ''));
            } else if (Array.isArray(xff)) {
                requestHeaders.set('x-forwarded-for', xff.join(', ') + ', ' + (req.socket.remoteAddress || ''));
            }
        } else {
            requestHeaders.set('x-forwarded-for', req.socket.remoteAddress || '');
        }
        if ((req.method === 'DELETE' || req.method === 'OPTIONS') && !req.headers['content-length']) {
            requestHeaders.set('content-length', '0');
        }
        if (customHeaders) {
            Object.keys(customHeaders).forEach((key: string) => {
                requestHeaders.set(key, customHeaders[key]);
            });
        }

        return requestHeaders;
    }

    async forwardWebsocket(
        req: Request,
        socket: Socket,
        options: { headers?: NodeJS.Dict<string>; head?: Buffer } = {}
    ) {
        const target = new ProxySocket(req, socket, this.options);
        target.handleWebsocket(options.headers, options.head);
    }

    async forwardRequest(req: Request, res: ServerResponse, options: { headers?: NodeJS.Dict<string> } = {}) {
        try {
            const abortController = new AbortController();
            const proxyRequestOptions: RequestOptions = {
                path: req.path,
                method: req.method,
                query: req.query,
                headers: this.getRequestHeaders(req, options.headers),
                body: req,
                signal: abortController.signal
            };
            if (this.options.rewritePath) {
                proxyRequestOptions.path = this.options.rewritePath(req);
            }

            res.on('close', () => {
                const aborted = !res.writableFinished;
                if (aborted) {
                    abortController.abort();
                }
            });

            const response = await this.pool.request(proxyRequestOptions);
            const { statusCode, headers, body } = response;
            res.statusCode = statusCode;
            res.setHeaders(this.removeHopByHopHeader(headers));
            if (this.options.responseHandler) {
                this.options.responseHandler(response, req, res);
            }
            await pipeline(body, res);
        } catch (error) {
            if (this.options.errorHandler) {
                this.options.errorHandler(error, req, res);
            } else {
                throw error;
            }
        }
    }
}
