import { RouterDetail } from '../../restful/types/router-path.type';

export type McpParameterFilterContext = {
    serviceName: string;
    path: string;
    method: string;
};

export type McpOption = {
    enabled: boolean;
    path?: string;
    allowedServices?: string[];
    allowedOperations?: string[];
    filter?: (serviceName: string, routerDetail: RouterDetail) => boolean;
    parameterFilter?: (param: any, context: McpParameterFilterContext) => boolean;
    serverInfo?: {
        name?: string;
        version?: string;
    };
};
