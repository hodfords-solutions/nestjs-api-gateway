export type McpOption = {
    enabled: boolean;
    path?: string;
    allowedServices?: string[];
    allowedOperations?: string[];
    serverInfo?: {
        name?: string;
        version?: string;
    };
};
