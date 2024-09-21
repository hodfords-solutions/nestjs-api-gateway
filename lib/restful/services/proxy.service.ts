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
import Server, { createProxyServer } from '@squarecloud/http-proxy';
import { Request, Response } from 'express';
import { RequestService } from './request.service';
import { ThrottlerService } from '../../throttlers/services/throttler.service';
import { ClientRequest, ServerResponse } from 'http';
import { DEFAULT_SERVER_NAME } from '../constants/default-server-name.constant';
import { HttpAdapterHost } from '@nestjs/core';
import { Socket } from 'node:net';
import { WsRequestService } from './ws-request.service';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';
import { ProxyRequest } from '../models/proxy-request.model';

@Injectable()
export class ProxyService implements OnModuleInit {
    private logger = new Logger(ProxyService.name);
    private proxyServers: { [key in string]: Server } = {};
    private prefixServers: string[] = [];
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
        serverInstance.getHttpServer().on('upgrade', async (request, socket) => {
            try {
                await this.handleWebSocketRequest(request, socket);
            } catch (e) {
                console.error(e);
            }
        });

        for (const apiService of this.apiGatewayOption.apiServices) {
            if (apiService.prefix === DEFAULT_SERVER_NAME) {
                this.hasDefaultServer = true;
            }
            this.swaggerService
                .getServiceDetail(apiService)
                .then(() => {
                    this.logger.log(`Start ${apiService.prefix} successfully.`);
                })
                .catch((error) => {
                    console.error(error);
                    this.logger.error(`Start ${apiService.prefix} failed. ${error.message}`);
                });
            this.prefixServers.push(apiService.prefix);
            this.createProxyServer(apiService);
        }
    }

    /**
     * Set up a proxy server for a given API service, handling both HTTP and WebSocket requests,
     * configure the proxy to forward requests to the target service
     * and also manages error handling and request modification
     * @param {ApiServiceDetail} apiService API Service Detail
     */
    private createProxyServer(apiService: ApiServiceDetail): void {
        this.proxyServers[apiService.prefix] = createProxyServer({
            target: apiService.host,
            ws: true
        });
        this.proxyServers[apiService.prefix].on('proxyReq', (proxyReq, req: Request, res: Response) => {
            this.rewritePath(proxyReq, apiService.prefix);
            const contentType: string = req.headers['content-type'];
            if (contentType && contentType.startsWith('multipart/form-data;')) {
                return;
            }
            if (req.body) {
                const bodyData = JSON.stringify(req.body);
                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }
        });
        this.proxyServers[apiService.prefix].on('error', (error, req, res: ServerResponse) => {
            const errorResponse = {
                message: 'Service unavailable.'
            };
            // eslint-disable-next-line @typescript-eslint/naming-convention
            res.writeHead(HttpStatus.SERVICE_UNAVAILABLE, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(errorResponse));
        });
    }

    /**
     * Modify the path of an incoming request by removing a specific prefix from it
     * @param {ClientRequest} request A request
     * @param {string} prefix A prefix
     */
    private rewritePath(request: ClientRequest, prefix: string): void {
        request.path = this.removePath(prefix, request.path);
    }

    /**
     * Remove the specified prefix from the URL.
     * @param {string} prefix A Prefix
     * @param {string} url A URL
     * @returns {string} The URL is properly cleaned up before being forwarded to a backend service
     */
    private removePath(prefix: string, url: string): string {
        return url.replace(`/${prefix}`, '') || '/';
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
    private handleStaticRequest(response: Response, request: Request): void {
        const serverName = this.getServerName(request.url);
        this.proxyServers[serverName].web(request, response);
    }

    /**
     * Handle WebSocket connection upgrade requests, determine which proxy server should handle the WebSocket request,
     * validate the WebSocket token, and forwards the request to the appropriate server with any necessary headers
     * @param {Request} request A request
     * @param {Socket} socket A socket
     */
    private async handleWebSocketRequest(request: Request, socket: Socket): Promise<void> {
        const serverName = this.getServerName(request.url);
        const proxyRequest = new ProxyRequest();
        if (!(await this.wsRequestService.handle(request, proxyRequest))) {
            throw new ForbiddenException();
        }
        await this.proxyServers[serverName].ws(request, socket, { headers: proxyRequest.getKebabHeaders() });
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
        const routerDetail = this.swaggerService.getRouterDetail(
            serverName,
            request.method,
            this.removePath(serverName, request.url)
        );

        if (!routerDetail) {
            throw new MethodNotAllowedException();
        }

        await this.throttlerService.checkLimitOfRequest(routerDetail, request);
        const proxyRequest = new ProxyRequest();
        if (!(await this.requestService.handle(routerDetail, request, proxyRequest))) {
            throw new ForbiddenException();
        }
        await this.proxyServers[serverName].web(request, response, { headers: proxyRequest.getKebabHeaders() });

        if (this.throttlerService.checkRouterHasCustomLimit(routerDetail)) {
            response.on('finish', async () => {
                await this.throttlerService.increaseRouterLimit(routerDetail, request, response);
            });
        }
    }

    /**
     * Determine the correct proxy server (or backend service) to handle a request based on the URL,
     * check the URL for a matching prefix from a list of predefined server prefixes and returns the corresponding server name
     * @param {string} url A URL
     * @returns {string} Return server's name
     */
    getServerName(url: string): string {
        let serverName: string;
        for (const prefix of this.prefixServers) {
            if (url.startsWith(prefix) || url.startsWith(`/${prefix}`)) {
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
