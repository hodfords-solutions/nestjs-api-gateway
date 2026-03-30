import { RouterDetail } from '../../restful/types/router-path.type';

export type McpToolDefinition = {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    serviceName: string;
    httpMethod: string;
    path: string;
    routerDetail: RouterDetail;
};
