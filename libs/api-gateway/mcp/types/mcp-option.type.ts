import { RouterDetail } from '../../restful/types/router-path.type';

export type McpOption = {
    enabled: boolean;
    path?: string;
    allowedServices?: string[];
    allowedOperations?: string[];
    filter?: (serviceName: string, routerDetail: RouterDetail) => boolean;
    serverInfo?: {
        name?: string;
        version?: string;
    };
};
