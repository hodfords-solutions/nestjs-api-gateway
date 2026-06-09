import { RouterDetail } from '../../restful/types/router-path.type';

export type McpParameterFilterContext = {
    serviceName: string;
    path: string;
    method: string;
};

export type McpToolNameContext = {
    serviceName: string;
    method: string;
    operationId: string;
    path: string;
    /** The tool name produced by the default naming strategy. */
    defaultName: string;
};

export type McpOption = {
    enabled: boolean;
    path?: string;
    allowedServices?: string[];
    allowedOperations?: string[];
    filter?: (serviceName: string, routerDetail: RouterDetail) => boolean;
    parameterFilter?: (param: any, context: McpParameterFilterContext) => boolean;
    toolName?: (context: McpToolNameContext) => string;
    serverInfo?: {
        name?: string;
        version?: string;
    };
};
