import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DocumentType } from '../types/document.type';
import { RouterDetail, RouterPathType } from '../types/router-path.type';
import { EndpointDetail } from '../types/endpoint-detail.type';
import { match } from 'path-to-regexp';
import camelcaseKeys from 'camelcase-keys';
import { HttpService } from '@nestjs/axios';
import { ApiServiceDetail } from '../types/api-service.type';
import { firstValueFrom } from 'rxjs';
import { getPathFromUrl } from '../helpers/string.helper';
import { DEFAULT_SERVER_NAME } from '../constants/default-server-name.constant';
import { API_GATEWAY_OPTION } from '../../constants/api-gateway.constant';
import { ApiGatewayOption } from '../../types/api-gateway-option.type';

@Injectable()
export class OpenApiService {
    private logger = new Logger(OpenApiService.name);
    public apiDocs: { [key in string]: EndpointDetail } = {};
    public originDocs: { [key in string]: any } = {};

    /**
     * Resolves once the initial load of every service's API document has settled,
     * so consumers can wait for docs to be available before using them.
     */
    private markReady!: () => void;
    public readonly ready: Promise<void> = new Promise<void>((resolve) => {
        this.markReady = resolve;
    });

    constructor(
        private httpService: HttpService,
        @Inject(API_GATEWAY_OPTION) private apiGatewayOption: ApiGatewayOption
    ) {}

    /**
     * Signal that the initial load of all API documents has completed.
     */
    markInitialLoadComplete(): void {
        this.markReady();
    }

    async getServiceDetail(apiService: ApiServiceDetail): Promise<void> {
        const response = await firstValueFrom(this.httpService.get(apiService.docUrl));
        if (response.status !== HttpStatus.OK) {
            this.logger.error(`Can't get detail of ${apiService.prefix}`);
            this.logger.error(response);
            return;
        }

        this.originDocs[apiService.prefix] = response.data;
        this.apiDocs[apiService.prefix] = this.getEndpointDetail(apiService.docUrl, response.data);
    }

    getRouterDetail(serverName: string, method: string, url: string): RouterDetail {
        const routers = this.apiDocs[serverName].router[method.toLowerCase()];
        const path = getPathFromUrl(url);
        for (const router of routers) {
            if (router.pathMatch(path)) {
                return router;
            }
        }
    }

    getEndpointDetail(docUrl: string, doc: DocumentType): EndpointDetail {
        const paths: RouterPathType = {
            get: [],
            post: [],
            delete: [],
            patch: [],
            put: [],
            /*
             * For oidc purposes
             **/
            options: [],
            head: [],
            search: []
        };
        for (const router in doc.paths) {
            for (const method in doc.paths[router]) {
                const apiDetail = camelcaseKeys(doc.paths[router][method]);
                const patchMatch = match(apiDetail.xRouterPath || this.convertToExpressPath(router), {
                    decode: decodeURIComponent
                });

                paths[method].push({
                    operationId: apiDetail.operationId,
                    description: apiDetail.description,
                    path: router,
                    isBearerAuth: this.checkRouterNeedBearerToken(apiDetail),
                    isApiKeyAuth: this.checkRouterNeedApiKey(apiDetail),
                    routerPath: apiDetail.xRouterPath || this.convertToExpressPath(router),
                    pathMatch: patchMatch,
                    rateLimits: apiDetail.xRateLimits || [],
                    extra: this.getExtraDetails(apiDetail)
                });
            }
        }
        return {
            title: doc.info.title,
            version: doc.info.version,
            docUrl: docUrl,
            router: paths
        };
    }

    getExtraDetails(apiDetail: any): NodeJS.Dict<any> {
        const extraDetail = {};
        for (const key in apiDetail) {
            if (!['parameters', 'responses', 'xRateLimits', 'xRouterPath'].includes(key)) {
                extraDetail[key] = apiDetail[key];
            }
        }

        return extraDetail;
    }

    checkRouterNeedBearerToken(apiDetail): boolean {
        if (!apiDetail.security) {
            return false;
        }
        for (const security of apiDetail.security) {
            if (security['bearer']) {
                return true;
            }
            for (const securityKey of this.apiGatewayOption.openApiSecurityKeys) {
                if (security[securityKey]) {
                    return true;
                }
            }
        }
        return false;
    }

    checkRouterNeedApiKey(apiDetail): boolean {
        if (!apiDetail.security) {
            return false;
        }
        for (const security of apiDetail.security) {
            if (!this.apiGatewayOption.openApiSecurityApiKeys?.length) {
                return false;
            }

            for (const securityKey of this.apiGatewayOption.openApiSecurityApiKeys) {
                if (security[securityKey]) {
                    return true;
                }
            }
        }
        return false;
    }

    convertToExpressPath(path: string): string {
        const swaggerParamRegex = /\{(\w+)\}/g;
        return path.replace(swaggerParamRegex, ':$1');
    }

    getDocumentDetailsForUI(): NodeJS.Dict<any> {
        const details = [];
        let defaultDoc: string = '';
        for (const server in this.apiDocs) {
            details.push({
                title: server,
                slug: server,
                url: 'document-json?type=' + server
            });
            defaultDoc = server;
        }
        return {
            details: JSON.stringify(details),
            defaultDoc,
            scalarOptions: JSON.stringify(this.apiGatewayOption.scalarOptions || {})
        };
    }

    async getDocument(server: string): Promise<any> {
        const { data: document } = await firstValueFrom(this.httpService.get(this.apiDocs[server].docUrl));
        if (!document.components.securitySchemes) {
            document.components.securitySchemes = {};
        }
        document.components.securitySchemes.bearer = {
            scheme: 'bearer',
            bearerFormat: 'JWT',
            type: 'http'
        };
        this.removeSecuritySchemes(document.components.securitySchemes);
        this.removeHeader(document);
        for (const path in document.paths) {
            for (const method in document.paths[path]) {
                if (
                    this.apiGatewayOption.restful?.hideDocumentIds?.includes(document.paths[path][method].operationId)
                ) {
                    delete document.paths[path];
                    continue;
                }
                const securities = document.paths[path][method].security || [];
                for (const securityKey of this.apiGatewayOption.openApiSecurityKeys) {
                    this.changeSecurityOfPath(securities, securityKey, 'bearer');
                }
            }
        }
        if (server !== DEFAULT_SERVER_NAME) {
            document.servers = [
                {
                    url: '/' + server
                }
            ];
        }
        return document;
    }

    removeHeader(document: any) {
        for (const path in document.paths) {
            for (const method in document.paths[path]) {
                document.paths[path][method].parameters = document.paths[path][method].parameters.filter((param) => {
                    return (
                        param.in !== 'header' ||
                        !this.apiGatewayOption.excludeHeaders.includes(param.name.toLowerCase())
                    );
                });
            }
        }
    }

    removeSecuritySchemes(securitySchemes): void {
        for (const key in securitySchemes) {
            if (key.startsWith('auth-')) {
                delete securitySchemes[key];
            }
        }
    }

    changeSecurityOfPath(securities: NodeJS.Dict<any>[], from: string, to: string): void {
        for (const security of securities) {
            for (const securityName in security) {
                if (securityName === from) {
                    delete security[securityName];
                    security[to] = [];
                }
            }
        }
    }
}
