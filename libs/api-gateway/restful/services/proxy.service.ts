import {
    ForbiddenException,
    HttpStatus,
    Inject,
    Injectable,
    Logger,
    MethodNotAllowedException,
    OnModuleInit,
    ServiceUnavailableException
} from '@nestjs/common';
import { OpenApiService } from './open-api.service';
import { ApiServiceDetail } from '../types/api-service.type';
import { Request, Response } from 'express';
import { RequestService } from './request.service';
import { ThrottlerService } from '../../throttlers/services/throttler.service';
import { DEFAULT_SERVER_NAME } from '../constants/default-server-name.constant';
import { HttpAdapterHost } from '@nestjs/core';
import { Socket } from 'node:net';
import { WsRequestService } from './ws-request.service';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';
import { ProxyRequest } from '../models/proxy-request.model';
import { isReqUrlInWhitelist } from '../helpers/whitelist.helper';
import { matchesPrefixSegment } from '../helpers/prefix.helper';
import { ProxyServer } from '../../proxy/proxy-server';
import { Dispatcher } from 'undici';
import ResponseData = Dispatcher.ResponseData;

@Injectable()
export class ProxyService implements OnModuleInit {
    private logger = new Logger(ProxyService.name);
    private proxyServers: { [key in string]: ProxyServer } = {};
    private prefixServers: string[] = [];
    private directPrefixServers: string[] = [];
    private directPrefixOwner: { [key in string]: string } = {};
    private hasDefaultServer: boolean = false;

    constructor(
        private swaggerService: OpenApiService,
        private requestService: RequestService,
        private wsRequestService: WsRequestService,
        private throttlerService: ThrottlerService,
        private adapterHost: HttpAdapterHost,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    /**
     * Initializes API services and sets up a WebSocket handler when the module is initialized
     */
    onModuleInit(): void {
        const serverInstance = this.adapterHost.httpAdapter;
        serverInstance.getHttpServer().on('upgrade', async (request, socket, head) => {
            try {
                await this.handleWebSocketRequest(request, socket, head);
            } catch (e) {
                console.error(e);
            }
        });

        const initialLoads: Promise<void>[] = [];
        for (const apiService of this.apiGatewayOption.apiServices) {
            if (apiService.prefix === DEFAULT_SERVER_NAME) {
                this.hasDefaultServer = true;
            }
            initialLoads.push(
                this.swaggerService
                    .getServiceDetail(apiService)
                    .then(() => {
                        this.logger.log(`Start ${apiService.prefix} successfully.`);
                    })
                    .catch((error) => {
                        console.error(error);
                        this.logger.error(`Start ${apiService.prefix} failed. ${error.message}`);
                    })
            );
            this.prefixServers.push(apiService.prefix);
            this.registerDirectPrefixes(apiService);
            this.createProxyServer(apiService);
        }

        // Signal readiness once every service's initial document load has settled,
        // without blocking the rest of the module initialization.
        Promise.allSettled(initialLoads).then(() => this.swaggerService.markInitialLoadComplete());
    }

    /**
     * Register a service's direct prefixes against the service's normal prefix.
     * Direct prefixes are forwarded to the owning service WITHOUT being stripped.
     * On a cross-service collision the first service in configuration order wins.
     * @param {ApiServiceDetail} apiService API Service Detail
     */
    private registerDirectPrefixes(apiService: ApiServiceDetail): void {
        for (const directPrefix of apiService.directPrefixes ?? []) {
            if (this.directPrefixOwner[directPrefix] === undefined) {
                this.directPrefixOwner[directPrefix] = apiService.prefix;
                this.directPrefixServers.push(directPrefix);
            }
        }
    }

    /**
     * Determine whether a request URL belongs to a configured direct prefix
     * (matched on a whole-path-segment basis).
     * @param {string} url A URL
     * @returns {boolean} Whether the URL is a direct-prefix request
     */
    private isDirectPrefixRequest(url: string): boolean {
        return this.directPrefixServers.some((directPrefix) => matchesPrefixSegment(url, directPrefix));
    }

    /**
     * Set up a proxy server for a given API service, handling both HTTP and WebSocket requests,
     * configure the proxy to forward requests to the target service
     * and also manages error handling and request modification
     * @param {ApiServiceDetail} apiService API Service Detail
     */
    private createProxyServer(apiService: ApiServiceDetail): void {
        this.proxyServers[apiService.prefix] = new ProxyServer({
            host: apiService.host,
            enableWs: true,
            pool: this.apiGatewayOption.pool,
            errorHandler: this.handleProxyError.bind(this),
            responseHandler: (proxyRes, req) => this.handleProxyResponse(apiService, proxyRes, req),
            rewritePath: (request) => this.rewritePath(request, apiService.prefix)
        });
    }

    handleProxyResponse(apiService: ApiServiceDetail, proxyRes: ResponseData, req: Request): void {
        if (
            proxyRes.statusCode >= 300 &&
            proxyRes.statusCode < 400 &&
            !isReqUrlInWhitelist(req.url, this.apiGatewayOption.bypassRoutePrefixes || []) &&
            !this.isDirectPrefixRequest(req.url)
        ) {
            proxyRes.headers.location = '/' + apiService.prefix + proxyRes.headers.location;
        }
    }

    handleProxyError(error: Error, req: Request, res: Response): void {
        if (res.writableEnded) {
            this.logger.error(`Error: ${error.message}`);
            return;
        }
        const errorResponse = {
            message: 'Service unavailable.'
        };
        // eslint-disable-next-line @typescript-eslint/naming-convention
        res.writeHead(HttpStatus.SERVICE_UNAVAILABLE, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
    }

    /**
     * Modify the path of an incoming request by removing a specific prefix from it
     * @param {ClientRequest} request A request
     * @param {string} prefix A prefix
     */
    private rewritePath(request: Request, prefix: string): string {
        const newPath = this.removePath(prefix, request.path);
        const url = new URL(newPath, 'http://dummy-base.local');
        if (!url.pathname.endsWith('/') && !this.requestService.isStaticRequest(request)) {
            url.pathname += '/';
        }
        return url.pathname + url.search;
    }

    /**
     * Remove the specified prefix from the URL, but only when it is the LEADING path segment.
     * Direct-prefix requests (whose path does not begin with the service's normal prefix) are
     * therefore left untouched, preserving their prefix on forward.
     * @param {string} prefix A Prefix
     * @param {string} url A URL
     * @returns {string} The URL is properly cleaned up before being forwarded to a backend service
     */
    private removePath(prefix: string, url: string): string {
        const base = `/${prefix}`;
        if (url === base) {
            return '/';
        }
        const next = url.charAt(base.length);
        if (url.startsWith(base) && (next === '/' || next === '?' || next === '#')) {
            return url.slice(base.length) || '/';
        }
        return url;
    }

    /**
     * Determine how to process an incoming request by checking if it's for a static resource or a regular HTTP request.
     * @param {Request} request A request
     * @param {Response} response A response
     */
    async handleRequest(request: Request, response: Response): Promise<void> {
        if (this.requestService.isStaticRequest(request)) {
            await this.handleStaticRequest(response, request);
        } else {
            await this.handleHttpRequest(request, response);
        }
    }

    /**
     * Handle requests to static resources by forwarding them to a proxy server,
     * determine which proxy server to use based on the request URL and forwards the request using the proxy's web method.
     * @param {Response} response A response
     * @param {Request} request A request
     */
    private async handleStaticRequest(response: Response, request: Request): Promise<void> {
        const serverName = this.getServerName(request.url);
        await this.proxyServers[serverName].forwardRequest(request, response);
    }

    /**
     * Handle WebSocket connection upgrade requests, determine which proxy server should handle the WebSocket request,
     * validate the WebSocket token, and forwards the request to the appropriate server with any necessary headers
     * @param {Request} request A request
     * @param {Socket} socket A socket
     * @param {Buffer} head Upgraded-protocol bytes the HTTP parser consumed with the handshake
     */
    private async handleWebSocketRequest(request: Request, socket: Socket, head?: Buffer): Promise<void> {
        const serverName = this.getServerName(request.url);
        const proxyRequest = new ProxyRequest();
        if (!(await this.wsRequestService.handle(request, proxyRequest))) {
            throw new ForbiddenException();
        }
        await this.proxyServers[serverName].forwardWebsocket(request, socket, {
            headers: proxyRequest.getKebabHeaders(),
            head
        });
    }

    /**
     * Process incoming HTTP requests by determining which backend service to forward the request to,
     * applying rate-limiting (throttling) checks, and ensuring that the appropriate headers are set.
     * It also handles custom throttling limits for specific routes
     * and ensures that the correct backend server handles the request.
     * @param {Request} request A request
     * @param {Response} response A response
     */
    private async handleHttpRequest(request: Request, response: Response): Promise<void> {
        const serverName = this.getServerName(request.url);
        const byPassRoutePrefixes = this.apiGatewayOption.bypassRoutePrefixes || [];
        if (byPassRoutePrefixes.some((prefix) => request.url.startsWith(`${prefix}`))) {
            await this.proxyServers[serverName].forwardRequest(request, response);
            return;
        }

        const routerDetail = this.swaggerService.getRouterDetail(
            serverName,
            request.method,
            this.removePath(serverName, request.url)
        );

        if (!routerDetail) {
            throw new MethodNotAllowedException();
        }

        // Apply the global IP ceiling before auth so unauthenticated/forbidden floods are capped too.
        // It marks the request, so checkLimitOfRequest below won't re-run it (no double-count).
        await this.throttlerService.checkGlobalIpRequest(request);

        const proxyRequest = new ProxyRequest();
        if (!(await this.requestService.handle(routerDetail, request, proxyRequest))) {
            throw new ForbiddenException();
        }
        await this.throttlerService.checkLimitOfRequest(routerDetail, request);
        if (this.throttlerService.checkRouterHasCustomLimit(routerDetail)) {
            response.on('finish', async () => {
                await this.throttlerService.increaseRouterLimit(routerDetail, request, response);
            });
        }
        await this.proxyServers[serverName].forwardRequest(request, response, {
            headers: proxyRequest.getKebabHeaders()
        });
    }

    /**
     * Determine the correct proxy server (or backend service) to handle a request based on the URL,
     * check the URL for a matching prefix from a list of predefined server prefixes and returns the corresponding server name
     * @param {string} url A URL
     * @returns {string} Return server's name
     */
    getServerName(url: string): string {
        // Direct prefixes are evaluated before normal prefixes (FR-006): on overlap the direct
        // (retain) owner wins. The matched prefix is preserved by removePath (leading-only strip).
        for (const directPrefix of this.directPrefixServers) {
            if (matchesPrefixSegment(url, directPrefix)) {
                return this.directPrefixOwner[directPrefix];
            }
        }
        let serverName: string;
        for (const prefix of this.prefixServers) {
            if (matchesPrefixSegment(url, prefix)) {
                serverName = prefix;
                break;
            }
        }
        if (!serverName || (serverName && !this.swaggerService.apiDocs[serverName])) {
            if (this.hasDefaultServer) {
                return DEFAULT_SERVER_NAME;
            }
            throw new ServiceUnavailableException();
        }

        return serverName;
    }
}
